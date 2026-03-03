import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { TaskStatus, RenderQuality } from '../dto';

@Injectable()
export class VideoRenderService {
  private readonly logger = new Logger(VideoRenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Enqueue a render task for a node
   * @param userId - User ID
   * @param nodeId - Flow node ID
   * @param quality - Render quality (draft or high)
   * @param stylePresetId - Optional style preset ID
   * @returns Task ID and status
   */
  async enqueueRender(
    userId: string,
    nodeId: string,
    quality: RenderQuality = RenderQuality.DRAFT,
    stylePresetId?: string,
  ): Promise<{ taskId: string; nodeId: string; status: string }> {
    // Get the node
    const node = await this.prisma.flowNode.findUnique({
      where: { id: nodeId },
      include: { flowProject: true },
    });

    if (!node) {
      throw new NotFoundException('Node not found');
    }

    // Check if both frames are available
    if (!node.firstFrameUrl || !node.lastFrameUrl) {
      this.logger.warn(`Node ${nodeId} does not have both frames, proceeding anyway`);
    }

    // Check if frames are locked - if not, we should generate them first
    if (!node.firstFrameLocked || !node.lastFrameLocked) {
      this.logger.warn(`Node ${nodeId} has unlocked frames, rendering may use generated frames`);
    }

    // Update node status to processing
    await this.prisma.flowNode.update({
      where: { id: nodeId },
      data: { renderStatus: TaskStatus.PROCESSING },
    });

    // Create task record
    const taskRecord = await this.prisma.taskRecord.create({
      data: {
        userId,
        type: 'PRISMFLOW_NODE_RENDER',
        payload: {
          nodeId,
          flowProjectId: node.flowProjectId,
          quality,
          stylePresetId,
          firstFrameUrl: node.firstFrameUrl,
          lastFrameUrl: node.lastFrameUrl,
          prompt: node.prompt,
        } as any,
        status: TaskStatus.PENDING,
      },
    });

    // Start async render process
    this.executeRender(taskRecord.id, nodeId, userId, {
      quality,
      stylePresetId,
      firstFrameUrl: node.firstFrameUrl,
      lastFrameUrl: node.lastFrameUrl,
      prompt: node.prompt,
    }).catch((error) => {
      this.logger.error(`Render failed for node ${nodeId}: ${error.message}`);
    });

    this.logger.log(`Enqueued render task ${taskRecord.id} for node ${nodeId}`);

    return {
      taskId: taskRecord.id,
      nodeId,
      status: 'queued',
    };
  }

  /**
   * Execute the render process asynchronously
   */
  private async executeRender(
    taskId: string,
    nodeId: string,
    userId: string,
    options: {
      quality: RenderQuality;
      stylePresetId?: string;
      firstFrameUrl?: string | null;
      lastFrameUrl?: string | null;
      prompt?: string | null;
    },
  ): Promise<void> {
    try {
      this.logger.log(`Starting render for task ${taskId}, node ${nodeId}`);

      // Call AI Router to generate video
      const result = await this.aiRouter.execute(AITaskType.VIDEO_GEN, {
        firstFrameUrl: options.firstFrameUrl,
        lastFrameUrl: options.lastFrameUrl,
        prompt: options.prompt,
        quality: options.quality,
        stylePresetId: options.stylePresetId,
      }, userId);

      // Extract video URL from result
      const videoUrl = this.extractVideoUrl(result);

      if (videoUrl) {
        // Update node with rendered video URL
        await this.prisma.flowNode.update({
          where: { id: nodeId },
          data: {
            renderedVideoUrl: videoUrl,
            renderStatus: TaskStatus.COMPLETED,
          },
        });

        // Update task status
        await this.prisma.taskRecord.update({
          where: { id: taskId },
          data: {
            status: TaskStatus.COMPLETED,
            result: { videoUrl } as any,
          },
        });

        this.logger.log(`Render completed for node ${nodeId}: ${videoUrl}`);
      } else {
        const allowPlaceholderFallback =
          this.configService.get<string>('CREATION_PLACEHOLDER_FALLBACK') === 'true';

        if (!allowPlaceholderFallback) {
          throw new Error('Video generation succeeded but provider returned empty video URL');
        }

        const placeholderUrl = `https://placehold.co/1280x720/2D2D3A/E91E8C?text=Rendered+Video+${nodeId.slice(0, 8)}`;

        await this.prisma.flowNode.update({
          where: { id: nodeId },
          data: {
            renderedVideoUrl: placeholderUrl,
            renderStatus: TaskStatus.COMPLETED,
          },
        });

        await this.prisma.taskRecord.update({
          where: { id: taskId },
          data: {
            status: TaskStatus.COMPLETED,
            result: { videoUrl: placeholderUrl } as any,
          },
        });

        this.logger.warn(
          `Using placeholder rendered video for node ${nodeId} because CREATION_PLACEHOLDER_FALLBACK=true`,
        );
      }
    } catch (error) {
      this.logger.error(`Render failed for task ${taskId}: ${error.message}`, error.stack);

      // Update node status to failed
      await this.prisma.flowNode.update({
        where: { id: nodeId },
        data: { renderStatus: TaskStatus.FAILED },
      });

      // Update task status
      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.FAILED,
          error: error.message,
        } as any,
      });
    }
  }

  /**
   * Extract video URL from AI provider result
   */
  private extractVideoUrl(result: any): string | null {
    // Try various common response formats
    if (result?.url) return result.url;
    if (result?.video_url) return result.video_url;
    if (result?.data?.[0]?.url) return result.data[0].url;
    if (result?.video?.url) return result.video.url;
    if (result?.output?.[0]) return result.output[0];

    // Return null to use placeholder
    return null;
  }
}
