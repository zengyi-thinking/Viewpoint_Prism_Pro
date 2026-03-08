import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  ExportProjectDto,
  GenerateFrameDto,
  LockFrameDto,
  RenderFlowDto,
  RenderNodeDto,
  RenderQuality,
  StitchFlowDto,
  TaskStatus,
} from '../../dto';
import { CreationFlowService } from './creation-flow.service';
import { ExportService } from '../media/export.service';
import { FrameGenService } from '../media/frame-gen.service';
import { StitchService } from '../media/stitch.service';
import { VideoRenderService } from '../media/video-render.service';

type UnifiedTaskStatus = {
  taskId: string;
  type: 'render' | 'stitch' | 'export';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error: string | null;
  result: Record<string, any> | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

@Injectable()
export class CreationTaskOrchestratorService {
  private readonly logger = new Logger(CreationTaskOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowService: CreationFlowService,
    private readonly frameGenService: FrameGenService,
    private readonly videoRenderService: VideoRenderService,
    private readonly stitchService: StitchService,
    private readonly exportService: ExportService,
  ) {}

  async render(userId: string, videoId: string, dto: RenderFlowDto) {
    const project = await this.flowService.getOrCreateProject(userId, videoId);

    const node = await this.prisma.flowNode.findFirst({
      where: {
        id: dto.nodeId,
        flowProjectId: project.id,
      },
    });

    if (!node) {
      throw new NotFoundException('Node not found in this project');
    }

    await this.prisma.flowNode.update({
      where: { id: dto.nodeId },
      data: { renderStatus: TaskStatus.PROCESSING },
    });

    const taskRecord = await this.prisma.taskRecord.create({
      data: {
        userId,
        type: 'PRISMFLOW_RENDER',
        payload: {
          nodeId: dto.nodeId,
          flowProjectId: project.id,
          videoId,
          quality: dto.quality || RenderQuality.DRAFT,
          stylePresetId: dto.stylePresetId,
        } as any,
        status: TaskStatus.PENDING,
      },
    });

    await this.prisma.prismFlowProject.update({
      where: { id: project.id },
      data: { status: TaskStatus.PROCESSING },
    });

    this.logger.log(`Created render task ${taskRecord.id} for node ${dto.nodeId}`);
    return {
      taskId: taskRecord.id,
      nodeId: dto.nodeId,
      userId,
      videoId,
      projectId: project.id,
      quality: dto.quality || RenderQuality.DRAFT,
      status: 'queued',
    };
  }

  async stitch(userId: string, videoId: string, dto: StitchFlowDto) {
    const project = await this.flowService.getOrCreateProject(userId, videoId);

    const result = await this.stitchService.stitch(
      project.id,
      userId,
      videoId,
      {
        includeNarration: dto.includeNarration ?? true,
        includeBgm: dto.includeBgm ?? true,
        bgmVolume: dto.bgmVolume ?? 50,
      },
    );

    return {
      taskId: result.taskId,
      projectId: result.projectId,
      userId,
      videoId,
      nodeCount: result.nodeCount,
      includeNarration: dto.includeNarration ?? true,
      includeBgm: dto.includeBgm ?? true,
      status: result.status,
    };
  }

  async exportProject(userId: string, videoId: string, dto?: ExportProjectDto) {
    const project = await this.flowService.getOrCreateProject(userId, videoId);
    const format = (dto?.format as 'mp4' | 'webm' | 'json' | 'zip') || 'mp4';

    const result = await this.exportService.exportProject(
      project.id,
      userId,
      videoId,
      format,
    );

    return {
      taskId: result.taskId,
      projectId: result.projectId,
      userId,
      videoId,
      format: result.format,
      status: result.status,
    };
  }

  async getStitchTaskStatus(taskId: string) {
    const raw = await this.stitchService.getTaskStatus(taskId);
    return this.normalizeTaskStatusResponse({
      taskId: raw.taskId || taskId,
      type: 'stitch',
      status: raw.status,
      progress: raw.progress,
      error: raw.error,
      result: { outputUrl: raw.outputUrl ?? null },
      raw,
    });
  }

  async getExportTaskStatus(taskId: string) {
    const raw = await this.exportService.getTaskStatus(taskId);
    return this.normalizeTaskStatusResponse({
      taskId: raw.taskId || taskId,
      type: 'export',
      status: raw.status,
      progress: raw.progress,
      error: raw.error,
      result: {
        downloadUrl: raw.downloadUrl ?? null,
        format: raw.format ?? null,
      },
      raw,
    });
  }

  async getRenderTaskStatus(userId: string, taskId: string) {
    const task = await this.prisma.taskRecord.findUnique({
      where: { id: taskId },
    });

    if (!task || task.type !== 'PRISMFLOW_NODE_RENDER') {
      throw new NotFoundException('Render task not found');
    }
    if (task.userId !== userId) {
      throw new ForbiddenException('You do not have access to this render task');
    }

    const payload = (task.payload as any) || {};
    const nodeId = payload.nodeId as string | undefined;
    const node = nodeId
      ? await this.prisma.flowNode.findUnique({
          where: { id: nodeId },
          select: {
            id: true,
            renderedVideoUrl: true,
            renderStatus: true,
          },
        })
      : null;

    const result = (task.result as any) || {};

    return this.normalizeTaskStatusResponse({
      taskId: task.id,
      type: 'render',
      status: task.status,
      progress: task.progress ?? 0,
      error: task.error ?? null,
      result: {
        nodeId: nodeId ?? null,
        videoUrl: result.videoUrl ?? node?.renderedVideoUrl ?? null,
        renderStatus: node?.renderStatus ?? null,
      },
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    });
  }

  async generateFrame(userId: string, nodeId: string, dto: GenerateFrameDto) {
    const node = await this.prisma.flowNode.findUnique({
      where: { id: nodeId },
      include: {
        flowProject: {
          include: {
            video: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (!node) {
      throw new NotFoundException('Node not found');
    }

    this.flowService.assertNodeAccess(node, userId);

    const result = await this.frameGenService.generateFrame(
      userId,
      nodeId,
      dto.frameType,
      dto.prompt,
    );

    this.logger.log(`Generated ${dto.frameType} frame for node ${nodeId}`);

    return {
      userId,
      nodeId,
      frameType: dto.frameType,
      frameUrl: result.frameUrl,
      status: 'generated',
    };
  }

  async lockFrame(userId: string, nodeId: string, dto: LockFrameDto) {
    const node = await this.prisma.flowNode.findUnique({
      where: { id: nodeId },
      include: {
        flowProject: {
          include: {
            video: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (!node) {
      throw new NotFoundException('Node not found');
    }

    this.flowService.assertNodeAccess(node, userId);

    await this.frameGenService.lockFrame(
      userId,
      nodeId,
      dto.frameType,
      dto.locked,
    );

    this.logger.log(`${dto.locked ? 'Locked' : 'Unlocked'} ${dto.frameType} frame for node ${nodeId}`);

    return {
      userId,
      nodeId,
      frameType: dto.frameType,
      locked: dto.locked,
      status: 'updated',
    };
  }

  async renderNode(userId: string, nodeId: string, quality?: RenderQuality, dto?: RenderNodeDto) {
    const node = await this.prisma.flowNode.findUnique({
      where: { id: nodeId },
      include: {
        flowProject: {
          include: {
            video: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (!node) {
      throw new NotFoundException('Node not found');
    }

    this.flowService.assertNodeAccess(node, userId);

    const result = await this.videoRenderService.enqueueRender(
      userId,
      nodeId,
      quality || RenderQuality.DRAFT,
      {
        prompt: dto?.prompt,
        videoPrompt: dto?.videoPrompt,
        sceneFramePrompt: dto?.sceneFramePrompt,
        firstFramePrompt: dto?.firstFramePrompt,
        lastFramePrompt: dto?.lastFramePrompt,
      },
    );

    this.logger.log(`Enqueued render for node ${nodeId}`);

    return {
      userId,
      nodeId,
      taskId: result.taskId,
      status: result.status,
    };
  }

  private normalizeTaskStatus(rawStatus: string): UnifiedTaskStatus['status'] {
    const normalized = String(rawStatus || '').toLowerCase();
    if (['completed', 'done', 'success', 'succeeded'].includes(normalized)) {
      return 'completed';
    }
    if (['failed', 'error', 'errored'].includes(normalized)) {
      return 'failed';
    }
    if (['processing', 'running', 'in_progress'].includes(normalized)) {
      return 'processing';
    }
    return 'pending';
  }

  private normalizeTaskStatusResponse(input: {
    taskId: string;
    type: UnifiedTaskStatus['type'];
    status: string;
    progress?: number | null;
    error?: string | null;
    result?: Record<string, any> | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    raw?: Record<string, any>;
  }) {
    const payload: UnifiedTaskStatus = {
      taskId: input.taskId,
      type: input.type,
      status: this.normalizeTaskStatus(input.status),
      progress: Math.max(0, Math.min(100, Number(input.progress ?? 0))),
      error: input.error ?? null,
      result: input.result ?? null,
      startedAt: input.startedAt ?? null,
      completedAt: input.completedAt ?? null,
    };

    // 兼容旧前端字段，避免一次性升级导致回归
    return {
      ...payload,
      rawStatus: input.status,
      raw: input.raw ?? null,
    };
  }
}
