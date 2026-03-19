import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../queue.constants';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreationPreviewService } from '../../../modules/prism-creation/services/creation-preview.service';

interface PreviewJobData {
  nodeId: string;
  userId: string;
  projectId: string;
  flowProjectId: string;
  taskRecordId?: string;
}

@Processor(QUEUE_NAMES.PREVIEW)
export class PreviewProcessor {
  private readonly logger = new Logger(PreviewProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creationPreviewService: CreationPreviewService,
  ) {}

  @Process()
  async handlePreview(job: Job<PreviewJobData>) {
    const { nodeId, userId, projectId, flowProjectId, taskRecordId } = job.data;

    this.logger.log(`Starting preview generation for node ${nodeId}`);

    try {
      await job.progress(5);
      await this.updateTaskRecord(taskRecordId, { progress: 5, status: 'PROCESSING' });

      // Get flow node with frame URLs
      const node = await this.prisma.flowNode.findUnique({
        where: { id: nodeId },
        include: {
          flowProject: true,
        },
      });

      if (!node) {
        throw new Error(`Flow node ${nodeId} not found`);
      }

      if (!node.firstFrameUrl || !node.lastFrameUrl) {
        throw new Error('Node must have first and last frames before generating preview');
      }

      // Get node metadata for prompt
      const projectMeta = (node.flowProject?.stylePreset && typeof node.flowProject.stylePreset === 'object')
        ? (node.flowProject.stylePreset as Record<string, any>)
        : {};
      const nodesMeta = (projectMeta.nodesMeta && typeof projectMeta.nodesMeta === 'object')
        ? (projectMeta.nodesMeta as Record<string, any>)
        : {};
      const nodeMeta = (nodesMeta[nodeId] && typeof nodesMeta[nodeId] === 'object')
        ? (nodesMeta[nodeId] as Record<string, any>)
        : {};

      // Generate preview
      const result = await this.creationPreviewService.generateNodePreview({
        nodeId,
        userId,
        projectId,
        flowProjectId,
        firstFrameUrl: node.firstFrameUrl,
        lastFrameUrl: node.lastFrameUrl,
        prompt: node.prompt || node.scriptSegment || '',
        continuityNotes: nodeMeta.continuityNotes,
        characterAnchor: nodeMeta.characterAnchor,
        duration: 3, // default 3 seconds
      });

      await job.progress(100);
      await this.updateTaskRecord(taskRecordId, {
        progress: 100,
        status: 'COMPLETED',
        completedAt: new Date(),
        result: { previewGridUrl: result.previewGridUrl, frameUrls: result.frameUrls },
      });

      this.logger.log(`Preview generated for node ${nodeId}: ${result.previewGridUrl}`);

      return {
        success: true,
        nodeId,
        previewGridUrl: result.previewGridUrl,
        frameUrls: result.frameUrls,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Preview generation failed for node ${nodeId}: ${message}`, error instanceof Error ? error.stack : undefined);

      await this.updateTaskRecord(taskRecordId, {
        status: 'FAILED',
        error: message,
        completedAt: new Date(),
      });

      await this.prisma.flowNode.update({
        where: { id: nodeId },
        data: { previewStatus: 'FAILED' },
      });

      throw error;
    }
  }

  private async updateTaskRecord(
    taskRecordId: string | undefined,
    data: Record<string, unknown>,
  ) {
    if (!taskRecordId) return;
    await this.prisma.taskRecord.update({
      where: { id: taskRecordId },
      data: data as any,
    });
  }
}
