import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AITaskType } from '../../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../../infrastructure/ai-router/ai-router.service';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { TaskStatus, RenderQuality, FrameType } from '../../dto';
import { randomUUID } from 'crypto';
import { FrameGenService } from './frame-gen.service';
import { PromptBundleFactoryService } from '../foundation/prompt-bundle-factory.service';

@Injectable()
export class VideoRenderService {
  private readonly logger = new Logger(VideoRenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly configService: ConfigService,
    private readonly storage: StorageService,
    private readonly frameGenService: FrameGenService,
    private readonly bundleFactory: PromptBundleFactoryService,
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
    promptBundle?: {
      prompt?: string;
      videoPrompt?: string;
      sceneFramePrompt?: string;
      firstFramePrompt?: string;
      lastFramePrompt?: string;
    },
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

    const frameContext = await this.resolveRenderFrameContext(userId, node, promptBundle);
    if (!frameContext.lastFrameUrl) {
      throw new BadRequestException('系统未能自动生成当前镜头的目标锚点帧，请检查模型服务状态后重试。');
    }
    if (!frameContext.isFirstMainNode && !frameContext.firstFrameUrl) {
      throw new BadRequestException('系统未能自动生成上一镜头承接帧，请检查模型服务状态后重试。');
    }

    // Update node status to processing
    await this.prisma.flowNode.update({
      where: { id: nodeId },
      data: { renderStatus: TaskStatus.PROCESSING, renderedVideoUrl: null },
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
          firstFrameUrl: frameContext.firstFrameUrl,
          lastFrameUrl: frameContext.lastFrameUrl,
          prompt: frameContext.videoPrompt,
          negativePrompt: frameContext.negativePrompt,
          isFirstMainNode: frameContext.isFirstMainNode,
          previousNodeId: frameContext.previousNodeId,
        } as any,
        status: TaskStatus.PROCESSING,
        progress: 5,
        startedAt: new Date(),
      },
    });

    // Start async render process
    this.executeRender(taskRecord.id, nodeId, userId, {
      quality,
      stylePresetId,
      flowProjectId: node.flowProjectId,
      firstFrameUrl: frameContext.firstFrameUrl,
      lastFrameUrl: frameContext.lastFrameUrl,
      prompt: frameContext.videoPrompt,
      negativePrompt: frameContext.negativePrompt,
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
      flowProjectId: string;
      firstFrameUrl?: string | null;
      lastFrameUrl?: string | null;
      prompt?: string | null;
      negativePrompt?: string | null;
    },
  ): Promise<void> {
    try {
      this.logger.log(`Starting render for task ${taskId}, node ${nodeId}`);

      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.PROCESSING,
          progress: 20,
        },
      });

      // Call AI Router to generate video
      const result = await this.aiRouter.execute(AITaskType.VIDEO_GEN, {
        firstFrameUrl: options.firstFrameUrl,
        lastFrameUrl: options.lastFrameUrl,
        prompt: options.prompt,
        negative_prompt: options.negativePrompt,
        quality: options.quality,
        stylePresetId: options.stylePresetId,
      }, userId);

      // Extract video URL from result
      const videoUrl = this.extractVideoUrl(result);

      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: {
          progress: 85,
        },
      });

      if (videoUrl) {
        const persistedVideoUrl = await this.persistRenderedVideo(
          videoUrl,
          userId,
          options.flowProjectId,
          nodeId,
        );

        // Update node with rendered video URL
        await this.prisma.flowNode.update({
          where: { id: nodeId },
          data: {
            renderedVideoUrl: persistedVideoUrl,
            renderStatus: TaskStatus.COMPLETED,
          },
        });

        // Update task status
        await this.prisma.taskRecord.update({
          where: { id: taskId },
          data: {
            status: TaskStatus.COMPLETED,
            progress: 100,
            result: { videoUrl: persistedVideoUrl, sourceVideoUrl: videoUrl } as any,
            completedAt: new Date(),
          },
        });

        this.logger.log(`Render completed for node ${nodeId}: ${persistedVideoUrl}`);
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
            progress: 100,
            result: { videoUrl: placeholderUrl } as any,
            completedAt: new Date(),
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
          progress: 100,
          error: error.message,
          completedAt: new Date(),
        } as any,
      });
    }
  }

  private async resolveRenderFrameContext(
    userId: string,
    node: any,
    promptBundle?: {
      prompt?: string;
      videoPrompt?: string;
      sceneFramePrompt?: string;
      firstFramePrompt?: string;
      lastFramePrompt?: string;
    },
  ) {
    const firstMainNode = await this.prisma.flowNode.findFirst({
      where: {
        flowProjectId: node.flowProjectId,
        parentNodeId: null,
      },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    });
    const isFirstMainNode = firstMainNode?.id === node.id;
    const currentBundle = this.bundleFactory.create(
      {
        scriptSegment: node.scriptSegment,
        videoPrompt: promptBundle?.videoPrompt || promptBundle?.prompt || node.prompt,
        sceneFramePrompt: promptBundle?.sceneFramePrompt,
        firstFramePrompt: promptBundle?.firstFramePrompt,
        lastFramePrompt: promptBundle?.lastFramePrompt,
      },
      String(node.scriptSegment || node.prompt || promptBundle?.videoPrompt || '当前镜头').trim(),
      null,
    );
    if (isFirstMainNode) {
      let firstFrameUrl = node.firstFrameUrl || null;
      let lastFrameUrl = node.lastFrameUrl || null;
      if (!firstFrameUrl) {
        firstFrameUrl = (await this.frameGenService.generateFrame(
          userId,
          node.id,
          FrameType.FIRST,
          currentBundle.firstFramePrompt,
        )).frameUrl;
      }
      if (!lastFrameUrl) {
        lastFrameUrl = (await this.frameGenService.generateFrame(
          userId,
          node.id,
          FrameType.LAST,
          currentBundle.lastFramePrompt,
        )).frameUrl;
      }
      const targetVideoModel =
        this.configService.get<string>('SILICONFLOW_MODEL_VIDEO') ||
        this.configService.get<string>('GEMINI_MODEL_VIDEO') ||
        '';
      return {
        isFirstMainNode: true,
        previousNodeId: null,
        firstFrameUrl,
        lastFrameUrl,
        videoPrompt: this.bundleFactory.toVideoModelPrompt(currentBundle.videoPrompt, targetVideoModel),
        negativePrompt: '避免主体漂移，避免人物换脸，避免背景跳变，避免动作畸形，避免低清晰度',
      };
    }

    // 非首主节点：优先使用父节点作为上一个节点；若不存在父节点，则按 orderIndex 找前序主线节点
    let previousNode: any | null = null;
    if (node.parentNodeId) {
      previousNode = await this.prisma.flowNode.findUnique({
        where: { id: node.parentNodeId },
      });
    }
    if (!previousNode) {
      previousNode = await this.prisma.flowNode.findFirst({
        where: {
          flowProjectId: node.flowProjectId,
          orderIndex: { lt: node.orderIndex },
        },
        orderBy: { orderIndex: 'desc' },
      });
    }

    const previousBundle = previousNode
      ? this.bundleFactory.create(
          {
            scriptSegment: previousNode.scriptSegment,
            videoPrompt: previousNode.prompt,
          },
          String(previousNode.scriptSegment || previousNode.prompt || '上一镜头').trim(),
          null,
        )
      : null;

    // 约定：视频生成使用“上一节点画面 -> 当前节点画面”
    let firstFrameUrl =
      previousNode?.lastFrameUrl ||
      previousNode?.firstFrameUrl ||
      null;
    if (!firstFrameUrl && previousNode) {
      if (firstMainNode?.id === previousNode.id) {
        firstFrameUrl = (
          await this.frameGenService.generateFrame(
            userId,
            previousNode.id,
            FrameType.LAST,
            previousBundle?.lastFramePrompt || previousBundle?.sceneFramePrompt || previousNode.prompt,
          )
        ).frameUrl;
      } else {
        firstFrameUrl = (
          await this.frameGenService.generateFrame(
            userId,
            previousNode.id,
            FrameType.FIRST,
            previousBundle?.sceneFramePrompt || previousNode.prompt,
          )
        ).frameUrl;
      }
    }

    let lastFrameUrl = node.firstFrameUrl || node.lastFrameUrl || null;
    if (!lastFrameUrl) {
      lastFrameUrl = (
        await this.frameGenService.generateFrame(
          userId,
          node.id,
          FrameType.FIRST,
          currentBundle.sceneFramePrompt,
        )
      ).frameUrl;
    }

    const targetVideoModel =
      this.configService.get<string>('SILICONFLOW_MODEL_VIDEO') ||
      this.configService.get<string>('GEMINI_MODEL_VIDEO') ||
      '';
    return {
      isFirstMainNode: false,
      previousNodeId: previousNode?.id || null,
      firstFrameUrl,
      lastFrameUrl,
        videoPrompt: this.bundleFactory.toVideoModelPrompt(currentBundle.videoPrompt, targetVideoModel),
      negativePrompt: '避免主体漂移，避免人物换脸，避免背景跳变，避免动作畸形，避免低清晰度',
    };
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

  private async persistRenderedVideo(
    videoUrl: string,
    userId: string,
    flowProjectId: string,
    nodeId: string,
  ): Promise<string> {
    // Already in our storage domain, keep as-is
    if (this.isLikelyInternalStorageUrl(videoUrl)) {
      return videoUrl;
    }

    const response = await this.fetchVideoWithFallback(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download generated video: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const key = `renders/${userId}/${flowProjectId}/${nodeId}-${randomUUID()}.mp4`;

    return this.storage.upload(buffer, key, {
      'Content-Type': 'video/mp4',
    });
  }

  private isLikelyInternalStorageUrl(url: string): boolean {
    const minioEndpoint = this.configService.get<string>('MINIO_ENDPOINT', 'localhost');
    try {
      const parsed = new URL(url);
      if (parsed.hostname === minioEndpoint) return true;
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true;
      return false;
    } catch {
      return false;
    }
  }

  private async fetchVideoWithFallback(url: string): Promise<Response> {
    // First attempt: raw URL
    let response = await fetch(url, {
      headers: {
        'User-Agent': 'Viewpoint-Prism-Pro/1.0',
      },
    });
    if (response.ok) return response;

    // Fallback for some OSS links that encode '/' in path (outputs%2Fxxx.mp4)
    try {
      const parsed = new URL(url);
      if (/%2F/i.test(parsed.pathname)) {
        const fallbackUrl = `${parsed.origin}${decodeURIComponent(parsed.pathname)}${parsed.search}`;
        response = await fetch(fallbackUrl, {
          headers: {
            'User-Agent': 'Viewpoint-Prism-Pro/1.0',
          },
        });
      }
    } catch {
      // keep original response
    }

    return response;
  }
}
