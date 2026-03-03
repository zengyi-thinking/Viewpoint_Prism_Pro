import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { TaskStatus } from '../dto';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * 音色克隆配置选项
 */
export interface VoiceCloneOptions {
  /**
   * 克隆音色的描述/名称
   */
  voiceName?: string;

  /**
   * 是否增强音色质量（需要更多处理时间）
   */
  enhanceQuality?: boolean;

  /**
   * 是否保存克隆的音色模型
   */
  saveModel?: boolean;

  /**
   * 进度回调
   */
  onProgress?: (progress: number, stage: string) => void;
}

/**
 * 音色克隆结果
 */
export interface VoiceCloneResult {
  taskId: string;
  videoId: string;
  language: string;
  voiceId?: string;
  voiceName?: string;
  previewAudioUrl?: string;
  status: string;
  error?: string;
}

/**
 * 音色预览结果
 */
export interface VoicePreviewResult {
  voiceId: string;
  previewText: string;
  audioUrl: string;
  language: string;
  duration: number;
}

/**
 * 保存的音色配置
 */
export interface SavedVoiceProfile {
  id: string;
  userId: string;
  voiceId: string;
  voiceName: string;
  language: string;
  sampleAudioUrl: string;
  createdAt: Date;
}

/**
 * 翻译棱镜 - 音色克隆服务
 *
 * 功能：
 * 1. 使用 ElevenLabs API 进行音色克隆（通过 AI Router VOICE_CLONE 任务）
 * 2. 支持上传音色样本文件或使用 URL
 * 3. 使用 StorageService 存储音色文件
 * 4. 保存克隆音色配置到数据库（通过 videoSource metadata）
 * 5. 实现音色预览功能（使用 TTS）
 * 6. 更新 TranslationTask 的 voiceCloneStatus
 */
@Injectable()
export class VoiceCloneService {
  private readonly logger = new Logger(VoiceCloneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 执行音色克隆任务
   * @param videoId - 视频 ID
   * @param userId - 用户 ID
   * @param language - 目标语言
   * @param voiceSampleUrl - 音色样本文件 URL（可选）
   * @param voiceSampleFile - 上传的音色样本文件 Buffer（可选）
   * @param options - 克隆配置选项
   * @returns 任务结果
   */
  async executeVoiceClone(
    videoId: string,
    userId: string,
    language: string,
    voiceSampleUrl?: string,
    voiceSampleFile?: { buffer: Buffer; originalName: string },
    options: VoiceCloneOptions = {},
  ): Promise<VoiceCloneResult> {
    const { voiceName = 'Custom Voice', enhanceQuality = false, saveModel = true, onProgress } =
      options;

    this.logger.log(`Starting voice clone for video ${videoId}, language: ${language}`);

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
        type: 'TRANSLATION_VOICE_CLONE',
        payload: {
          videoId,
          language,
          voiceSampleUrl,
          options,
        } as any,
        status: TaskStatus.PENDING,
      },
    });

    // 4. 更新翻译任务状态
    await this.prisma.translationTask.update({
      where: { id: translationTask.id },
      data: { voiceCloneStatus: TaskStatus.PROCESSING },
    });

    // 5. 异步执行音色克隆
    this.performVoiceClone(
      taskRecord.id,
      videoId,
      userId,
      language,
      voiceSampleUrl,
      voiceSampleFile,
      {
        voiceName,
        enhanceQuality,
        saveModel,
        onProgress,
      },
    ).catch((error) => {
      this.logger.error(`Voice clone failed for video ${videoId}: ${error.message}`);
    });

    this.logger.log(`Created voice clone task ${taskRecord.id} for video ${videoId}`);

    return {
      taskId: taskRecord.id,
      videoId,
      language,
      status: 'queued',
    };
  }

  /**
   * 异步执行音色克隆处理
   */
  private async performVoiceClone(
    taskId: string,
    videoId: string,
    userId: string,
    language: string,
    voiceSampleUrl: string | undefined,
    voiceSampleFile: { buffer: Buffer; originalName: string } | undefined,
    options: VoiceCloneOptions,
  ): Promise<void> {
    const tempDir = path.join(os.tmpdir(), `voice-clone-${taskId}`);

    try {
      this.logger.log(`Starting voice clone execution for task ${taskId}`);

      await options.onProgress?.(10, 'Initializing voice clone');

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

      let sampleFilePath: string;

      // 处理音色样本文件
      if (voiceSampleFile) {
        // 从上传的文件
        sampleFilePath = path.join(tempDir, voiceSampleFile.originalName);
        await fs.writeFile(sampleFilePath, voiceSampleFile.buffer);
        this.logger.log(`Saved uploaded voice sample to: ${sampleFilePath}`);
      } else if (voiceSampleUrl) {
        // 从 URL 下载
        sampleFilePath = path.join(tempDir, `voice-sample-${randomUUID()}.wav`);
        await this.downloadFile(voiceSampleUrl, sampleFilePath);
        this.logger.log(`Downloaded voice sample from ${voiceSampleUrl}`);
      } else {
        throw new BadRequestException('Either voiceSampleUrl or voiceSampleFile must be provided');
      }

      await options.onProgress?.(30, 'Processing voice sample');

      // 读取样本文件为 Buffer
      const sampleBuffer = await fs.readFile(sampleFilePath);

      // 上传样本文件到存储
      const sampleStorageKey = this.storage.generateStoragePath(
        userId,
        video.projectId,
        'voice-samples',
        `sample-${language}-${randomUUID()}.wav`,
      );

      const sampleStorageUrl = await this.storage.upload(sampleBuffer, sampleStorageKey, {
        'Content-Type': 'audio/wav',
      });

      this.logger.log(`Uploaded voice sample to: ${sampleStorageUrl}`);

      await options.onProgress?.(50, 'Cloning voice with AI');

      // 使用 AI Router 执行音色克隆
      const cloneResult = await this.aiRouter.execute(
        AITaskType.VOICE_CLONE,
        {
          voiceSampleUrl: sampleStorageUrl,
          voiceName: options.voiceName || 'Custom Voice',
          language,
          enhanceQuality: options.enhanceQuality || false,
        },
        userId,
      );

      this.logger.log(`Voice clone result: ${JSON.stringify(cloneResult)}`);

      await options.onProgress?.(70, 'Saving voice model');

      // 从克隆结果中获取 voice ID
      const voiceId = cloneResult.voiceId || cloneResult.voice_id || `voice-${randomUUID()}`;
      const voiceName = options.voiceName || 'Custom Voice';

      // 生成预览音频
      let previewAudioUrl: string | undefined;
      try {
        const previewResult = await this.generatePreviewAudio(
          voiceId,
          userId,
          video.projectId,
          language,
        );
        previewAudioUrl = previewResult.audioUrl;
        await options.onProgress?.(85, 'Generating preview audio');
      } catch (previewError) {
        this.logger.warn(`Failed to generate preview audio: ${previewError.message}`);
      }

      // 保存音色配置到视频的 metadata
      const existingMetadata = (video.metadata as Record<string, unknown>) || {};
      const voiceProfiles = (existingMetadata.voiceProfiles as Array<SavedVoiceProfile>) || [];

      const newVoiceProfile: SavedVoiceProfile = {
        id: randomUUID(),
        userId,
        voiceId,
        voiceName,
        language,
        sampleAudioUrl: sampleStorageUrl,
        createdAt: new Date(),
      };

      await this.prisma.videoSource.update({
        where: { id: videoId },
        data: {
          metadata: {
            ...existingMetadata,
            voiceProfiles: [...voiceProfiles, newVoiceProfile],
            activeVoiceId: voiceId,
            activeVoiceLanguage: language,
          } as any,
        },
      });

      await options.onProgress?.(95, 'Finalizing voice clone');

      // 更新翻译任务状态
      await this.prisma.translationTask.update({
        where: { id: videoId },
        data: {
          voiceCloneStatus: TaskStatus.COMPLETED,
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
            voiceId,
            voiceName,
            language,
            sampleAudioUrl: sampleStorageUrl,
            previewAudioUrl,
            enhanceQuality: options.enhanceQuality,
          } as any,
        },
      });

      await options.onProgress?.(100, 'Voice clone completed');

      this.logger.log(`Voice clone completed for task ${taskId}, voiceId: ${voiceId}`);
    } catch (error) {
      this.logger.error(`Voice clone failed for task ${taskId}: ${error.message}`, error.stack);

      // 更新翻译任务状态为失败
      await this.prisma.translationTask.updateMany({
        where: { videoId },
        data: { voiceCloneStatus: TaskStatus.FAILED, status: TaskStatus.FAILED } as any,
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
   * 生成预览音频（使用 TTS）
   * @param voiceId - 音色 ID
   * @param userId - 用户 ID
   * @param projectId - 项目 ID
   * @param language - 语言
   * @param previewText - 预览文本（可选）
   * @returns 预览音频 URL
   */
  async generatePreviewAudio(
    voiceId: string,
    userId: string,
    projectId: string,
    language: string,
    previewText?: string,
  ): Promise<VoicePreviewResult> {
    const text = previewText || this.getDefaultPreviewText(language);

    this.logger.log(`Generating preview audio for voice ${voiceId}, text: ${text}`);

    try {
      // 使用 AI Router 执行 TTS
      const result = await this.aiRouter.execute(
        AITaskType.TTS,
        {
          text,
          voiceId,
          language,
          outputFormat: 'mp3',
        },
        userId,
      );

      // 处理音频结果
      let audioBuffer: Buffer;

      if (result.audio) {
        if (typeof result.audio === 'string') {
          // Base64 或 URL
          if (result.audio.startsWith('data:audio')) {
            audioBuffer = Buffer.from(result.audio.split(',')[1], 'base64');
          } else {
            // 可能是 URL，下载
            audioBuffer = await this.downloadFileToBuffer(result.audio);
          }
        } else {
          audioBuffer = Buffer.isBuffer(result.audio) ? result.audio : Buffer.from(result.audio);
        }
      } else if (result.audioUrl) {
        audioBuffer = await this.downloadFileToBuffer(result.audioUrl);
      } else {
        throw new Error('No audio data in TTS result');
      }

      // 上传预览音频到存储
      const storageKey = this.storage.generateStoragePath(
        userId,
        projectId,
        'voice-previews',
        `preview-${voiceId}-${randomUUID()}.mp3`,
      );

      const audioUrl = await this.storage.upload(audioBuffer, storageKey, {
        'Content-Type': 'audio/mpeg',
      });

      // 估算音频时长（基于文本长度，约 0.5 秒/字符）
      const estimatedDuration = (text.length * 0.5) / 60; // 转换为分钟

      this.logger.log(`Generated preview audio: ${audioUrl}`);

      return {
        voiceId,
        previewText: text,
        audioUrl,
        language,
        duration: estimatedDuration,
      };
    } catch (error) {
      this.logger.error(`Failed to generate preview audio: ${error.message}`);
      throw new Error(`预览音频生成失败: ${error.message}`);
    }
  }

  /**
   * 获取默认预览文本
   */
  private getDefaultPreviewText(language: string): string {
    const previewTexts: Record<string, string> = {
      en: 'Hello, this is a preview of the cloned voice.',
      zh: '你好，这是克隆音色的预览。',
      es: 'Hola, esta es una vista previa de la voz clonada.',
      fr: 'Bonjour, ceci est un aperçu de la voix clonée.',
      de: 'Hallo, das ist eine Vorschau der geklonten Stimme.',
      ja: 'こんにちは、これはクローン音声のプレビューです。',
      ko: '안녕하세요, 이것은 복제된 목소리의 미리보기입니다.',
    };

    return previewTexts[language.toLowerCase()] || previewTexts['en'];
  }

  /**
   * 获取音色克隆任务状态
   * @param taskId - 任务 ID
   * @param userId - 用户 ID
   * @returns 任务状态
   */
  async getTaskStatus(taskId: string, userId: string): Promise<{
    taskId: string;
    status: string;
    progress: number;
    voiceId?: string;
    voiceName?: string;
    language?: string;
    previewAudioUrl?: string;
    sampleAudioUrl?: string;
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
      voiceId: result?.voiceId as string | undefined,
      voiceName: result?.voiceName as string | undefined,
      language: result?.language as string | undefined,
      previewAudioUrl: result?.previewAudioUrl as string | undefined,
      sampleAudioUrl: result?.sampleAudioUrl as string | undefined,
      error: task.error || undefined,
    };
  }

  /**
   * 获取视频的音色克隆状态
   * @param videoId - 视频 ID
   * @param userId - 用户 ID
   * @returns 状态信息
   */
  async getVideoVoiceCloneStatus(
    videoId: string,
    userId: string,
  ): Promise<{
    videoId: string;
    voiceCloneStatus: string;
    voiceId?: string;
    voiceName?: string;
    language?: string;
    voiceProfiles?: SavedVoiceProfile[];
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
        voiceCloneStatus: TaskStatus.PENDING,
      };
    }

    // 获取视频 metadata 中的音色配置
    const metadata = video.metadata as Record<string, unknown> | null;
    const voiceProfiles = metadata?.voiceProfiles as SavedVoiceProfile[] | undefined;

    return {
      videoId,
      voiceCloneStatus: translationTask.voiceCloneStatus,
      voiceId: metadata?.activeVoiceId as string | undefined,
      voiceName: voiceProfiles?.find((vp) => vp.voiceId === metadata?.activeVoiceId)?.voiceName,
      language: metadata?.activeVoiceLanguage as string | undefined,
      voiceProfiles,
    };
  }

  /**
   * 重试失败的音色克隆任务
   * @param taskId - 任务 ID
   * @param userId - 用户 ID
   * @returns 新任务结果
   */
  async retryTask(taskId: string, userId: string): Promise<VoiceCloneResult> {
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
    const { videoId, language, voiceSampleUrl, options } = payload;

    // 创建新的重试任务
    return this.executeVoiceClone(
      videoId,
      userId,
      language,
      voiceSampleUrl,
      undefined,
      options,
    );
  }

  /**
   * 删除已保存的音色配置
   * @param videoId - 视频 ID
   * @param userId - 用户 ID
   * @param voiceProfileId - 音色配置 ID
   */
  async deleteVoiceProfile(
    videoId: string,
    userId: string,
    voiceProfileId: string,
  ): Promise<void> {
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

    // 获取当前 metadata
    const metadata = (video.metadata as Record<string, unknown>) || {};
    const voiceProfiles = (metadata.voiceProfiles as SavedVoiceProfile[]) || [];

    // 找到要删除的音色配置
    const profileIndex = voiceProfiles.findIndex((vp) => vp.id === voiceProfileId);

    if (profileIndex === -1) {
      throw new NotFoundException('Voice profile not found');
    }

    // 删除音色配置
    const updatedProfiles = voiceProfiles.filter((vp) => vp.id !== voiceProfileId);

    // 如果删除的是当前激活的音色，清除激活状态
    const profile = voiceProfiles[profileIndex];
    const updates: any = {
      voiceProfiles: updatedProfiles,
    };

    if (metadata.activeVoiceId === profile.voiceId) {
      updates.activeVoiceId = null;
      updates.activeVoiceLanguage = null;
    }

    await this.prisma.videoSource.update({
      where: { id: videoId },
      data: {
        metadata: {
          ...metadata,
          ...updates,
        } as any,
      },
    });

    this.logger.log(`Deleted voice profile ${voiceProfileId} from video ${videoId}`);
  }

  /**
   * 设置激活的音色
   * @param videoId - 视频 ID
   * @param userId - 用户 ID
   * @param voiceId - 音色 ID
   */
  async setActiveVoice(videoId: string, userId: string, voiceId: string): Promise<void> {
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

    // 获取当前 metadata
    const metadata = (video.metadata as Record<string, unknown>) || {};
    const voiceProfiles = (metadata.voiceProfiles as SavedVoiceProfile[]) || [];

    // 查找音色配置
    const profile = voiceProfiles.find((vp) => vp.voiceId === voiceId);

    if (!profile) {
      throw new NotFoundException('Voice profile not found');
    }

    // 更新激活的音色
    await this.prisma.videoSource.update({
      where: { id: videoId },
      data: {
        metadata: {
          ...metadata,
          activeVoiceId: voiceId,
          activeVoiceLanguage: profile.language,
        } as any,
      },
    });

    this.logger.log(`Set active voice ${voiceId} for video ${videoId}`);
  }

  /**
   * 下载文件到本地
   * @param url - 文件 URL
   * @param outputPath - 输出路径
   */
  private async downloadFile(url: string, outputPath: string): Promise<void> {
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
   * 下载文件到 Buffer
   * @param url - 文件 URL
   * @returns Buffer
   */
  private async downloadFileToBuffer(url: string): Promise<Buffer> {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download file from ${url}: ${response.statusText}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } else if (url.startsWith('/') || /^[A-Za-z]:/.test(url)) {
      return await fs.readFile(url);
    } else {
      return await this.storage.download(url);
    }
  }
}
