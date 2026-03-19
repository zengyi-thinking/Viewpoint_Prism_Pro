import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { WsGateway } from '../../../infrastructure/websocket/ws.gateway';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';

@Injectable()
export class CreationRenderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly storage: StorageService,
    private readonly wsGateway: WsGateway,
    @InjectQueue(QUEUE_NAMES.RENDER) private readonly renderQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EXPORT) private readonly exportQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PREVIEW) private readonly previewQueue: Queue,
  ) {}

  async generateNodeImage(params: {
    userId: string;
    projectId: string;
    flowProjectId: string;
    nodeId: string;
    prompt: string;
    parentLastFrameUrl?: string | null;
  }) {
    const task = await this.prisma.taskRecord.create({
      data: {
        userId: params.userId,
        type: 'creation_image',
        payload: { nodeId: params.nodeId, flowProjectId: params.flowProjectId },
        status: 'PROCESSING',
        progress: 5,
        startedAt: new Date(),
      },
    });

    try {
      this.emitTaskProgress(params.userId, params.projectId, params.nodeId, 'creation_image', 10, '正在生成节点图片');
      const imageResult = await this.aiRouter.execute(
        AITaskType.IMAGE_GEN,
        {
          prompt: params.prompt,
          image_size: '1280x720',
          num_inference_steps: 24,
          guidance_scale: 7,
          negative_prompt:
            'text, chinese characters, calligraphy, title, logo, watermark, poster layout, typography, word overlay, low detail, fantasy mountains, floating clouds, abstract concept art',
        },
        params.userId,
      );

      const remoteUrl = String(imageResult?.imageUrl || imageResult?.url || '').trim();
      if (!remoteUrl) throw new Error('图片模型未返回可下载 URL');

      const response = await fetch(remoteUrl);
      if (!response.ok) throw new Error(`下载生成图片失败 (${response.status})`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const storageKey = this.storage.generateStoragePath(params.userId, params.projectId, 'creation-frames', `${params.nodeId}.png`);
      const uploadedUrl = await this.storage.upload(buffer, storageKey, { contentType: 'image/png' });

      await this.prisma.flowNode.update({
        where: { id: params.nodeId },
        data: {
          firstFrameUrl: params.parentLastFrameUrl || uploadedUrl,
          lastFrameUrl: uploadedUrl,
        },
      });

      await this.prisma.taskRecord.update({
        where: { id: task.id },
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedAt: new Date(),
          result: { imageUrl: uploadedUrl },
        },
      });

      this.wsGateway.emitToUser(params.userId, 'task:complete', {
        projectId: params.projectId,
        nodeId: params.nodeId,
        task: 'creation_image',
        result: { imageUrl: uploadedUrl, taskId: task.id },
        timestamp: new Date().toISOString(),
      });

      return { taskId: task.id, imageUrl: uploadedUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.taskRecord.update({
        where: { id: task.id },
        data: { status: 'FAILED', error: message, completedAt: new Date() },
      });
      this.wsGateway.emitToUser(params.userId, 'task:error', {
        projectId: params.projectId,
        nodeId: params.nodeId,
        task: 'creation_image',
        error: message,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async generateProjectAssetImage(params: {
    userId: string;
    projectId: string;
    prompt: string;
    category: 'character-assets' | 'scene-assets' | 'storyboard-assets';
    fileStem: string;
  }) {
    const imageResult = await this.aiRouter.execute(
      AITaskType.IMAGE_GEN,
      {
        prompt: params.prompt,
        image_size: '1280x720',
        num_inference_steps: 24,
        guidance_scale: 7,
        negative_prompt:
          'text, chinese characters, calligraphy, title, logo, watermark, poster layout, typography, word overlay, low detail',
      },
      params.userId,
    );

    const remoteUrl = String(imageResult?.imageUrl || imageResult?.url || '').trim();
    if (!remoteUrl) throw new Error('图片模型未返回可下载 URL');

    const response = await fetch(remoteUrl);
    if (!response.ok) throw new Error(`下载生成图片失败 (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const storageKey = this.storage.generateStoragePath(
      params.userId,
      params.projectId,
      params.category,
      `${params.fileStem}.png`,
    );

    return this.storage.upload(buffer, storageKey, { contentType: 'image/png' });
  }

  async enqueueNodeRender(params: { userId: string; projectId: string; flowProjectId: string; nodeId: string }) {
    const task = await this.prisma.taskRecord.create({
      data: {
        userId: params.userId,
        type: 'creation_render',
        payload: { nodeId: params.nodeId, flowProjectId: params.flowProjectId },
        status: 'PROCESSING',
        progress: 0,
        startedAt: new Date(),
      },
    });

    await this.appendRenderTask(params.flowProjectId, {
      taskId: task.id,
      type: 'node_render',
      nodeId: params.nodeId,
      status: 'PROCESSING',
      createdAt: new Date().toISOString(),
    });

    const job = await this.renderQueue.add({ ...params, taskRecordId: task.id });
    return { taskId: task.id, queueJobId: String(job.id) };
  }

  async enqueueProjectStitch(params: {
    userId: string;
    projectId: string;
    flowProjectId: string;
    composeOptions?: Record<string, unknown>;
  }) {
    const task = await this.prisma.taskRecord.create({
      data: {
        userId: params.userId,
        type: 'creation_stitch',
        payload: { flowProjectId: params.flowProjectId, composeOptions: params.composeOptions || {} } as any,
        status: 'PROCESSING',
        progress: 0,
        startedAt: new Date(),
      },
    });

    await this.appendRenderTask(params.flowProjectId, {
      taskId: task.id,
      type: 'project_stitch',
      status: 'PROCESSING',
      createdAt: new Date().toISOString(),
    });

    const job = await this.exportQueue.add({
      assetType: 'creation',
      assetId: params.flowProjectId,
      userId: params.userId,
      projectId: params.projectId,
      format: 'mp4',
      taskRecordId: task.id,
      composeOptions: params.composeOptions || {},
    });

    return { taskId: task.id, queueJobId: String(job.id) };
  }

  private async appendRenderTask(flowProjectId: string, task: Record<string, unknown>) {
    const flowProject = await this.prisma.prismFlowProject.findUnique({
      where: { id: flowProjectId },
      select: { stylePreset: true },
    });
    if (!flowProject) return;

    const meta =
      flowProject.stylePreset && typeof flowProject.stylePreset === 'object' && !Array.isArray(flowProject.stylePreset)
        ? ({ ...(flowProject.stylePreset as Record<string, unknown>) } as Record<string, unknown>)
        : ({ version: 'v2' } as Record<string, unknown>);
    const renderTasks = Array.isArray(meta.renderTasks) ? [...(meta.renderTasks as Record<string, unknown>[])] : [];
    renderTasks.unshift(task);
    meta.renderTasks = renderTasks.slice(0, 50);

    await this.prisma.prismFlowProject.update({
      where: { id: flowProjectId },
      data: { stylePreset: meta as any },
    });
  }

  private emitTaskProgress(userId: string, projectId: string, nodeId: string, task: string, progress: number, message: string) {
    this.wsGateway.emitToUser(userId, 'task:progress', {
      projectId,
      nodeId,
      task,
      progress,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Enqueue a preview generation task for a node
   */
  async enqueueNodePreview(params: {
    userId: string;
    projectId: string;
    flowProjectId: string;
    nodeId: string;
  }) {
    const task = await this.prisma.taskRecord.create({
      data: {
        userId: params.userId,
        type: 'creation_preview',
        payload: { nodeId: params.nodeId, flowProjectId: params.flowProjectId },
        status: 'PROCESSING',
        progress: 0,
        startedAt: new Date(),
      },
    });

    await this.appendRenderTask(params.flowProjectId, {
      taskId: task.id,
      type: 'node_preview',
      nodeId: params.nodeId,
      status: 'PROCESSING',
      createdAt: new Date().toISOString(),
    });

    const job = await this.previewQueue.add({ ...params, taskRecordId: task.id });
    return { taskId: task.id, queueJobId: String(job.id) };
  }

  /**
   * Get node preview data
   */
  async getNodePreview(nodeId: string) {
    const node = await this.prisma.flowNode.findUnique({
      where: { id: nodeId },
      select: {
        previewGridUrl: true,
        previewStatus: true,
        previewFrames: true,
      },
    });
    return node;
  }
}
