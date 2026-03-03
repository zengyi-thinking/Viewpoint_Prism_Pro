import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { TaskStatus } from '../dto';
import { randomUUID } from 'crypto';

export interface ExportOptions {
  format?: 'mp4' | 'webm' | 'json' | 'zip';
}

export interface ExportResult {
  taskId: string;
  projectId: string;
  videoId: string;
  downloadUrl?: string;
  status: string;
  format: string;
}

/**
 * 导出服务 - 负责导出项目为不同格式
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 导出项目
   * @param projectId - 项目 ID
   * @param userId - 用户 ID
   * @param videoId - 视频 ID
   * @param format - 导出格式
   * @returns 导出结果
   */
  async exportProject(
    projectId: string,
    userId: string,
    videoId: string,
    format: 'mp4' | 'webm' | 'json' | 'zip' = 'mp4',
  ): Promise<ExportResult> {
    // 1. 获取项目信息
    const project = await this.prisma.prismFlowProject.findUnique({
      where: { id: projectId },
      include: {
        nodes: {
          orderBy: { orderIndex: 'asc' },
        },
        video: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // 2. 创建导出任务记录
    const taskRecord = await this.prisma.taskRecord.create({
      data: {
        userId,
        type: 'PRISMFLOW_EXPORT',
        payload: {
          flowProjectId: projectId,
          videoId,
          format,
        } as any,
        status: TaskStatus.PENDING,
      },
    });

    // 3. 更新项目状态
    await this.prisma.prismFlowProject.update({
      where: { id: projectId },
      data: { status: TaskStatus.PROCESSING },
    });

    // 4. 异步执行导出
    this.executeExport(taskRecord.id, projectId, videoId, userId, format).catch((error) => {
      this.logger.error(`Export failed for project ${projectId}: ${error.message}`);
    });

    this.logger.log(`Created export task ${taskRecord.id} for project ${projectId} in format ${format}`);

    return {
      taskId: taskRecord.id,
      projectId,
      videoId,
      status: 'queued',
      format,
    };
  }

  /**
   * 异步执行导出
   */
  private async executeExport(
    taskId: string,
    projectId: string,
    videoId: string,
    userId: string,
    format: 'mp4' | 'webm' | 'json' | 'zip',
  ): Promise<void> {
    try {
      this.logger.log(`Starting export execution for task ${taskId}`);

      // 更新任务状态为处理中
      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: { status: TaskStatus.PROCESSING },
      });

      // 获取项目数据
      const project = await this.prisma.prismFlowProject.findUnique({
        where: { id: projectId },
        include: {
          nodes: {
            orderBy: { orderIndex: 'asc' },
          },
          video: true,
        },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // 根据格式执行导出
      let downloadUrl: string;

      switch (format) {
        case 'json':
          downloadUrl = await this.exportAsJson(taskId, project, userId);
          break;
        case 'zip':
          downloadUrl = await this.exportAsZip(taskId, project, userId);
          break;
        case 'mp4':
        case 'webm':
        default:
          downloadUrl = await this.exportAsVideo(taskId, project, userId, format);
          break;
      }

      // 更新任务状态为完成
      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.COMPLETED,
          progress: 100,
          result: { downloadUrl, format } as any,
        },
      });

      // 更新项目状态
      await this.prisma.prismFlowProject.update({
        where: { id: projectId },
        data: { status: TaskStatus.COMPLETED },
      });

      this.logger.log(`Export completed for task ${taskId}, output: ${downloadUrl}`);
    } catch (error) {
      this.logger.error(`Export failed for task ${taskId}: ${error.message}`, error.stack);

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
   * 导出为 JSON 格式
   */
  private async exportAsJson(taskId: string, project: any, userId: string): Promise<string> {
    this.logger.log(`Exporting project ${project.id} as JSON`);

    // 准备导出数据
    const exportData = {
      project: {
        id: project.id,
        name: project.name,
        videoId: project.videoId,
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      video: {
        id: project.video.id,
        title: project.video.title,
        sourceUrl: project.video.sourceUrl,
        duration: project.video.duration,
      },
      nodes: project.nodes.map((node: any) => ({
        id: node.id,
        orderIndex: node.orderIndex,
        prompt: node.prompt,
        scriptSegment: node.scriptSegment,
        firstFrameUrl: node.firstFrameUrl,
        lastFrameUrl: node.lastFrameUrl,
        renderedVideoUrl: node.renderedVideoUrl,
        renderStatus: node.renderStatus,
        narrationUrl: node.narrationUrl,
        bgmUrl: node.bgmUrl,
        positionX: node.positionX,
        positionY: node.positionY,
        branchName: node.branchName,
        isMerged: node.isMerged,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      })),
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
    };

    // 转换为 JSON 字符串
    const jsonContent = JSON.stringify(exportData, null, 2);
    const buffer = Buffer.from(jsonContent, 'utf-8');

    // 上传到存储
    const outputKey = `exports/${userId}/${project.id}/project-${randomUUID()}.json`;
    const downloadUrl = await this.storage.upload(buffer, outputKey, {
      'Content-Type': 'application/json',
    });

    this.logger.log(`JSON export completed: ${downloadUrl}`);
    return downloadUrl;
  }

  /**
   * 导出为视频格式
   */
  private async exportAsVideo(
    taskId: string,
    project: any,
    userId: string,
    format: 'mp4' | 'webm',
  ): Promise<string> {
    this.logger.log(`Exporting project ${project.id} as ${format}`);

    // 获取所有渲染好的视频
    const videoUrls = project.nodes
      .filter((node: any) => node.renderedVideoUrl)
      .map((node: any) => node.renderedVideoUrl);

    if (videoUrls.length === 0) {
      // 没有渲染好的视频，返回占位符
      const placeholderUrl = `https://placehold.co/1920x1080/1E1E24/E91E8C?text=Exported+Video+${project.id.slice(0, 8)}`;
      return placeholderUrl;
    }

    // TODO: 使用 FFmpeg 合并视频
    // 1. 下载所有视频到临时文件
    // 2. 执行 FFmpeg concat
    // 3. 上传结果

    // 模拟处理
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 返回占位符
    const placeholderUrl = `https://placehold.co/1920x1080/1E1E24/E91E8C?text=Exported+${format.toUpperCase()}+${project.id.slice(0, 8)}`;

    this.logger.log(`Video export completed: ${placeholderUrl}`);
    return placeholderUrl;
  }

  /**
   * 导出为 ZIP 格式（包含所有素材）
   */
  private async exportAsZip(taskId: string, project: any, userId: string): Promise<string> {
    this.logger.log(`Exporting project ${project.id} as ZIP`);

    // TODO: 实现 ZIP 导出
    // 1. 收集所有素材（视频、图片、JSON）
    // 2. 使用 JSZip 创建 ZIP 文件
    // 3. 上传到存储

    // 模拟处理
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 返回占位符
    const placeholderUrl = `https://placehold.co/1920x1080/1E1E24/E91E8C?text=Exported+ZIP+${project.id.slice(0, 8)}`;

    this.logger.log(`ZIP export completed: ${placeholderUrl}`);
    return placeholderUrl;
  }

  /**
   * 获取导出任务状态
   */
  async getTaskStatus(taskId: string): Promise<{
    taskId: string;
    status: string;
    progress: number;
    downloadUrl?: string;
    format?: string;
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
      downloadUrl: result?.downloadUrl as string | undefined,
      format: result?.format as string | undefined,
      error: task.error || undefined,
    };
  }
}
