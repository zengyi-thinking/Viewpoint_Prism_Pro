import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { TaskStatus } from '../../dto';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import ffmpeg, { FfprobeData } from 'fluent-ffmpeg';
import * as fs from 'fs';
import JSZip from 'jszip';

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
      this.logger.warn('No rendered videos available, returning placeholder');
      return placeholderUrl;
    }

    // 使用 FFmpeg 合并视频
    return await this.mergeVideosWithFFmpeg(
      taskId,
      videoUrls,
      userId,
      project.id,
      format,
    );
  }

  /**
   * 使用 FFmpeg 合并视频
   */
  private async mergeVideosWithFFmpeg(
    taskId: string,
    videoUrls: string[],
    userId: string,
    projectId: string,
    format: 'mp4' | 'webm',
  ): Promise<string> {
    this.logger.log(`Merging ${videoUrls.length} videos using FFmpeg`);

    const tempDir = join(tmpdir(), `prismflow-export-${taskId}`);
    await mkdir(tempDir, { recursive: true });

    try {
      // 下载所有视频到临时文件
      const videoFiles: string[] = [];
      for (let i = 0; i < videoUrls.length; i++) {
        const url = videoUrls[i];
        const filename = `video-${i.toString().padStart(3, '0')}.${format === 'webm' ? 'webm' : 'mp4'}`;
        const filepath = join(tempDir, filename);

        try {
          const response = await fetch(url);
          if (!response.ok) {
            this.logger.warn(`Failed to download video ${i}: ${response.statusText}`);
            continue;
          }

          const buffer = Buffer.from(await response.arrayBuffer());
          await writeFile(filepath, buffer);
          videoFiles.push(filepath);
        } catch (error) {
          this.logger.warn(`Failed to download video ${i}: ${(error as Error).message}`);
        }
      }

      if (videoFiles.length === 0) {
        throw new Error('No videos could be downloaded');
      }

      // 生成 concat 文件
      const concatListPath = join(tempDir, 'concat-list.txt');
      const concatContent = videoFiles.map((file) => `file '${file}'`).join('\n');
      await writeFile(concatListPath, concatContent);

      // FFmpeg 输出选项
      const outputOptions = format === 'mp4'
        ? ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']
        : ['-c:v', 'libvpx', '-crf', '30', '-b:v', '1M', '-c:a', 'libopus', '-b:a', '128k'];

      // FFmpeg 输出扩展名
      const outputExt = format === 'mp4' ? 'mp4' : 'webm';
      const outputPath = join(tempDir, `output-${randomUUID()}.${outputExt}`);

      // 执行 FFmpeg 合并
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(outputOptions)
          .output(outputPath)
          .on('progress', (progress) => {
            if (progress.percent) {
              this.updateTaskProgress(taskId, Math.floor(progress.percent));
            }
          })
          .on('end', () => {
            this.logger.log(`FFmpeg merge completed: ${outputPath}`);
            resolve();
          })
          .on('error', (err) => {
            this.logger.error(`FFmpeg merge error: ${err.message}`);
            reject(err);
          })
          .run();
      });

      // 上传到存储
      const outputBuffer = await fs.promises.readFile(outputPath);
      const outputKey = `exports/${userId}/${projectId}/merged-${randomUUID()}.${outputExt}`;
      const downloadUrl = await this.storage.upload(outputBuffer, outputKey, {
        'Content-Type': format === 'mp4' ? 'video/mp4' : 'video/webm',
      });

      // 清理临时文件
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        this.logger.warn(`Failed to clean up temp directory: ${(error as Error).message}`);
      }

      this.logger.log(`Video export completed: ${downloadUrl}`);
      return downloadUrl;
    } catch (error) {
      // 清理临时文件
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {}

      throw error;
    }
  }

  /**
   * 导出为 ZIP 格式（包含所有素材）
   */
  private async exportAsZip(taskId: string, project: any, userId: string): Promise<string> {
    this.logger.log(`Exporting project ${project.id} as ZIP`);

    const tempDir = join(tmpdir(), `prismflow-export-${taskId}`);
    await mkdir(tempDir, { recursive: true });

    try {
      // 创建 ZIP 对象
      const zip = new JSZip();

      // 1. 添加 JSON 项目文件
      const jsonExportData = {
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
      zip.file('project.json', JSON.stringify(jsonExportData, null, 2));
      this.logger.log('Added project.json to ZIP');

      // 2. 下载并添加视频文件
      let videoCount = 0;
      for (const node of project.nodes) {
        if (node.renderedVideoUrl) {
          try {
            const response = await fetch(node.renderedVideoUrl);
            if (response.ok) {
              const videoBuffer = Buffer.from(await response.arrayBuffer());
              zip.file(`videos/${node.orderIndex.toString().padStart(3, '0')}.mp4`, videoBuffer);
              videoCount++;
            }
          } catch (error) {
            this.logger.warn(`Failed to download video for node ${node.id}: ${(error as Error).message}`);
          }
        }
      }
      this.logger.log(`Added ${videoCount} videos to ZIP`);

      // 3. 下载并添加首尾帧图片
      let frameCount = 0;
      for (const node of project.nodes) {
        if (node.firstFrameUrl) {
          try {
            const response = await fetch(node.firstFrameUrl);
            if (response.ok) {
              const frameBuffer = Buffer.from(await response.arrayBuffer());
              zip.file(`frames/${node.orderIndex.toString().padStart(3, '0')}-first.png`, frameBuffer);
              frameCount++;
            }
          } catch (error) {
            this.logger.warn(`Failed to download first frame for node ${node.id}: ${(error as Error).message}`);
          }
        }
        if (node.lastFrameUrl) {
          try {
            const response = await fetch(node.lastFrameUrl);
            if (response.ok) {
              const frameBuffer = Buffer.from(await response.arrayBuffer());
              zip.file(`frames/${node.orderIndex.toString().padStart(3, '0')}-last.png`, frameBuffer);
              frameCount++;
            }
          } catch (error) {
            this.logger.warn(`Failed to download last frame for node ${node.id}: ${(error as Error).message}`);
          }
        }
      }
      this.logger.log(`Added ${frameCount} frames to ZIP`);

      // 更新任务进度
      this.updateTaskProgress(taskId, 50);

      // 4. 生成 ZIP 文件
      const zipOutputPath = join(tempDir, `export-${randomUUID()}.zip`);
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      await writeFile(zipOutputPath, Buffer.from(zipBuffer));

      this.updateTaskProgress(taskId, 80);

      // 5. 上传 ZIP 文件到存储
      const outputBuffer = await fs.promises.readFile(zipOutputPath);
      const outputKey = `exports/${userId}/${project.id}/export-${randomUUID()}.zip`;
      const downloadUrl = await this.storage.upload(outputBuffer, outputKey, {
        'Content-Type': 'application/zip',
      });

      this.updateTaskProgress(taskId, 100);

      // 6. 清理临时文件
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        this.logger.warn(`Failed to clean up temp directory: ${(error as Error).message}`);
      }

      this.logger.log(`ZIP export completed: ${downloadUrl}`);
      return downloadUrl;
    } catch (error) {
      // 清理临时文件
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {}

      throw error;
    }
  }

  /**
   * 更新任务进度
   */
  private async updateTaskProgress(taskId: string, progress: number): Promise<void> {
    try {
      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: {
          progress,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to update task progress: ${(error as Error).message}`);
    }
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
