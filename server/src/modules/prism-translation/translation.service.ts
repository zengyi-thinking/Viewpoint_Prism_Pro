import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FfmpegService } from '../../infrastructure/media/ffmpeg.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  CreateTranslationTaskDto,
  DeleteVoiceProfileDto,
  ExportTranslationDto,
  InpaintingDto,
  LipSyncDto,
  SetActiveVoiceDto,
  UpdateSubtitleSegmentsDto,
  VoiceCloneDto,
  VoicePreviewDto,
  TaskStatus,
} from './dto';
import { InpaintingService } from './services/inpainting.service';
import { LipSyncService } from './services/lip-sync.service';
import { SubtitleService } from './services/subtitle.service';
import { VoiceCloneService } from './services/voice-clone.service';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

// 重新导出 TaskStatus 供其他模块使用
export { TaskStatus } from './dto';

/**
 * 完整翻译工作流配置
 */
export interface FullTranslationWorkflowOptions {
  /** 源语言（默认 auto） */
  sourceLang?: string;
  /** 目标语言数组 */
  targetLangs: string[];
  /** 是否执行字幕修复（移除原始文字） */
  doInpainting?: boolean;
  /** 是否执行音色克隆 */
  doVoiceClone?: boolean;
  /** 是否执行口型同步 */
  doLipSync?: boolean;
  /** 音色样本 URL */
  voiceSampleUrl?: string;
  /** 音色配置 */
  voiceCloneConfig?: {
    voiceName?: string;
    enhanceQuality?: boolean;
    saveModel?: boolean;
  };
  /** 口型同步配置 */
  lipSyncConfig?: {
    enableLipSync?: boolean;
    audioMixMode?: 'replace' | 'mix' | 'mute';
  };
  /** 字幕修复配置 */
  inpaintingConfig?: {
    frameInterval?: number;
    keyframesOnly?: boolean;
  };
  /** 进度回调 */
  onProgress?: (stage: string, progress: number, message: string) => void;
  /** 状态回调 */
  onStageChange?: (stage: WorkflowStage) => void;
}

/**
 * 工作流阶段
 */
export enum WorkflowStage {
  INIT = 'INIT',
  SUBTITLE_EXTRACT = 'SUBTITLE_EXTRACT',
  SUBTITLE_TRANSLATE = 'SUBTITLE_TRANSLATE',
  INPAINTING = 'INPAINTING',
  VOICE_CLONE = 'VOICE_CLONE',
  TEXT_TO_SPEECH = 'TEXT_TO_SPEECH',
  LIP_SYNC = 'LIP_SYNC',
  EXPORT = 'EXPORT',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * 工作流结果
 */
export interface WorkflowResult {
  taskId: string;
  videoId: string;
  userId: string;
  sourceLang: string;
  targetLangs: string[];
  status: TaskStatus;
  currentStage: WorkflowStage;
  progress: number;
  results: {
    subtitleTrackIds?: string[];
    inpaintedVideoUrl?: string;
    voiceId?: string;
    dubbedAudioUrl?: string;
    outputVideoUrl?: string;
    exports?: Array<{
      language: string;
      srtContent: string;
      videoUrl?: string;
    }>;
  };
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * 翻译棱镜主服务协调器
 *
 * 负责：
 * 1. 协调所有子服务的调用
 * 2. 实现完整的翻译工作流（字幕→翻译→修复→音色克隆→口型同步→导出）
 * 3. 实现视频导出功能（烧录字幕）
 * 4. 完善错误处理和日志记录
 * 5. 实现任务状态轮询
 */
@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly activeWorkflows = new Map<string, WorkflowResult>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly inpaintingService: InpaintingService,
    private readonly lipSyncService: LipSyncService,
    private readonly subtitleService: SubtitleService,
    private readonly voiceCloneService: VoiceCloneService,
    private readonly ffmpeg: FfmpegService,
    private readonly storage: StorageService,
  ) {}

  // ============================================================
  // 完整工作流
  // ============================================================

  /**
   * 执行完整的翻译工作流
   * @param userId 用户 ID
   * @param videoId 视频 ID
   * @param options 工作流配置
   * @returns 工作流结果
   */
  async executeFullWorkflow(
    userId: string,
    videoId: string,
    options: FullTranslationWorkflowOptions,
  ): Promise<WorkflowResult> {
    const {
      sourceLang = 'auto',
      targetLangs,
      doInpainting = false,
      doVoiceClone = false,
      doLipSync = false,
      voiceSampleUrl,
      voiceCloneConfig,
      lipSyncConfig,
      inpaintingConfig,
      onProgress,
      onStageChange,
    } = options;

    const taskId = `workflow_${randomUUID()}`;

    // 验证视频存在并获取权限
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    // 创建或获取翻译任务
    let translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!translationTask) {
      translationTask = await this.prisma.translationTask.create({
        data: {
          videoId,
          sourceLang,
          targetLangs,
          subtitleStatus: TaskStatus.PENDING,
          inpaintingStatus: TaskStatus.PENDING,
          voiceCloneStatus: TaskStatus.PENDING,
          lipSyncStatus: TaskStatus.PENDING,
          status: TaskStatus.PROCESSING,
        },
      });
    }

    // 初始化工作流结果
    const workflowResult: WorkflowResult = {
      taskId,
      videoId,
      userId,
      sourceLang,
      targetLangs,
      status: TaskStatus.PROCESSING,
      currentStage: WorkflowStage.INIT,
      progress: 0,
      results: {},
      startedAt: new Date(),
    };

    this.activeWorkflows.set(taskId, workflowResult);

    // 异步执行工作流
    this.executeWorkflowAsync(
      taskId,
      userId,
      videoId,
      translationTask.id,
      options,
      workflowResult,
    ).catch((error) => {
      this.logger.error(`Workflow ${taskId} failed: ${error.message}`, error.stack);
      workflowResult.status = TaskStatus.FAILED;
      workflowResult.currentStage = WorkflowStage.FAILED;
      workflowResult.error = error.message;
      workflowResult.completedAt = new Date();
      onStageChange?.(WorkflowStage.FAILED);
    });

    return workflowResult;
  }

  /**
   * 异步执行工作流
   */
  private async executeWorkflowAsync(
    taskId: string,
    userId: string,
    videoId: string,
    translationTaskId: string,
    options: FullTranslationWorkflowOptions,
    workflowResult: WorkflowResult,
  ): Promise<void> {
    const {
      sourceLang = 'auto',
      targetLangs,
      doInpainting,
      doVoiceClone,
      doLipSync,
      voiceSampleUrl,
      voiceCloneConfig,
      lipSyncConfig,
      inpaintingConfig,
      onProgress,
      onStageChange,
    } = options;

    const stages: WorkflowStage[] = [];
    let currentStageIndex = 0;

    // 构建阶段列表
    stages.push(WorkflowStage.SUBTITLE_EXTRACT);
    if (targetLangs.length > 0) {
      stages.push(WorkflowStage.SUBTITLE_TRANSLATE);
    }
    if (doInpainting) {
      stages.push(WorkflowStage.INPAINTING);
    }
    if (doVoiceClone && voiceSampleUrl) {
      stages.push(WorkflowStage.VOICE_CLONE);
      stages.push(WorkflowStage.TEXT_TO_SPEECH);
    }
    if (doLipSync && doVoiceClone) {
      stages.push(WorkflowStage.LIP_SYNC);
    }
    stages.push(WorkflowStage.EXPORT);
    stages.push(WorkflowStage.COMPLETED);

    try {
      // 阶段 1: 提取字幕
      await this.updateStage(workflowResult, stages, currentStageIndex++, onStageChange);
      onProgress?.(WorkflowStage.SUBTITLE_EXTRACT, 10, '提取字幕中...');
      await this.subtitleService.extractSubtitles(videoId, userId, {
        sourceLang,
        regenerate: false,
        skipExisting: true,
      });

      // 获取字幕轨道
      const tracks = await this.subtitleService.getSubtitleTracks(videoId, userId);
      workflowResult.results.subtitleTrackIds = tracks.map((t) => t.id);

      // 阶段 2: 翻译字幕
      if (targetLangs.length > 0) {
        await this.updateStage(workflowResult, stages, currentStageIndex++, onStageChange);
        onProgress?.(
          WorkflowStage.SUBTITLE_TRANSLATE,
          20,
          `翻译字幕到 ${targetLangs.join(', ')}...`,
        );

        for (const targetLang of targetLangs) {
          await this.subtitleService.translateSubtitles(videoId, userId, {
            targetLang,
            batchSize: 10,
            keepOriginal: true,
          });
        }

        // 更新翻译任务
        await this.prisma.translationTask.update({
          where: { id: translationTaskId },
          data: {
            targetLangs,
            subtitleStatus: TaskStatus.COMPLETED,
          },
        });
      }

      // 阶段 3: 字幕修复（可选）
      let inpaintedVideoUrl: string | undefined;
      if (doInpainting) {
        await this.updateStage(workflowResult, stages, currentStageIndex++, onStageChange);
        onProgress?.(WorkflowStage.INPAINTING, 40, '修复视频画面文字...');

        // 获取视频路径
        const video = await this.prisma.videoSource.findUnique({
          where: { id: videoId },
        });

        if (!video) {
          throw new NotFoundException('Video not found for inpainting');
        }

        const videoMetadata = video?.metadata as Record<string, unknown> | null;
        const videoPath = (videoMetadata?.videoPath as string) || video?.storagePath;

        if (!videoPath) {
          throw new BadRequestException('Video path not found for inpainting');
        }

        // 执行修复
        const inpaintingResult = await this.inpaintingService.inpaintVideo(
          videoPath,
          userId,
          video.projectId,
          {
            frameInterval: inpaintingConfig?.frameInterval || 1.0,
            keyframesOnly: inpaintingConfig?.keyframesOnly || false,
            onProgress: (progress, current, total) => {
              const stageProgress = 40 + (progress * 0.3); // 40-70%
              onProgress?.(
                WorkflowStage.INPAINTING,
                stageProgress,
                `修复视频画面... (${current}/${total})`,
              );
            },
          },
        );

        inpaintedVideoUrl = inpaintingResult.outputVideoUrl;
        workflowResult.results.inpaintedVideoUrl = inpaintedVideoUrl;

        // 更新任务状态
        await this.prisma.translationTask.update({
          where: { id: translationTaskId },
          data: {
            inpaintingStatus: TaskStatus.COMPLETED,
          },
        });
      }

      // 阶段 4: 音色克隆（可选）
      let voiceId: string | undefined;
      if (doVoiceClone && voiceSampleUrl) {
        await this.updateStage(workflowResult, stages, currentStageIndex++, onStageChange);
        onProgress?.(WorkflowStage.VOICE_CLONE, 70, '克隆音色中...');

        const cloneResult = await this.voiceCloneService.executeVoiceClone(
          videoId,
          userId,
          targetLangs[0] || 'en',
          voiceSampleUrl,
          undefined,
          {
            ...voiceCloneConfig,
            onProgress: (progress, stage) => {
              const stageProgress = 70 + (progress * 0.15); // 70-85%
              onProgress?.(WorkflowStage.VOICE_CLONE, stageProgress, stage);
            },
          },
        );

        // 等待音色克隆完成
        await this.waitForTaskCompletion(cloneResult.taskId, userId);

        // 获取音色 ID
        const voiceStatus = await this.voiceCloneService.getVideoVoiceCloneStatus(
          videoId,
          userId,
        );
        voiceId = voiceStatus.voiceId;
        workflowResult.results.voiceId = voiceId;

        // 更新任务状态
        await this.prisma.translationTask.update({
          where: { id: translationTaskId },
          data: {
            voiceCloneStatus: TaskStatus.COMPLETED,
          },
        });
      }

      // 阶段 5: 文本转语音（可选）
      let dubbedAudioUrl: string | undefined;
      if (doVoiceClone && voiceId && targetLangs.length > 0) {
        await this.updateStage(workflowResult, stages, currentStageIndex++, onStageChange);
        onProgress?.(WorkflowStage.TEXT_TO_SPEECH, 85, '生成配音中...');

        // 获取翻译后的字幕
        const translatedTrack = await this.prisma.subtitleTrack.findFirst({
          where: {
            translationId: translationTaskId,
            language: targetLangs[0],
          },
        });

        if (translatedTrack) {
          // 使用字幕生成完整文本
          const segments = translatedTrack.segments as Array<{
            start: number;
            end: number;
            text: string;
          }>;

          const fullText = segments.map((s) => s.text).join(' ');

          // 调用 TTS（通过 VoiceCloneService）
          const previewResult = await this.voiceCloneService.generatePreviewAudio(
            voiceId,
            userId,
            videoId,
            targetLangs[0],
            fullText,
          );

          dubbedAudioUrl = previewResult.audioUrl;
          workflowResult.results.dubbedAudioUrl = dubbedAudioUrl;
        }
      }

      // 阶段 6: 口型同步（可选）
      if (doLipSync && dubbedAudioUrl) {
        await this.updateStage(workflowResult, stages, currentStageIndex++, onStageChange);
        onProgress?.(WorkflowStage.LIP_SYNC, 90, '同步口型中...');

        const lipSyncResult = await this.lipSyncService.executeLipSync(
          videoId,
          userId,
          targetLangs[0] || 'en',
          dubbedAudioUrl,
          {
            ...lipSyncConfig,
          },
        );

        // 等待口型同步完成
        await this.waitForTaskCompletion(lipSyncResult.taskId, userId);

        // 获取输出视频 URL
        const lipSyncStatus = await this.lipSyncService.getVideoLipSyncStatus(
          videoId,
          userId,
        );
        workflowResult.results.outputVideoUrl = lipSyncStatus.outputVideoUrl;

        // 更新任务状态
        await this.prisma.translationTask.update({
          where: { id: translationTaskId },
          data: {
            lipSyncStatus: TaskStatus.COMPLETED,
            outputVideoUrl: lipSyncStatus.outputVideoUrl,
          },
        });
      }

      // 阶段 7: 导出
      await this.updateStage(workflowResult, stages, currentStageIndex++, onStageChange);
      onProgress?.(WorkflowStage.EXPORT, 95, '导出视频和字幕...');

      const exportResults: Array<{
        language: string;
        srtContent: string;
        videoUrl?: string;
      }> = [];

      // 导出所有语言的字幕
      for (const lang of [sourceLang, ...targetLangs]) {
        if (!lang || lang === 'auto') continue;

        try {
          const srtContent = await this.subtitleService.exportSubtitles(
            videoId,
            userId,
            lang,
          );

          exportResults.push({
            language: lang,
            srtContent,
          });
        } catch (error) {
          this.logger.warn(`Failed to export subtitle for ${lang}: ${error.message}`);
        }
      }

      // 如果需要烧录字幕
      if (doLipSync || doInpainting) {
        const outputVideo = workflowResult.results.outputVideoUrl || inpaintedVideoUrl;
        if (outputVideo && exportResults.length > 0) {
          for (const exportResult of exportResults) {
            try {
              const burnedVideoUrl = await this.exportVideoWithBurnedSubtitles(
                userId,
                videoId,
                outputVideo,
                exportResult.language,
                exportResult.srtContent,
              );
              exportResult.videoUrl = burnedVideoUrl;
            } catch (error) {
              this.logger.warn(
                `Failed to burn subtitles for ${exportResult.language}: ${error.message}`,
              );
            }
          }
        }
      }

      workflowResult.results.exports = exportResults;

      // 阶段 8: 完成
      await this.updateStage(workflowResult, stages, currentStageIndex++, onStageChange);
      workflowResult.status = TaskStatus.COMPLETED;
      workflowResult.currentStage = WorkflowStage.COMPLETED;
      workflowResult.progress = 100;
      workflowResult.completedAt = new Date();
      onProgress?.(WorkflowStage.COMPLETED, 100, '工作流完成');

      // 更新翻译任务状态
      await this.prisma.translationTask.update({
        where: { id: translationTaskId },
        data: {
          status: TaskStatus.COMPLETED,
          outputVideoUrl: workflowResult.results.outputVideoUrl,
        },
      });

      this.logger.log(`Workflow ${taskId} completed successfully`);
    } catch (error) {
      this.logger.error(`Workflow ${taskId} failed: ${error.message}`, error.stack);
      workflowResult.status = TaskStatus.FAILED;
      workflowResult.currentStage = WorkflowStage.FAILED;
      workflowResult.error = error.message;
      workflowResult.completedAt = new Date();
      onStageChange?.(WorkflowStage.FAILED);

      // 更新翻译任务状态为失败
      await this.prisma.translationTask.update({
        where: { id: translationTaskId },
        data: {
          status: TaskStatus.FAILED,
        },
      });

      throw error;
    } finally {
      // 从活动工作流中移除
      this.activeWorkflows.delete(taskId);
    }
  }

  /**
   * 等待任务完成
   */
  private async waitForTaskCompletion(
    taskId: string,
    userId: string,
    timeout = 300000, // 5分钟超时
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const task = await this.prisma.taskRecord.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new NotFoundException(`Task ${taskId} not found`);
      }

      if (task.status === TaskStatus.COMPLETED) {
        return;
      }

      if (task.status === TaskStatus.FAILED) {
        throw new BadRequestException(`Task ${taskId} failed: ${task.error}`);
      }

      // 等待 1 秒后重试
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Task ${taskId} timeout after ${timeout}ms`);
  }

  /**
   * 更新工作流阶段
   */
  private updateStage(
    workflowResult: WorkflowResult,
    stages: WorkflowStage[],
    stageIndex: number,
    onStageChange?: (stage: WorkflowStage) => void,
  ): void {
    if (stageIndex < stages.length) {
      workflowResult.currentStage = stages[stageIndex];
      workflowResult.progress = Math.floor((stageIndex / stages.length) * 100);
      onStageChange?.(workflowResult.currentStage);
    }
  }

  // ============================================================
  // 基础任务管理
  // ============================================================

  /**
   * 创建翻译任务
   * @deprecated 使用 executeFullWorkflow 替代
   */
  async createTask(userId: string, videoId: string, dto: CreateTranslationTaskDto) {
    // 提取字幕
    await this.subtitleService.extractSubtitles(videoId, userId, {
      regenerate: false,
      sourceLang: dto.sourceLang,
      skipExisting: true,
    });

    // 如果有目标语言，进行翻译
    if (dto.targetLangs && dto.targetLangs.length > 0) {
      for (const targetLang of dto.targetLangs) {
        await this.subtitleService.translateSubtitles(videoId, userId, {
          targetLang,
          batchSize: 10,
          keepOriginal: true,
        });
      }
    }

    return {
      taskId: `translation_${Date.now()}`,
      userId,
      videoId,
      sourceLang: dto.sourceLang ?? 'auto',
      targetLangs: dto.targetLangs,
      status: 'processing',
    };
  }

  /**
   * 获取工作流状态
   */
  async getWorkflowStatus(taskId: string): Promise<WorkflowResult | null> {
    return this.activeWorkflows.get(taskId) || null;
  }

  /**
   * 获取翻译任务概览
   */
  async getTaskOverview(userId: string, videoId: string) {
    // 验证视频访问权限
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    // 获取翻译任务
    const translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!translationTask) {
      return {
        videoId,
        hasTask: false,
        status: TaskStatus.PENDING,
      };
    }

    // 获取字幕轨道
    const subtitleTracks = await this.prisma.subtitleTrack.findMany({
      where: { translationId: translationTask.id },
      orderBy: { createdAt: 'asc' },
    });

    // 获取音色状态
    const videoMetadata = video.metadata as Record<string, unknown> | null;
    const activeVoiceId = videoMetadata?.activeVoiceId as string | undefined;
    const voiceProfiles = (videoMetadata?.voiceProfiles as Array<any>) || [];

    return {
      videoId,
      taskId: translationTask.id,
      hasTask: true,
      status: translationTask.status,
      sourceLang: translationTask.sourceLang,
      targetLangs: translationTask.targetLangs,
      stages: {
        subtitle: translationTask.subtitleStatus,
        inpainting: translationTask.inpaintingStatus,
        voiceClone: translationTask.voiceCloneStatus,
        lipSync: translationTask.lipSyncStatus,
      },
      subtitleTracks: subtitleTracks.map((track) => ({
        id: track.id,
        language: track.language,
        segmentCount: Array.isArray(track.segments) ? (track.segments as any[]).length : 0,
        isConfirmed: track.isConfirmed,
        createdAt: track.createdAt,
      })),
      voice: {
        activeVoiceId,
        voiceProfiles: voiceProfiles.map((vp: any) => ({
          id: vp.id,
          voiceId: vp.voiceId,
          voiceName: vp.voiceName,
          language: vp.language,
        })),
      },
      outputVideoUrl: translationTask.outputVideoUrl,
      createdAt: translationTask.createdAt,
      updatedAt: translationTask.updatedAt,
    };
  }

  // ============================================================
  // 字幕管理
  // ============================================================

  /**
   * 获取视频的所有字幕轨道
   */
  async getSubtitles(userId: string, videoId: string) {
    const tracks = await this.subtitleService.getSubtitleTracks(videoId, userId);
    return {
      userId,
      videoId,
      tracks: tracks.map((track) => ({
        id: track.id,
        language: track.language,
        segmentCount: Array.isArray(track.segments) ? (track.segments as any[]).length : 0,
        isConfirmed: track.isConfirmed,
        createdAt: track.createdAt,
      })),
    };
  }

  /**
   * 更新字幕段
   */
  async updateSubtitles(userId: string, videoId: string, dto: UpdateSubtitleSegmentsDto) {
    const updatedTrack = await this.subtitleService.updateSubtitleSegments(
      videoId,
      userId,
      dto.language,
      dto.segments as any[],
    );

    return {
      userId,
      videoId,
      language: dto.language,
      updatedSegments: dto.segments.length,
      status: 'saved',
      trackId: updatedTrack.id,
    };
  }

  /**
   * 确认字幕轨道
   */
  async confirmSubtitleTrack(userId: string, videoId: string, language: string) {
    const track = await this.subtitleService.confirmSubtitleTrack(videoId, userId, language);
    return {
      userId,
      videoId,
      language,
      status: 'confirmed',
      trackId: track.id,
    };
  }

  /**
   * 导入 SRT 字幕
   */
  async importSubtitles(userId: string, videoId: string, language: string, srtContent: string) {
    const track = await this.subtitleService.importSubtitles(videoId, userId, language, srtContent);
    return {
      userId,
      videoId,
      language,
      status: 'imported',
      trackId: track.id,
      segmentCount: Array.isArray(track.segments) ? (track.segments as any[]).length : 0,
    };
  }

  // ============================================================
  // 音色管理
  // ============================================================

  /**
   * 执行音色克隆
   */
  async voiceClone(userId: string, videoId: string, dto: VoiceCloneDto) {
    return await this.voiceCloneService.executeVoiceClone(
      videoId,
      userId,
      dto.language,
      dto.voiceSampleUrl,
      undefined,
      {
        voiceName: dto.voiceName,
        enhanceQuality: dto.enhanceQuality,
        saveModel: dto.saveModel,
      },
    );
  }

  /**
   * 生成音色预览
   */
  async voiceClonePreview(userId: string, videoId: string, dto: VoicePreviewDto) {
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    return await this.voiceCloneService.generatePreviewAudio(
      dto.voiceId,
      userId,
      video.projectId,
      'en',
      dto.previewText,
    );
  }

  /**
   * 设置激活的音色
   */
  async setActiveVoice(userId: string, videoId: string, dto: SetActiveVoiceDto) {
    await this.voiceCloneService.setActiveVoice(videoId, userId, dto.voiceId);
    return { success: true, activeVoiceId: dto.voiceId };
  }

  /**
   * 删除音色配置
   */
  async deleteVoiceProfile(userId: string, videoId: string, dto: DeleteVoiceProfileDto) {
    await this.voiceCloneService.deleteVoiceProfile(videoId, userId, dto.voiceProfileId);
    return { success: true };
  }

  /**
   * 获取音色克隆状态
   */
  async getVoiceCloneStatus(userId: string, videoId: string) {
    return await this.voiceCloneService.getVideoVoiceCloneStatus(videoId, userId);
  }

  // ============================================================
  // 口型同步
  // ============================================================

  /**
   * 执行口型同步
   */
  async lipSync(userId: string, videoId: string, dto: LipSyncDto) {
    return await this.lipSyncService.executeLipSync(
      videoId,
      userId,
      dto.language,
      dto.dubbedAudioUrl,
      {
        enableLipSync: dto.enableLipSync,
        audioMixMode: dto.audioMixMode,
      },
    );
  }

  /**
   * 获取口型同步状态
   */
  async getLipSyncStatus(userId: string, videoId: string) {
    return await this.lipSyncService.getVideoLipSyncStatus(videoId, userId);
  }

  // ============================================================
  // 视频画面修复
  // ============================================================

  /**
   * 执行视频画面文字修复
   */
  async inpaintVideo(userId: string, videoId: string, dto: InpaintingDto) {
    // 获取视频信息
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    // 获取视频路径
    const videoMetadata = video.metadata as Record<string, unknown> | null;
    const videoPath = dto.videoPath || (videoMetadata?.videoPath as string) || video.storagePath;

    if (!videoPath) {
      throw new BadRequestException('Video path not found for inpainting');
    }

    // 更新翻译任务状态
    const translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (translationTask) {
      await this.prisma.translationTask.update({
        where: { id: translationTask.id },
        data: { inpaintingStatus: TaskStatus.PROCESSING },
      });
    }

    // 执行修复
    const result = await this.inpaintingService.inpaintVideo(
      videoPath,
      userId,
      video.projectId,
      {
        frameInterval: dto.frameInterval,
        keyframesOnly: dto.keyframesOnly,
        detectionPrompt: dto.detectionPrompt,
        inpaintPrompt: dto.inpaintPrompt,
        onProgress: (progress, current, total) => {
          this.logger.log(`Inpainting progress: ${progress.toFixed(1)}% (${current}/${total})`);
        },
      },
    );

    // 更新翻译任务状态
    if (translationTask) {
      await this.prisma.translationTask.update({
        where: { id: translationTask.id },
        data: {
          inpaintingStatus: TaskStatus.COMPLETED,
          outputVideoUrl: result.outputVideoUrl,
        },
      });
    }

    return {
      userId,
      videoId,
      taskId: `inpainting_${Date.now()}`,
      outputVideoUrl: result.outputVideoUrl,
      totalFrames: result.totalFrames,
      successfulFrames: result.successfulFrames,
      duration: result.duration,
      status: 'completed',
    };
  }

  // ============================================================
  // 导出功能
  // ============================================================

  /**
   * 导出翻译结果
   */
  async export(userId: string, videoId: string, dto: ExportTranslationDto) {
    // 获取所有字幕轨道
    const tracks = await this.subtitleService.getSubtitleTracks(videoId, userId);

    if (!tracks || tracks.length === 0) {
      throw new NotFoundException('No subtitle tracks found for this video');
    }

    // 过滤语言
    const filteredTracks = dto.languages
      ? tracks.filter((t) => dto.languages!.includes(t.language))
      : tracks;

    // 导出结果
    const exports: Array<{
      language: string;
      srtContent: string;
      videoUrl?: string;
    }> = [];

    for (const track of filteredTracks) {
      const srtContent = await this.subtitleService.exportSubtitles(
        videoId,
        userId,
        track.language,
      );

      const exportResult: {
        language: string;
        srtContent: string;
        videoUrl?: string;
      } = {
        language: track.language,
        srtContent,
      };

      // 如果需要烧录字幕
      if (dto.burnSubtitles ?? true) {
        const video = await this.prisma.videoSource.findUnique({
          where: { id: videoId },
        });

        if (video) {
          try {
            const videoMetadata = video.metadata as Record<string, unknown> | null;
            const videoPath =
              (videoMetadata?.videoPath as string) || video.storagePath;

            if (videoPath) {
              exportResult.videoUrl = await this.exportVideoWithBurnedSubtitles(
                userId,
                videoId,
                videoPath,
                track.language,
                srtContent,
              );
            }
          } catch (error) {
            this.logger.warn(
              `Failed to burn subtitles for ${track.language}: ${error.message}`,
            );
          }
        }
      }

      exports.push(exportResult);
    }

    return {
      taskId: `translation_export_${Date.now()}`,
      userId,
      videoId,
      languages: dto.languages || tracks.map((t) => t.language),
      burnSubtitles: dto.burnSubtitles ?? true,
      exports,
      status: 'completed',
    };
  }

  /**
   * 导出带烧录字幕的视频
   */
  private async exportVideoWithBurnedSubtitles(
    userId: string,
    videoId: string,
    videoPath: string,
    language: string,
    srtContent: string,
  ): Promise<string> {
    const tempDir = path.join(os.tmpdir(), `burn-subtitles-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // 保存 SRT 文件
      const srtPath = path.join(tempDir, `subtitles-${language}.srt`);
      await fs.writeFile(srtPath, srtContent, 'utf-8');

      // 烧录字幕到视频
      const outputPath = path.join(
        tempDir,
        `video-${language}-subtitled.mp4`,
      );

      await this.ffmpeg.burnSubtitles(videoPath, srtPath, outputPath);

      // 上传到存储
      const video = await this.prisma.videoSource.findUnique({
        where: { id: videoId },
      });

      if (!video) {
        throw new NotFoundException('Video not found');
      }

      const outputBuffer = await fs.readFile(outputPath);
      const storageKey = this.storage.generateStoragePath(
        userId,
        video.projectId,
        'translations',
        `burned-${language}-${Date.now()}.mp4`,
      );

      const outputUrl = await this.storage.upload(outputBuffer, storageKey, {
        'Content-Type': 'video/mp4',
      });

      this.logger.log(
        `Exported video with burned subtitles for ${language}: ${outputUrl}`,
      );

      return outputUrl;
    } finally {
      // 清理临时文件
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        this.logger.warn(`Failed to cleanup temp directory: ${error.message}`);
      }
    }
  }

  /**
   * 导出单个语言的字幕为 SRT
   */
  async exportSrt(userId: string, videoId: string, language: string): Promise<string> {
    return await this.subtitleService.exportSubtitles(videoId, userId, language);
  }

  /**
   * 批量导出所有语言的字幕
   */
  async exportAllSrt(userId: string, videoId: string): Promise<Record<string, string>> {
    const tracks = await this.subtitleService.getSubtitleTracks(videoId, userId);
    const exports: Record<string, string> = {};

    for (const track of tracks) {
      exports[track.language] = await this.subtitleService.exportSubtitles(
        videoId,
        userId,
        track.language,
      );
    }

    return exports;
  }

  // ============================================================
  // 任务状态轮询
  // ============================================================

  /**
   * 轮询任务状态
   */
  async pollTaskStatus(
    taskId: string,
    userId: string,
    onUpdate?: (status: TaskStatus, progress: number) => void,
    interval = 1000,
  ): Promise<TaskStatus> {
    const startTime = Date.now();
    const maxDuration = 600000; // 10 分钟超时

    while (Date.now() - startTime < maxDuration) {
      const task = await this.prisma.taskRecord.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new NotFoundException(`Task ${taskId} not found`);
      }

      if (task.userId !== userId) {
        throw new ForbiddenException('You do not have access to this task');
      }

      // 调用更新回调（将 Prisma 的 TaskStatus 转换为 DTO 的 TaskStatus）
      onUpdate?.(task.status as TaskStatus, task.progress);

      // 检查是否完成
      if (task.status === 'COMPLETED') {
        return 'COMPLETED' as TaskStatus;
      }

      if (task.status === 'FAILED') {
        throw new BadRequestException(
          `Task ${taskId} failed: ${task.error || 'Unknown error'}`,
        );
      }

      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(`Task ${taskId} timeout after ${maxDuration}ms`);
  }

  /**
   * 批量获取任务状态
   */
  async getTasksStatus(userId: string, taskIds: string[]): Promise<Array<{
    taskId: string;
    status: TaskStatus;
    progress: number;
    error?: string;
  }>> {
    const tasks = await this.prisma.taskRecord.findMany({
      where: {
        id: { in: taskIds },
        userId,
      },
    });

    return tasks.map((task) => ({
      taskId: task.id,
      status: task.status as TaskStatus,
      progress: task.progress,
      error: task.error || undefined,
    }));
  }

  // ============================================================
  // 清理和维护
  // ============================================================

  /**
   * 清理临时文件
   */
  async cleanup(): Promise<void> {
    await this.inpaintingService.cleanup();
  }

  /**
   * 取消工作流
   */
  async cancelWorkflow(taskId: string, userId: string): Promise<void> {
    const workflow = this.activeWorkflows.get(taskId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }

    // 更新状态为失败（因为没有取消状态）
    workflow.status = TaskStatus.FAILED;
    workflow.currentStage = WorkflowStage.FAILED;
    workflow.error = 'Workflow cancelled by user';
    workflow.completedAt = new Date();

    // 从活动工作流中移除
    this.activeWorkflows.delete(taskId);

    // 更新数据库中的翻译任务
    await this.prisma.translationTask.updateMany({
      where: { videoId: workflow.videoId },
      data: { status: TaskStatus.FAILED } as any,
    });

    this.logger.log(`Workflow ${taskId} cancelled by user ${userId}`);
  }

  /**
   * 重试失败的工作流
   */
  async retryWorkflow(taskId: string, userId: string): Promise<WorkflowResult> {
    const workflow = this.activeWorkflows.get(taskId);

    if (!workflow) {
      // 尝试从数据库恢复
      const task = await this.prisma.taskRecord.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new NotFoundException('Workflow not found');
      }

      // 从 payload 恢复工作流配置
      const payload = task.payload as any;
      return this.executeFullWorkflow(userId, payload.videoId, {
        sourceLang: payload.sourceLang,
        targetLangs: payload.targetLangs,
        doInpainting: payload.doInpainting,
        doVoiceClone: payload.doVoiceClone,
        doLipSync: payload.doLipSync,
        voiceSampleUrl: payload.voiceSampleUrl,
        voiceCloneConfig: payload.voiceCloneConfig,
        lipSyncConfig: payload.lipSyncConfig,
      });
    }

    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }

    // 使用原配置重新执行
    return this.executeFullWorkflow(userId, workflow.videoId, {
      sourceLang: workflow.sourceLang,
      targetLangs: workflow.targetLangs,
    });
  }
}
