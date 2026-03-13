import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../queue.constants';
import { AiRouterService } from '../../ai-router/ai-router.service';
import { StorageService } from '../../storage/storage.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WsGateway } from '../../websocket/ws.gateway';
import { AITaskType } from '../../ai-router/ai-router.interface';

interface RenderJobData {
  nodeId: string;
  userId: string;
  projectId: string;
  flowProjectId: string;
  taskRecordId?: string;
}

@Processor(QUEUE_NAMES.RENDER)
export class RenderProcessor {
  private readonly logger = new Logger(RenderProcessor.name);

  constructor(
    private readonly aiRouterService: AiRouterService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  @Process()
  async handleRender(job: Job<RenderJobData>) {
    const { nodeId, userId, projectId, flowProjectId, taskRecordId } = job.data;

    this.logger.log(`Starting render for node ${nodeId}`);

    try {
      await job.progress(10);
      await this.updateTaskRecord(taskRecordId, { progress: 10, status: 'PROCESSING' });
      this.emitProgress(userId, projectId, nodeId, 'render', 10, 'Loading node data...');

      // Get flow node with project data
      const node = await this.prisma.flowNode.findUnique({
        where: { id: nodeId },
        include: {
          flowProject: true,
        },
      });

      if (!node) {
        throw new Error(`Flow node ${nodeId} not found`);
      }

      // Update node render status
      await this.prisma.flowNode.update({
        where: { id: nodeId },
        data: { renderStatus: 'PROCESSING' },
      });

      await job.progress(20);
      await this.updateTaskRecord(taskRecordId, { progress: 20, status: 'PROCESSING' });
      this.emitProgress(userId, projectId, nodeId, 'render', 20, 'Preparing render inputs...');

      // Check if we have first and last frames
      if (!node.firstFrameUrl || !node.lastFrameUrl) {
        throw new Error('Node must have first and last frames before rendering');
      }

      // Get frame images
      const firstFrameBuffer = await this.storageService.download(
        this.storageService.resolveStorageKey(node.firstFrameUrl),
      );
      const lastFrameBuffer = await this.storageService.download(
        this.storageService.resolveStorageKey(node.lastFrameUrl),
      );

      const firstFrameBase64 = firstFrameBuffer.toString('base64');
      const lastFrameBase64 = lastFrameBuffer.toString('base64');

      const projectMeta = (node.flowProject?.stylePreset && typeof node.flowProject.stylePreset === 'object')
        ? (node.flowProject.stylePreset as Record<string, any>)
        : {};
      const nodesMeta = (projectMeta.nodesMeta && typeof projectMeta.nodesMeta === 'object')
        ? (projectMeta.nodesMeta as Record<string, any>)
        : {};
      const nodeMeta = (nodesMeta[nodeId] && typeof nodesMeta[nodeId] === 'object')
        ? (nodesMeta[nodeId] as Record<string, any>)
        : {};

      const continuityPrompt = [
        String(nodeMeta.videoPrompt || '').trim(),
        String(nodeMeta.continuityNotes || '').trim(),
        this.serializeCharacterAnchor(nodeMeta.characterAnchor),
      ].filter(Boolean).join('\n');

      await job.progress(40);
      await this.updateTaskRecord(taskRecordId, { progress: 40, status: 'PROCESSING' });
      this.emitProgress(userId, projectId, nodeId, 'render', 40, 'Generating video...');

      // Call AI Router for video generation
      const renderResult = await this.aiRouterService.execute(
        AITaskType.VIDEO_GEN,
        {
          firstFrame: firstFrameBase64,
          lastFrame: lastFrameBase64,
          prompt:
            continuityPrompt ||
            node.prompt ||
            node.scriptSegment ||
            'Generate a smooth transition between these frames while preserving the same character identity and scene continuity',
          duration: 3, // 3 seconds default
          fps: 30,
        },
        userId,
      );

      await job.progress(80);
      await this.updateTaskRecord(taskRecordId, { progress: 80, status: 'PROCESSING' });
      this.emitProgress(userId, projectId, nodeId, 'render', 80, 'Saving rendered video...');

      // Save rendered video to storage
      const videoBuffer = Buffer.from(renderResult.video, 'base64');
      const storageKey = this.storageService.generateStoragePath(
        userId,
        projectId,
        'renders',
        `node-${nodeId}-${Date.now()}.mp4`,
      );
      const videoUrl = await this.storageService.upload(
        videoBuffer,
        storageKey,
        { contentType: 'video/mp4' },
      );

      // Update node with rendered video URL
      await this.prisma.flowNode.update({
        where: { id: nodeId },
        data: {
          renderedVideoUrl: videoUrl,
          renderStatus: 'COMPLETED',
        },
      });

      await job.progress(100);
      await this.updateTaskRecord(taskRecordId, {
        progress: 100,
        status: 'COMPLETED',
        completedAt: new Date(),
        result: { nodeId, videoUrl },
      });
      await this.updateFlowProjectRenderTask(flowProjectId, taskRecordId, {
        status: 'COMPLETED',
        videoUrl,
      });
      this.emitProgress(userId, projectId, nodeId, 'render', 100, 'Render completed');
      this.wsGateway.emitToUser(userId, 'task:complete', {
        projectId,
        nodeId,
        task: 'render',
        result: { nodeId, videoUrl, flowProjectId, taskRecordId },
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Render completed for node ${nodeId}`);

      return {
        success: true,
        nodeId,
        videoUrl,
      };
    } catch (error) {
      this.logger.error(`Render failed for node ${nodeId}: ${error.message}`, error.stack);
      await this.updateTaskRecord(taskRecordId, {
        status: 'FAILED',
        error: error.message,
        completedAt: new Date(),
      });

      await this.prisma.flowNode.update({
        where: { id: nodeId },
        data: { renderStatus: 'FAILED' },
      });
      await this.updateFlowProjectRenderTask(flowProjectId, taskRecordId, {
        status: 'FAILED',
        error: error.message,
      });

      this.emitError(userId, projectId, nodeId, 'render', error.message);

      throw error;
    }
  }




  private emitProgress(userId: string, projectId: string, nodeId: string, task: string, progress: number, message: string) {
    this.wsGateway.emitToUser(userId, 'task:progress', {
      projectId,
      nodeId,
      task,
      progress,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private emitError(userId: string, projectId: string, nodeId: string, task: string, error: string) {
    this.wsGateway.emitToUser(userId, 'task:error', {
      projectId,
      nodeId,
      task,
      error,
      timestamp: new Date().toISOString(),
    });
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

  private serializeCharacterAnchor(input: unknown): string {
    if (typeof input === 'string') {
      return input.trim();
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return '';
    }
    const value = input as Record<string, unknown>;
    return [
      value.identity ? `identity=${String(value.identity).trim()}` : '',
      value.hair ? `hair=${String(value.hair).trim()}` : '',
      value.outfit ? `outfit=${String(value.outfit).trim()}` : '',
      value.face ? `face=${String(value.face).trim()}` : '',
      value.prop ? `prop=${String(value.prop).trim()}` : '',
    ].filter(Boolean).join('; ');
  }

  private async updateFlowProjectRenderTask(
    flowProjectId: string,
    taskRecordId: string | undefined,
    patch: Record<string, unknown>,
  ) {
    if (!taskRecordId) return;
    const flowProject = await this.prisma.prismFlowProject.findUnique({
      where: { id: flowProjectId },
      select: { stylePreset: true },
    });
    if (!flowProject) return;

    const meta =
      flowProject.stylePreset && typeof flowProject.stylePreset === 'object' && !Array.isArray(flowProject.stylePreset)
        ? ({ ...(flowProject.stylePreset as Record<string, unknown>) } as Record<string, unknown>)
        : ({ version: 'v2' } as Record<string, unknown>);
    const renderTasks = Array.isArray(meta.renderTasks)
      ? (meta.renderTasks as Record<string, unknown>[]).map((item) =>
          item.taskId === taskRecordId ? { ...item, ...patch } : item,
        )
      : [];
    meta.renderTasks = renderTasks;

    await this.prisma.prismFlowProject.update({
      where: { id: flowProjectId },
      data: { stylePreset: meta as any },
    });
  }
}
