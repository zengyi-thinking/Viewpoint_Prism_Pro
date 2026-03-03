import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { PrismaService } from '../../../prisma/prisma.service';

// TaskStatus enum 定义（与 Prisma schema 保持一致）
export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * 字幕段结构
 */
export interface SubtitleSegment {
  /** 开始时间（秒） */
  start: number;
  /** 结束时间（秒） */
  end: number;
  /** 原文内容 */
  text: string;
  /** 翻译内容（可选） */
  translatedText?: string;
  /** 置信度（可选） */
  confidence?: number;
}

/**
 * 字幕提取选项
 */
export interface SubtitleExtractionOptions {
  /** 是否重新生成 */
  regenerate?: boolean;
  /** 源语言（默认 auto） */
  sourceLang?: string;
  /** 是否跳过已存在的任务 */
  skipExisting?: boolean;
}

/**
 * 字幕翻译选项
 */
export interface SubtitleTranslationOptions {
  /** 目标语言代码 */
  targetLang: string;
  /** 批处理大小（每个请求的字幕段数量） */
  batchSize?: number;
  /** 是否保留原文 */
  keepOriginal?: boolean;
  /** 进度回调 */
  onProgress?: (
    progress: number,
    segment: SubtitleSegment,
    index: number,
    total: number,
  ) => Promise<void> | void;
  /** 状态回调 */
  onStatus?: (
    status: 'extracting' | 'translating' | 'completed' | 'failed',
    metadata?: Record<string, unknown>,
  ) => Promise<void> | void;
}

/**
 * 字幕对齐选项
 */
export interface SubtitleAlignmentOptions {
  /** 第一种语言 */
  lang1: string;
  /** 第二种语言 */
  lang2: string;
  /** 对齐模式：'bilingual'（双语显示）或 'switch'（切换显示） */
  mode?: 'bilingual' | 'switch';
  /** 双语显示时的分隔符 */
  separator?: string;
}

/**
 * SRT 格式的时间戳
 */
function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * 将字幕段转换为 SRT 格式
 */
function segmentsToSrt(segments: SubtitleSegment[]): string {
  return segments
    .map((seg, index) => {
      const text = seg.translatedText ? `${seg.translatedText}\n${seg.text}` : seg.text;
      return `${index + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${text}\n`;
    })
    .join('\n');
}

/**
 * SRT 格式解析器
 */
function parseSrt(srtContent: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  const blocks = srtContent.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    // 第一行是序号
    const indexLine = lines[0].trim();
    if (!/^\d+$/.test(indexLine)) continue;

    // 第二行是时间戳
    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (!timeMatch) continue;

    const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = timeMatch;
    const start = parseInt(h1) * 3600 + parseInt(m1) * 60 + parseInt(s1) + parseInt(ms1) / 1000;
    const end = parseInt(h2) * 3600 + parseInt(m2) * 60 + parseInt(s2) + parseInt(ms2) / 1000;

    // 剩余行是文本
    const text = lines.slice(2).join('\n').trim();

    segments.push({
      start,
      end,
      text,
    });
  }

  return segments;
}

@Injectable()
export class SubtitleService {
  private readonly logger = new Logger(SubtitleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  /**
   * 从视频的转录记录中提取字幕
   * @param videoId 视频ID
   * @param userId 用户ID（用于权限验证和 AI Router）
   * @param options 提取选项
   * @returns SubtitleTrack 记录
   */
  async extractSubtitles(
    videoId: string,
    userId: string,
    options: SubtitleExtractionOptions = {},
  ) {
    // 验证视频是否存在且用户有权限
    const video = await this.prisma.videoSource.findFirst({
      where: {
        id: videoId,
        project: {
          userId,
        },
      },
      include: {
        project: true,
      },
    });

    if (!video) {
      throw new NotFoundException('Video not found or access denied');
    }

    const shouldRegenerate = options.regenerate ?? false;
    const sourceLang = options.sourceLang ?? 'auto';

    // 检查是否已有字幕轨道
    const translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!shouldRegenerate && options.skipExisting && translationTask) {
      const existingTrack = await this.prisma.subtitleTrack.findFirst({
        where: {
          translationId: translationTask.id,
          language: sourceLang,
        },
      });

      if (existingTrack) {
        this.logger.log(`Using existing subtitle track for video ${videoId}`);
        return existingTrack;
      }
    }

    // 获取转录记录
    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    if (!transcript) {
      throw new NotFoundException(
        'No transcript found for this video. Please generate transcript first.',
      );
    }

    // 解析转录段
    const transcriptSegments = Array.isArray(transcript.segments)
      ? (transcript.segments as Array<{ start: number; end: number; text: string; confidence?: number }>)
      : [];

    if (transcriptSegments.length === 0) {
      throw new NotFoundException('Transcript contains no segments');
    }

    // 创建或获取翻译任务
    let translation = translationTask;
    if (!translation) {
      translation = await this.prisma.translationTask.create({
        data: {
          videoId,
          sourceLang: transcript.language || sourceLang,
          targetLangs: [],
          subtitleStatus: TaskStatus.PROCESSING,
          status: TaskStatus.PROCESSING,
        },
      });
    } else {
      // 更新翻译任务状态
      await this.prisma.translationTask.update({
        where: { id: translation.id },
        data: { subtitleStatus: TaskStatus.PROCESSING },
      });
    }

    // 转换为字幕段格式
    const subtitleSegments: SubtitleSegment[] = transcriptSegments.map((seg) => ({
      start: Number(seg.start) || 0,
      end: Number(seg.end) || 0,
      text: String(seg.text || ''),
      confidence: seg.confidence,
    }));

    // 检测语言
    const detectedLang = await this.detectLanguage(subtitleSegments, userId);

    // 创建字幕轨道
    const subtitleTrack = await this.prisma.subtitleTrack.create({
      data: {
        translationId: translation.id,
        language: detectedLang || sourceLang,
        segments: subtitleSegments as any,
        srtContent: segmentsToSrt(subtitleSegments),
        isConfirmed: false,
      },
    });

    // 更新翻译任务状态
    await this.prisma.translationTask.update({
      where: { id: translation.id },
      data: {
        sourceLang: detectedLang || sourceLang,
        subtitleStatus: TaskStatus.COMPLETED,
      },
    });

    this.logger.log(`Extracted ${subtitleSegments.length} subtitle segments for video ${videoId}`);

    return subtitleTrack;
  }

  /**
   * 翻译字幕
   * @param videoId 视频ID
   * @param userId 用户ID
   * @param options 翻译选项
   * @returns 翻译后的 SubtitleTrack 记录
   */
  async translateSubtitles(
    videoId: string,
    userId: string,
    options: SubtitleTranslationOptions,
  ) {
    // 验证视频是否存在且用户有权限
    const video = await this.prisma.videoSource.findFirst({
      where: {
        id: videoId,
        project: {
          userId,
        },
      },
      include: {
        project: true,
      },
    });

    if (!video) {
      throw new NotFoundException('Video not found or access denied');
    }

    const targetLang = options.targetLang;
    const batchSize = options.batchSize ?? 10;
    const keepOriginal = options.keepOriginal ?? true;

    await options.onStatus?.('translating', { targetLang });

    // 获取翻译任务
    const translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!translationTask) {
      throw new NotFoundException('Translation task not found. Please extract subtitles first.');
    }

    // 获取源语言字幕轨道
    const sourceTrack = await this.prisma.subtitleTrack.findFirst({
      where: {
        translationId: translationTask.id,
        language: translationTask.sourceLang,
      },
    });

    if (!sourceTrack) {
      throw new NotFoundException('Source subtitle track not found');
    }

    // 检查是否已存在目标语言字幕
    const existingTrack = await this.prisma.subtitleTrack.findFirst({
      where: {
        translationId: translationTask.id,
        language: targetLang,
      },
    });

    if (existingTrack) {
      this.logger.log(`Subtitle track for ${targetLang} already exists`);
      return existingTrack;
    }

    // 解析字幕段
    const segments: SubtitleSegment[] = Array.isArray(sourceTrack.segments)
      ? (sourceTrack.segments as any[])
      : [];

    if (segments.length === 0) {
      throw new NotFoundException('No subtitle segments found in source track');
    }

    // 更新翻译任务状态
    await this.prisma.translationTask.update({
      where: { id: translationTask.id },
      data: {
        subtitleStatus: TaskStatus.PROCESSING,
        targetLangs: [...translationTask.targetLangs, targetLang],
      },
    });

    // 分批翻译
    const translatedSegments: SubtitleSegment[] = [];
    const totalBatches = Math.ceil(segments.length / batchSize);

    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize);

      try {
        const translatedBatch = await this.translateBatch(
          batch,
          sourceTrack.language,
          targetLang,
          userId,
        );

        for (let j = 0; j < translatedBatch.length; j++) {
          const translated = translatedBatch[j];
          const segment = segments[i + j];

          if (keepOriginal) {
            // 双语模式：原文 + 翻译
            translatedSegments.push({
              start: segment.start,
              end: segment.end,
              text: segment.text,
              translatedText: translated,
              confidence: segment.confidence,
            });
          } else {
            // 仅翻译模式：仅保留翻译
            translatedSegments.push({
              start: segment.start,
              end: segment.end,
              text: translated,
              confidence: segment.confidence,
            });
          }

          const progress = ((i + j + 1) / segments.length) * 100;
          await options.onProgress?.(
            progress,
            translatedSegments[translatedSegments.length - 1],
            i + j,
            segments.length,
          );
        }

        this.logger.log(`Translated batch ${batchIndex + 1}/${totalBatches}`);
      } catch (error) {
        this.logger.error(`Failed to translate batch ${batchIndex + 1}: ${error.message}`);
        // 失败时保留原文
        for (const segment of batch) {
          translatedSegments.push(segment);
        }
      }
    }

    // 生成 SRT 内容
    const srtContent = segmentsToSrt(translatedSegments);

    // 创建翻译后的字幕轨道
    const translatedTrack = await this.prisma.subtitleTrack.create({
      data: {
        translationId: translationTask.id,
        language: targetLang,
        segments: translatedSegments as any,
        srtContent,
        isConfirmed: false,
      },
    });

    // 更新翻译任务状态
    await this.prisma.translationTask.update({
      where: { id: translationTask.id },
      data: { subtitleStatus: TaskStatus.COMPLETED },
    });

    await options.onStatus?.('completed', { segmentCount: translatedSegments.length });

    this.logger.log(`Translated ${translatedSegments.length} segments to ${targetLang}`);

    return translatedTrack;
  }

  /**
   * 生成双语对齐字幕
   * @param videoId 视频ID
   * @param userId 用户ID
   * @param options 对齐选项
   * @returns 对齐后的字幕段
   */
  async generateBilingualSubtitles(
    videoId: string,
    userId: string,
    options: SubtitleAlignmentOptions,
  ) {
    // 验证视频是否存在且用户有权限
    const video = await this.prisma.videoSource.findFirst({
      where: {
        id: videoId,
        project: {
          userId,
        },
      },
      include: {
        project: true,
      },
    });

    if (!video) {
      throw new NotFoundException('Video not found or access denied');
    }

    const { lang1, lang2, mode = 'bilingual', separator = ' | ' } = options;

    // 获取翻译任务
    const translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!translationTask) {
      throw new NotFoundException('Translation task not found');
    }

    // 获取两种语言的字幕轨道
    const [track1, track2] = await Promise.all([
      this.prisma.subtitleTrack.findFirst({
        where: {
          translationId: translationTask.id,
          language: lang1,
        },
      }),
      this.prisma.subtitleTrack.findFirst({
        where: {
          translationId: translationTask.id,
          language: lang2,
        },
      }),
    ]);

    if (!track1 || !track2) {
      const missing = !track1 ? lang1 : lang2;
      throw new NotFoundException(`Subtitle track for ${missing} not found`);
    }

    // 解析字幕段
    const segments1: SubtitleSegment[] = Array.isArray(track1.segments)
      ? (track1.segments as any[])
      : [];
    const segments2: SubtitleSegment[] = Array.isArray(track2.segments)
      ? (track2.segments as any[])
      : [];

    if (segments1.length === 0 || segments2.length === 0) {
      throw new NotFoundException('One or both subtitle tracks are empty');
    }

    // 对齐字幕段
    const alignedSegments: SubtitleSegment[] = [];

    // 使用第一种语言的时间轴作为基准
    for (let i = 0; i < segments1.length; i++) {
      const seg1 = segments1[i];
      const seg2 = segments2[i] || null;

      let text: string;

      if (mode === 'bilingual') {
        // 双语显示：两种语言并列
        const text2 = seg2 ? (seg2.translatedText || seg2.text) : '';
        text = seg1.text + separator + text2;
      } else {
        // 切换显示：交替显示
        text = seg1.text;
        // 可以在这里添加切换逻辑
      }

      alignedSegments.push({
        start: seg1.start,
        end: seg1.end,
        text,
        translatedText: mode === 'bilingual' ? seg2?.translatedText : undefined,
        confidence: Math.max(seg1.confidence || 0, seg2?.confidence || 0),
      });
    }

    this.logger.log(
      `Generated bilingual subtitles for ${lang1} and ${lang2} with ${alignedSegments.length} segments`,
    );

    return alignedSegments;
  }

  /**
   * 更新字幕段
   * @param videoId 视频ID
   * @param userId 用户ID
   * @param language 语言代码
   * @param segments 更新的字幕段
   * @returns 更新后的 SubtitleTrack
   */
  async updateSubtitleSegments(
    videoId: string,
    userId: string,
    language: string,
    segments: Array<Partial<SubtitleSegment>>,
  ) {
    // 验证视频是否存在且用户有权限
    const video = await this.prisma.videoSource.findFirst({
      where: {
        id: videoId,
        project: {
          userId,
        },
      },
      include: {
        project: true,
      },
    });

    if (!video) {
      throw new NotFoundException('Video not found or access denied');
    }

    // 获取翻译任务
    const translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!translationTask) {
      throw new NotFoundException('Translation task not found');
    }

    // 获取字幕轨道
    const track = await this.prisma.subtitleTrack.findFirst({
      where: {
        translationId: translationTask.id,
        language,
      },
    });

    if (!track) {
      throw new NotFoundException(`Subtitle track for ${language} not found`);
    }

    // 更新字幕段
    const updatedSegments = segments.map((seg, index) => ({
      ...(track.segments as any[])[index] || {},
      ...seg,
      start: seg.start !== undefined ? Number(seg.start) : (track.segments as any[])[index]?.start,
      end: seg.end !== undefined ? Number(seg.end) : (track.segments as any[])[index]?.end,
    }));

    // 生成新的 SRT 内容
    const srtContent = segmentsToSrt(updatedSegments as SubtitleSegment[]);

    // 更新数据库
    const updatedTrack = await this.prisma.subtitleTrack.update({
      where: { id: track.id },
      data: {
        segments: updatedSegments as any,
        srtContent,
        isConfirmed: true,
      },
    });

    this.logger.log(`Updated ${updatedSegments.length} subtitle segments for ${language}`);

    return updatedTrack;
  }

  /**
   * 确认字幕轨道
   * @param videoId 视频ID
   * @param userId 用户ID
   * @param language 语言代码
   * @returns 确认后的 SubtitleTrack
   */
  async confirmSubtitleTrack(videoId: string, userId: string, language: string) {
    // 验证视频是否存在且用户有权限
    const video = await this.prisma.videoSource.findFirst({
      where: {
        id: videoId,
        project: {
          userId,
        },
      },
      include: {
        project: true,
      },
    });

    if (!video) {
      throw new NotFoundException('Video not found or access denied');
    }

    // 获取翻译任务
    const translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!translationTask) {
      throw new NotFoundException('Translation task not found');
    }

    // 获取字幕轨道
    const track = await this.prisma.subtitleTrack.findFirst({
      where: {
        translationId: translationTask.id,
        language,
      },
    });

    if (!track) {
      throw new NotFoundException(`Subtitle track for ${language} not found`);
    }

    // 确认字幕轨道
    const confirmedTrack = await this.prisma.subtitleTrack.update({
      where: { id: track.id },
      data: { isConfirmed: true },
    });

    this.logger.log(`Confirmed subtitle track for ${language}`);

    return confirmedTrack;
  }

  /**
   * 导出字幕为 SRT 格式
   * @param videoId 视频ID
   * @param userId 用户ID
   * @param language 语言代码
   * @returns SRT 格式的字幕内容
   */
  async exportSubtitles(videoId: string, userId: string, language: string): Promise<string> {
    // 验证视频是否存在且用户有权限
    const video = await this.prisma.videoSource.findFirst({
      where: {
        id: videoId,
        project: {
          userId,
        },
      },
      include: {
        project: true,
      },
    });

    if (!video) {
      throw new NotFoundException('Video not found or access denied');
    }

    // 获取翻译任务
    const translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!translationTask) {
      throw new NotFoundException('Translation task not found');
    }

    // 获取字幕轨道
    const track = await this.prisma.subtitleTrack.findFirst({
      where: {
        translationId: translationTask.id,
        language,
      },
    });

    if (!track) {
      throw new NotFoundException(`Subtitle track for ${language} not found`);
    }

    return track.srtContent || '';
  }

  /**
   * 导入 SRT 格式字幕
   * @param videoId 视频ID
   * @param userId 用户ID
   * @param language 语言代码
   * @param srtContent SRT 格式的字幕内容
   * @returns 导入的 SubtitleTrack
   */
  async importSubtitles(
    videoId: string,
    userId: string,
    language: string,
    srtContent: string,
  ) {
    // 验证视频是否存在且用户有权限
    const video = await this.prisma.videoSource.findFirst({
      where: {
        id: videoId,
        project: {
          userId,
        },
      },
      include: {
        project: true,
      },
    });

    if (!video) {
      throw new NotFoundException('Video not found or access denied');
    }

    // 解析 SRT
    const segments = parseSrt(srtContent);

    if (segments.length === 0) {
      throw new Error('No valid subtitle segments found in SRT content');
    }

    // 获取或创建翻译任务
    let translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!translationTask) {
      translationTask = await this.prisma.translationTask.create({
        data: {
          videoId,
          sourceLang: language,
          targetLangs: [],
          subtitleStatus: TaskStatus.COMPLETED,
          status: TaskStatus.COMPLETED,
        },
      });
    }

    // 检查是否已存在该语言的字幕
    const existingTrack = await this.prisma.subtitleTrack.findFirst({
      where: {
        translationId: translationTask.id,
        language,
      },
    });

    if (existingTrack) {
      // 更新现有轨道
      return await this.prisma.subtitleTrack.update({
        where: { id: existingTrack.id },
        data: {
          segments: segments as any,
          srtContent,
          isConfirmed: true,
        },
      });
    }

    // 创建新轨道
    const track = await this.prisma.subtitleTrack.create({
      data: {
        translationId: translationTask.id,
        language,
        segments: segments as any,
        srtContent,
        isConfirmed: true,
      },
    });

    this.logger.log(`Imported ${segments.length} subtitle segments for ${language}`);

    return track;
  }

  /**
   * 获取视频的所有字幕轨道
   * @param videoId 视频ID
   * @param userId 用户ID
   * @returns 字幕轨道列表
   */
  async getSubtitleTracks(videoId: string, userId: string) {
    // 验证视频是否存在且用户有权限
    const video = await this.prisma.videoSource.findFirst({
      where: {
        id: videoId,
        project: {
          userId,
        },
      },
      include: {
        project: true,
      },
    });

    if (!video) {
      throw new NotFoundException('Video not found or access denied');
    }

    // 获取翻译任务
    const translationTask = await this.prisma.translationTask.findFirst({
      where: { videoId },
    });

    if (!translationTask) {
      return [];
    }

    // 获取所有字幕轨道
    const tracks = await this.prisma.subtitleTrack.findMany({
      where: { translationId: translationTask.id },
      orderBy: { createdAt: 'asc' },
    });

    return tracks;
  }

  /**
   * 检测字幕语言
   * @param segments 字幕段
   * @param userId 用户ID
   * @returns 检测到的语言代码
   */
  private async detectLanguage(
    segments: SubtitleSegment[],
    userId: string,
  ): Promise<string | null> {
    try {
      // 取前几个段作为样本
      const sampleText = segments.slice(0, 5).map((s) => s.text).join('\n');

      // 使用 AI Router 检测语言
      const result = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          messages: [
            {
              role: 'system',
              content:
                'You are a language detection expert. Analyze the text and respond with ONLY the language code (ISO 639-1 two-letter code, e.g., "en" for English, "zh" for Chinese, "es" for Spanish).',
            },
            {
              role: 'user',
              content: `Detect the language of this subtitle text:\n\n${sampleText}`,
            },
          ],
          temperature: 0.1,
          maxTokens: 10,
        },
        userId,
      );

      const detectedLang = result.text?.trim().toLowerCase().substring(0, 2) || null;
      this.logger.log(`Detected language: ${detectedLang}`);

      return detectedLang;
    } catch (error) {
      this.logger.warn(`Failed to detect language: ${error.message}`);
      return null;
    }
  }

  /**
   * 批量翻译字幕段
   * @param segments 字幕段数组
   * @param sourceLang 源语言
   * @param targetLang 目标语言
   * @param userId 用户ID
   * @returns 翻译后的文本数组
   */
  private async translateBatch(
    segments: SubtitleSegment[],
    sourceLang: string,
    targetLang: string,
    userId: string,
  ): Promise<string[]> {
    try {
      // 使用 AI Router 的 TRANSLATION 任务
      const result = await this.aiRouter.execute(
        AITaskType.TRANSLATION,
        {
          text: segments.map((s) => s.text).join('\n'),
          sourceLang,
          targetLang,
          preserveFormat: true,
        },
        userId,
      );

      // 处理翻译结果
      let translatedText = result.text || result.translation || result.translatedText || '';

      // 如果结果是单个字符串，按行分割
      const translatedLines = translatedText.split('\n').filter((line: string) => line.trim());

      // 确保翻译结果与原始段数匹配
      if (translatedLines.length === segments.length) {
        return translatedLines;
      }

      // 如果不匹配，尝试按句子分割
      if (translatedLines.length < segments.length) {
        const allLines = translatedText.split(/[.!?。！？\n]/).filter((line: string) => line.trim());
        return segments.map((seg, idx) => allLines[idx] || seg.text);
      }

      // 如果仍不匹配，返回原文
      this.logger.warn(
        `Translation result count mismatch: expected ${segments.length}, got ${translatedLines.length}`,
      );
      return segments.map((seg) => seg.text);
    } catch (error) {
      this.logger.error(`Failed to translate batch: ${error.message}`);
      // 失败时返回原文
      return segments.map((seg) => seg.text);
    }
  }
}
