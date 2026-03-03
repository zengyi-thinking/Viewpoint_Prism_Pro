import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { FfmpegService } from '../../../infrastructure/media/ffmpeg.service';
import { TaskStatus } from '../dto';
import { randomUUID } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as ffmpeg from 'fluent-ffmpeg';

/**
 * 口型同步配置选项
 */
export interface LipSyncOptions {
  /**
   * 是否启用口型同步（使用音频驱动视频变形）
   * 由于 Wav2Lip 是商业 API，此处为占位符
   */
  enableLipSync?: boolean;

  /**
   * 原始视频音轨音量 (0-1)
   */
  originalAudioVolume?: number;

  /**
   * 配音音轨音量 (0-1)
   */
  dubbedAudioVolume?: number;

  /**
   * 音频混合模式
   * - replace: 替换原音频
   * - mix: 混合原音频和配音
   * - mute: 静音原音频
   */
  audioMixMode?: 'replace' | 'mix' | 'mute';
}

/**
 * 口型同步结果
 */
export interface LipSyncResult {
  taskId: string;
  videoId: string;
  language: string;
  outputUrl?: string;
  status: string;
  duration?: number;
  error?: string;
}

/**
 * 口型同步服务
 *
 * 负责将配音音频与视频进行同步处理
 * 当前实现为基础版本：
 * 1. 使用 FFmpeg 将配音音频与原视频合并
 * 2. 保留原视频的视频流
 * 3. 根据音频混合模式处理音轨
 *
 * 注意：真实的口型同步（Wav2Lip）需要商业 API 集成
 */
@Injectable()
export class LipSyncService {
  private readonly logger = new Logger(LipSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ffmpegService: FfmpegService,
  ) {}

  /**
   * 执行口型同步任务
   * @param videoId - 视频 ID
   * @param userId - 用户 ID
   * @param language - 目标语言
   * @param dubbedAudioUrl - 配音音频 URL
   * @param options - 配置选项
   * @returns 任务结果
   */
  async executeLipSync(
    videoId: string,
    userId: string,
    language: string,
    dubbedAudioUrl: string,
    options: LipSyncOptions = {},
  ): Promise<LipSyncResult> {
    const {
      enableLipSync = false,
      originalAudioVolume = 0,
      dubbedAudioVolume = 1.0,
      audioMixMode = 'replace',
    } = options;

    this.logger.log(`Starting lip sync for video ${videoId}, language: ${language}`);

    // 1. 验证视频存在并获取视频信息
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new BadRequestException('You do not have access to this video');
    }

    // 2. 检查是否存在翻译任务记录
    let translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!translationTask) {
      throw new BadRequestException('Translation task not found for this video');
    }

    // 3. 创建任务记录
    const taskRecord = await this.prisma.taskRecord.create({
      data: {
        userId,
        type: 'TRANSLATION_LIP_SYNC',
        payload: {
          videoId,
          language,
          dubbedAudioUrl,
          options,
        } as any,
        status: TaskStatus.PENDING,
      },
    });

    // 4. 更新翻译任务状态
    await this.prisma.translationTask.update({
      where: { id: translationTask.id },
      data: { lipSyncStatus: TaskStatus.PROCESSING },
    });

    // 5. 异步执行口型同步
    this.performLipSync(taskRecord.id, videoId, userId, language, dubbedAudioUrl, {
      enableLipSync,
      originalAudioVolume,
      dubbedAudioVolume,
      audioMixMode,
    }).catch((error) => {
      this.logger.error(`Lip sync failed for video ${videoId}: ${error.message}`);
    });

    this.logger.log(`Created lip sync task ${taskRecord.id} for video ${videoId}`);

    return {
      taskId: taskRecord.id,
      videoId,
      language,
      status: 'queued',
    };
  }

  /**
   * 异步执行口型同步处理
   */
  private async performLipSync(
    taskId: string,
    videoId: string,
    userId: string,
    language: string,
    dubbedAudioUrl: string,
    options: LipSyncOptions,
  ): Promise<void> {
    const tempDir = path.join(os.tmpdir(), `lip-sync-${taskId}`);

    try {
      this.logger.log(`Starting lip sync execution for task ${taskId}`);

      // 更新任务状态为处理中
      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: { status: TaskStatus.PROCESSING },
      });

      // 确保临时目录存在
      await fs.mkdir(tempDir, { recursive: true });

      // 获取视频信息
      const video = await this.prisma.videoSource.findUnique({
        where: { id: videoId },
        include: { project: true },
      });

      if (!video) {
        throw new NotFoundException('Video not found');
      }

      // 获取视频 URL
      const videoMetadata = video.metadata as Record<string, unknown> | null;
      const videoUrl = (videoMetadata?.videoUrl as string) || video.sourceUrl;

      if (!videoUrl) {
        throw new BadRequestException('Video URL not found');
      }

      // 下载视频到临时文件
      this.logger.log(`Downloading video from ${videoUrl}`);
      const videoTempPath = path.join(tempDir, 'original-video.mp4');
      await this.downloadFile(videoUrl, videoTempPath);

      // 下载配音音频到临时文件
      this.logger.log(`Downloading dubbed audio from ${dubbedAudioUrl}`);
      const dubbedAudioPath = path.join(tempDir, 'dubbed-audio.wav');
      await this.downloadFile(dubbedAudioUrl, dubbedAudioPath);

      // 获取视频元数据
      const videoMetadataInfo = await this.getVideoMetadata(videoTempPath);

      // 执行音频混合和视频合成
      const outputPath = await this.performAudioMixAndVideoCompose(
        videoTempPath,
        dubbedAudioPath,
        tempDir,
        options,
      );

      // 读取处理后的视频文件
      const outputBuffer = await fs.readFile(outputPath);

      // 上传到存储
      const outputKey = this.storage.generateStoragePath(
        userId,
        video.projectId,
        'translations',
        `lip-sync-${language}-${randomUUID()}.mp4`,
      );

      const outputUrl = await this.storage.upload(outputBuffer, outputKey, {
        'Content-Type': 'video/mp4',
      });

      this.logger.log(`Uploaded lip-synced video to ${outputUrl}`);

      // 更新翻译任务状态
      await this.prisma.translationTask.update({
        where: { id: videoId },
        data: {
          lipSyncStatus: TaskStatus.COMPLETED,
          outputVideoUrl: outputUrl,
          status: TaskStatus.COMPLETED,
        },
      });

      // 更新任务状态为完成
      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.COMPLETED,
          progress: 100,
          result: {
            outputUrl,
            duration: videoMetadataInfo.duration,
            language,
          } as any,
        },
      });

      this.logger.log(`Lip sync completed for task ${taskId}, output: ${outputUrl}`);
    } catch (error) {
      this.logger.error(`Lip sync failed for task ${taskId}: ${error.message}`, error.stack);

      // 更新翻译任务状态为失败
      await this.prisma.translationTask.updateMany({
        where: { videoId },
        data: { lipSyncStatus: TaskStatus.FAILED, status: TaskStatus.FAILED } as any,
      });

      // 更新任务状态为失败
      await this.prisma.taskRecord.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.FAILED,
          error: error.message,
        } as any,
      });
    } finally {
      // 清理临时文件
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        this.logger.log(`Cleaned up temp directory: ${tempDir}`);
      } catch (cleanupError) {
        this.logger.error(`Failed to cleanup temp directory: ${cleanupError.message}`);
      }
    }
  }

  /**
   * 执行音频混合和视频合成
   * 使用 FFmpeg 将配音音频与视频合并
   */
  private async performAudioMixAndVideoCompose(
    videoPath: string,
    dubbedAudioPath: string,
    tempDir: string,
    options: LipSyncOptions,
  ): Promise<string> {
    const { audioMixMode = 'replace', originalAudioVolume = 0, dubbedAudioVolume = 1.0 } = options;
    const outputPath = path.join(tempDir, 'output.mp4');

    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath);

      // 根据混合模式处理音频
      switch (audioMixMode) {
        case 'replace':
          // 替换原音频，只使用配音
          command
            .addInput(dubbedAudioPath)
            .outputOptions('-map', '0:v') // 使用原视频的视频流
            .outputOptions('-map', '1:a') // 使用配音的音频流
            .outputOptions('-c:v', 'copy') // 复制视频流，不重新编码
            .outputOptions('-c:a', 'aac') // 音频编码为 AAC
            .outputOptions('-b:a', '192k') // 音频比特率
            .outputOptions('-shortest') // 以最短的流为准
            .save(outputPath);
          break;

        case 'mix':
          // 混合原音频和配音
          command
            .addInput(dubbedAudioPath)
            .complexFilter([
              // 混合两个音频流
              {
                filter: 'amix',
                inputs: '2',
                options: `duration=first:dropout_transition=2`,
              },
              // 调整原音频音量
              {
                filter: 'volume',
                options: originalAudioVolume.toString(),
              },
              // 调整配音音量
              {
                filter: 'volume',
                options: dubbedAudioVolume.toString(),
              },
            ])
            .outputOptions('-map', '[v]') // 使用视频流
            .outputOptions('-c:v', 'copy')
            .outputOptions('-c:a', 'aac')
            .outputOptions('-b:a', '192k')
            .save(outputPath);
          break;

        case 'mute':
        default:
          // 静音原音频，只使用配音（与 replace 相同，但更明确语义）
          command
            .addInput(dubbedAudioPath)
            .outputOptions('-map', '0:v')
            .outputOptions('-map', '1:a')
            .outputOptions('-c:v', 'copy')
            .outputOptions('-c:a', 'aac')
            .outputOptions('-b:a', '192k')
            .outputOptions('-shortest')
            .save(outputPath);
          break;
      }

      command
        .on('end', () => {
          this.logger.log(`Audio mix and video compose completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to mix audio and compose video: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * 获取视频元数据
   * @param videoPath - 视频文件路径
   * @returns 视频元数据
   */
  private async getVideoMetadata(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          this.logger.error(`Failed to get metadata: ${err.message}`);
          return reject(err);
        }

        const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
        });
      });
    });
  }

  /**
   * 获取口型同步任务状态
   * @param taskId - 任务 ID
   * @param userId - 用户 ID
   * @returns 任务状态
   */
  async getTaskStatus(taskId: string, userId: string): Promise<{
    taskId: string;
    status: string;
    progress: number;
    outputUrl?: string;
    language?: string;
    duration?: number;
    error?: string;
  }> {
    const task = await this.prisma.taskRecord.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.userId !== userId) {
      throw new BadRequestException('You do not have access to this task');
    }

    const result = task.result as any;

    return {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      outputUrl: result?.outputUrl as string | undefined,
      language: result?.language as string | undefined,
      duration: result?.duration as number | undefined,
      error: task.error || undefined,
    };
  }

  /**
   * 获取视频的口型同步状态
   * @param videoId - 视频 ID
   * @param userId - 用户 ID
   * @returns 状态信息
   */
  async getVideoLipSyncStatus(
    videoId: string,
    userId: string,
  ): Promise<{
    videoId: string;
    lipSyncStatus: string;
    outputVideoUrl?: string;
  }> {
    // 验证视频访问权限
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new BadRequestException('You do not have access to this video');
    }

    // 获取翻译任务
    const translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!translationTask) {
      return {
        videoId,
        lipSyncStatus: TaskStatus.PENDING,
      };
    }

    return {
      videoId,
      lipSyncStatus: translationTask.lipSyncStatus,
      outputVideoUrl: translationTask.outputVideoUrl || undefined,
    };
  }

  /**
   * 重试失败的口型同步任务
   * @param taskId - 任务 ID
   * @param userId - 用户 ID
   * @returns 新任务结果
   */
  async retryTask(taskId: string, userId: string): Promise<LipSyncResult> {
    const task = await this.prisma.taskRecord.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.userId !== userId) {
      throw new BadRequestException('You do not have access to this task');
    }

    if (task.status !== TaskStatus.FAILED) {
      throw new BadRequestException('Can only retry failed tasks');
    }

    const payload = task.payload as any;
    const { videoId, language, dubbedAudioUrl, options } = payload;

    // 创建新的重试任务
    return this.executeLipSync(videoId, userId, language, dubbedAudioUrl, options);
  }

  /**
   * 下载文件到本地
   * @param url - 文件 URL
   * @param outputPath - 输出路径
   */
  private async downloadFile(url: string, outputPath: string): Promise<void> {
    // 判断是否是本地文件路径
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // 从 URL 下载
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download file from ${url}: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outputPath, buffer);
    } else if (url.startsWith('/') || /^[A-Za-z]:/.test(url)) {
      // 本地文件，直接复制
      await fs.copyFile(url, outputPath);
    } else {
      // 可能是 MinIO 上的文件，通过 StorageService 下载
      const buffer = await this.storage.download(url);
      await fs.writeFile(outputPath, buffer);
    }
  }

  /**
   * 高级口型同步（占位符方法）
   *
   * 此方法保留用于未来集成专业口型同步服务（如 Wav2Lip）
   * 由于 Wav2Lip 是商业 API，需要单独的授权和配置
   *
   * @param videoPath - 视频文件路径
   * @param audioPath - 音频文件路径
   * @param outputPath - 输出文件路径
   * @returns 处理后的视频路径
   */
  private async advancedLipSync(
    videoPath: string,
    audioPath: string,
    outputPath: string,
  ): Promise<string> {
    this.logger.warn('Advanced lip sync (Wav2Lip) is not yet implemented. Using basic audio mix instead.');

    // TODO: 未来集成 Wav2Lip 或其他口型同步 API
    // 1. 准备 API 请求（视频和音频）
    // 2. 调用口型同步服务
    // 3. 接收处理后的视频
    // 4. 返回输出路径

    // 暂时使用基础音频混合
    throw new Error('Advanced lip sync not implemented yet');
  }
}
