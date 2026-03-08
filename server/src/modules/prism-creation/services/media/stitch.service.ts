import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { StorageService } from '../../../../infrastructure/storage/storage.service';
import { TaskStatus, StitchFlowDto } from '../../dto';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import ffmpeg, { FfprobeData } from 'fluent-ffmpeg';
import * as fs from 'fs';

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
   * 实现完整的视频拼接流程：下载 → concat → 上传
   */
  private async performVideoStitch(
    taskId: string,
    videoUrls: string[],
    options: StitchOptions,
    userId: string,
    projectId: string,
  ): Promise<string> {
    this.logger.log(`Performing video stitch for task ${taskId} with ${videoUrls.length} videos`);

    // 生成输出文件名
    const outputKey = `exports/${userId}/${projectId}/stitched-${randomUUID()}.mp4`;

    try {
      // 创建临时目录
      const tempDir = join(tmpdir(), `prismflow-${taskId}`);
      await mkdir(tempDir, { recursive: true });

      // 1. 下载所有视频到临时文件
      this.logger.log(`Downloading ${videoUrls.length} videos to ${tempDir}`);
      const videoFiles: string[] = [];
      let expiredCount = 0;
      let forbiddenCount = 0;

      for (let i = 0; i < videoUrls.length; i++) {
        const url = videoUrls[i];
        const filename = `video-${i.toString().padStart(3, '0')}.mp4`;
        const filepath = join(tempDir, filename);

        try {
          const response = await this.fetchVideoWithFallback(url);
          if (!response.ok) {
            if (response.status === 403) {
              forbiddenCount += 1;
              if (this.isLikelyExpiredSignedUrl(url)) {
                expiredCount += 1;
              }
            }
            throw new Error(`Failed to download video from ${url}: ${response.statusText}`);
          }

          const buffer = Buffer.from(await response.arrayBuffer());
          await writeFile(filepath, buffer);
          videoFiles.push(filepath);
          this.logger.log(`Downloaded video ${i + 1}/${videoUrls.length}: ${filename}`);
        } catch (error) {
          this.logger.warn(`Failed to download video ${i}: ${(error as Error).message}`);
          // 继续处理其他视频
        }
      }

      this.logger.log(
        `Download summary: requested=${videoUrls.length}, success=${videoFiles.length}, forbidden=${forbiddenCount}, expired=${expiredCount}`,
      );

      if (videoFiles.length === 0) {
        const detail =
          expiredCount > 0
            ? ` (${expiredCount} 个渲染视频链接已过期，请先重新渲染节点再串联)`
            : '';
        throw new BadRequestException(`No videos available for stitching${detail}`);
      }

      // 2. 生成 concat 文件列表
      const concatListPath = join(tempDir, 'concat-list.txt');
      const concatContent = videoFiles.map((file) => `file '${file}'`).join('\n');
      await writeFile(concatListPath, concatContent);

      this.logger.log(`Generated concat list at ${concatListPath}`);

      // 3. 执行 FFmpeg 拼接命令
      const outputPath = join(tempDir, `output-${randomUUID()}.mp4`);

      this.logger.log(`Starting FFmpeg concat...`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions([
            '-f', 'concat',
            '-safe', '0',
          ])
          .outputOptions([
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
          ])
          .output(outputPath)
          .on('start', (commandLine) => {
            this.logger.log(`FFmpeg started: ${commandLine}`);
          })
          .on('progress', (progress) => {
            // 更新任务进度
            if (progress.percent) {
              this.updateTaskProgress(taskId, Math.floor(progress.percent));
            }
          })
          .on('end', () => {
            this.logger.log(`FFmpeg concat completed: ${outputPath}`);
            resolve();
          })
          .on('error', (err) => {
            this.logger.error(`FFmpeg error: ${err.message}`);
            reject(err);
          })
          .run();
      });

      // 4. 读取输出视频并上传到存储
      this.logger.log(`Uploading stitched video to ${outputKey}`);
      const outputBuffer = await fs.promises.readFile(outputPath);

      const outputUrl = await this.storage.upload(outputBuffer, outputKey, {
        'Content-Type': 'video/mp4',
      });

      // 5. 获取视频元数据（可选）
      const metadata = await this.getVideoMetadata(outputPath);

      // 6. 清理临时文件
      try {
        await rm(tempDir, { recursive: true, force: true });
        this.logger.log(`Cleaned up temporary directory: ${tempDir}`);
      } catch (error) {
        this.logger.warn(`Failed to clean up temp directory: ${(error as Error).message}`);
      }

      // 7. 更新项目状态
      await this.prisma.prismFlowProject.update({
        where: { id: projectId },
        data: {
          status: TaskStatus.COMPLETED,
          // 将 stitchedVideoUrl 保存到项目 metadata 或单独的字段
          // 注意：如果 Prisma schema 中没有此字段，需要先更新 schema
        } as any,
      });

      // 更新任务结果为包含视频 URL
      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: {
          result: { outputUrl, stitchedVideoUrl: outputUrl } as any,
        } as any,
      });

      this.logger.log(`Video stitch completed: ${outputUrl}`);
      return outputUrl;
    } catch (error) {
      this.logger.error(`Video stitch failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 获取视频元数据（分辨率、时长等）
   * 注意：FfprobeData 的属性可能因版本不同而变化
   */
  private async getVideoMetadata(filePath: string): Promise<any | null> {
    try {
      return await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) {
            reject(err);
          } else {
            resolve(metadata);
          }
        });
      });
    } catch (error) {
      this.logger.warn(`Failed to get video metadata: ${(error as Error).message}`);
      return null;
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

  private async fetchVideoWithFallback(url: string): Promise<Response> {
    let response = await fetch(url, {
      headers: {
        'User-Agent': 'Viewpoint-Prism-Pro/1.0',
      },
    });
    if (response.ok) return response;

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
      // ignore
    }

    return response;
  }

  private isLikelyExpiredSignedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const expires = parsed.searchParams.get('Expires');
      if (!expires) return false;
      const expiresSec = Number(expires);
      if (!Number.isFinite(expiresSec)) return false;
      return expiresSec * 1000 < Date.now();
    } catch {
      return false;
    }
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
