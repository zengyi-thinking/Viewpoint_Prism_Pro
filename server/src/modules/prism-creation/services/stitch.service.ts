import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { TaskStatus, StitchFlowDto } from '../dto';
import { randomUUID } from 'crypto';

export interface StitchOptions {
  includeNarration?: boolean;
  includeBgm?: boolean;
  bgmVolume?: number;
}

export interface StitchResult {
  taskId: string;
  projectId: string;
  videoId: string;
  outputUrl?: string;
  status: string;
  nodeCount: number;
}

@Injectable()
export class StitchService {
  private readonly logger = new Logger(StitchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 执行视频串联任务
   * @param projectId - 项目 ID
   * @param userId - 用户 ID
   * @param videoId - 视频 ID
   * @param options - 串联选项
   * @returns 任务结果
   */
  async stitch(
    projectId: string,
    userId: string,
    videoId: string,
    options: StitchOptions = {},
  ): Promise<StitchResult> {
    const { includeNarration = true, includeBgm = true, bgmVolume = 50 } = options;

    // 1. 获取项目的所有节点（按 orderIndex 排序）
    const nodes = await this.prisma.flowNode.findMany({
      where: { flowProjectId: projectId },
      orderBy: { orderIndex: 'asc' },
    });

    if (nodes.length === 0) {
      throw new NotFoundException('No nodes found in this project');
    }

    // 2. 验证所有节点都已完成渲染
    const unrenderedNodes = nodes.filter((n) => n.renderStatus !== TaskStatus.COMPLETED);
    if (unrenderedNodes.length > 0) {
      this.logger.warn(
        `Stitching with ${unrenderedNodes.length} unrendered nodes. Some videos may be missing.`,
      );
    }

    // 3. 收集所有渲染好的视频 URL
    const videoUrls = nodes
      .filter((n) => n.renderedVideoUrl)
      .map((n) => ({
        orderIndex: n.orderIndex,
        url: n.renderedVideoUrl!,
        narrationUrl: includeNarration ? n.narrationUrl : null,
        bgmUrl: includeBgm ? n.bgmUrl : null,
      }));

    if (videoUrls.length === 0) {
      throw new BadRequestException('No rendered videos available for stitching');
    }

    // 4. 创建任务记录
    const taskRecord = await this.prisma.taskRecord.create({
      data: {
        userId,
        type: 'PRISMFLOW_STITCH',
        payload: {
          flowProjectId: projectId,
          videoId,
          nodeIds: nodes.map((n) => n.id),
          videoUrls: videoUrls.map((v) => v.url),
          includeNarration,
          includeBgm,
          bgmVolume,
        } as any,
        status: TaskStatus.PENDING,
      },
    });

    // 5. 更新项目状态
    await this.prisma.prismFlowProject.update({
      where: { id: projectId },
      data: { status: TaskStatus.PROCESSING },
    });

    // 6. 启动异步处理
    this.executeStitch(taskRecord.id, projectId, videoId, userId, {
      includeNarration,
      includeBgm,
      bgmVolume,
    }).catch((error) => {
      this.logger.error(`Stitch failed for project ${projectId}: ${error.message}`);
    });

    this.logger.log(
      `Created stitch task ${taskRecord.id} for project ${projectId} with ${nodes.length} nodes`,
    );

    return {
      taskId: taskRecord.id,
      projectId,
      videoId,
      status: 'queued',
      nodeCount: nodes.length,
    };
  }

  /**
   * 异步执行视频串联
   */
  private async executeStitch(
    taskId: string,
    projectId: string,
    videoId: string,
    userId: string,
    options: StitchOptions,
  ): Promise<void> {
    try {
      this.logger.log(`Starting stitch execution for task ${taskId}`);

      // 更新任务状态为处理中
      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: { status: TaskStatus.PROCESSING },
      });

      // 获取所有节点
      const nodes = await this.prisma.flowNode.findMany({
        where: { flowProjectId: projectId },
        orderBy: { orderIndex: 'asc' },
      });

      // 收集视频 URL
      const videoUrls = nodes
        .filter((n) => n.renderedVideoUrl)
        .map((n) => n.renderedVideoUrl!);

      if (videoUrls.length === 0) {
        throw new BadRequestException('No videos to stitch');
      }

      // 执行视频拼接（FFmpeg 集成）
      // 这里模拟 FFmpeg 拼接过程，实际生产环境需要调用 FFmpeg
      const outputUrl = await this.performVideoStitch(
        taskId,
        videoUrls,
        options,
        userId,
        projectId,
      );

      // 更新任务状态为完成
      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.COMPLETED,
          progress: 100,
          result: { outputUrl } as any,
        },
      });

      // 更新项目状态
      await this.prisma.prismFlowProject.update({
        where: { id: projectId },
        data: { status: TaskStatus.COMPLETED },
      });

      this.logger.log(`Stitch completed for task ${taskId}, output: ${outputUrl}`);
    } catch (error) {
      this.logger.error(`Stitch failed for task ${taskId}: ${error.message}`, error.stack);

      // 更新任务状态为失败
      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.FAILED,
          error: error.message,
        } as any,
      });

      // 更新项目状态
      await this.prisma.prismFlowProject.update({
        where: { id: projectId },
        data: { status: TaskStatus.FAILED },
      });
    }
  }

  /**
   * 使用 FFmpeg 执行视频拼接
   * 这里是一个简化实现，实际生产环境需要更完整的 FFmpeg 集成
   */
  private async performVideoStitch(
    taskId: string,
    videoUrls: string[],
    options: StitchOptions,
    userId: string,
    projectId: string,
  ): Promise<string> {
    this.logger.log(`Performing video stitch for task ${taskId} with ${videoUrls.length} videos`);

    // 检查是否有外部 FFmpeg 服务可用
    // 如果有，可以使用 fluent-ffmpeg 或调用外部 API
    // 这里我们生成一个占位符 URL 用于演示

    // 生成输出文件名
    const outputKey = `exports/${userId}/${projectId}/stitched-${randomUUID()}.mp4`;

    // TODO: 实际实现 FFmpeg 拼接
    // 1. 下载所有视频到临时文件
    // 2. 生成 FFmpeg concat 文件
    // 3. 执行 FFmpeg 命令
    // 4. 上传结果到 MinIO

    // 模拟处理时间
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 返回占位符 URL（实际应该返回上传后的 URL）
    const placeholderUrl = `https://placehold.co/1920x1080/1E1E24/E91E8C?text=Stitched+Video+${projectId.slice(0, 8)}`;

    this.logger.log(`Generated placeholder URL for stitched video: ${placeholderUrl}`);

    // 保存导出记录到项目
    await this.prisma.prismFlowProject.update({
      where: { id: projectId },
      data: {
        status: TaskStatus.COMPLETED,
        // 可以添加一个字段来存储最终导出视频 URL
      } as any,
    });

    return placeholderUrl;
  }

  /**
   * 获取串联任务状态
   */
  async getTaskStatus(taskId: string): Promise<{
    taskId: string;
    status: string;
    progress: number;
    outputUrl?: string;
    error?: string;
  }> {
    const task = await this.prisma.taskRecord.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const result = task.result as any;

    return {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      outputUrl: result?.outputUrl as string | undefined,
      error: task.error || undefined,
    };
  }
}
