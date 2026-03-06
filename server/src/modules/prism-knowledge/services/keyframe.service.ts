import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { FfmpegService } from '../../../infrastructure/media/ffmpeg.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { FrameInsightService } from './frame-insight.service';

@Injectable()
export class KeyframeService {
  private readonly logger = new Logger(KeyframeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
    private readonly aiRouter: AiRouterService,
    private readonly frameInsightService: FrameInsightService,
  ) {}

  async extractKeyframes(
    video: {
      id: string;
      projectId: string;
      sourceType: string;
      storagePath: string;
      duration: number | null;
      thumbnailUrl: string | null;
    },
    userId: string,
    options: {
      regenerate?: boolean;
      onFrame?: (
        frame: {
          id: string;
          videoId: string;
          timestamp: number;
          frameType: 'PPT' | 'WHITEBOARD' | 'CHART' | 'SCENE_CHANGE' | 'SPEAKER';
          storagePath: string;
          description?: string | null;
          similarity?: number | null;
        },
        index: number,
        total: number,
      ) => Promise<void> | void;
      onProgress?: (
        progress: { current: number; total: number; message?: string },
      ) => Promise<void> | void;
      onStatus?: (
        status: 'processing' | 'completed' | 'failed',
        metadata?: Record<string, unknown>,
      ) => Promise<void> | void;
      transcriptSegments?: Array<{
        start: number;
        end: number;
        text: string;
      }>;
    } = {},
  ) {
    const shouldRegenerate = options.regenerate ?? false;

    if (!shouldRegenerate) {
      const existing = await this.prisma.keyframe.findMany({
        where: { videoId: video.id },
        orderBy: { timestamp: 'asc' },
      });
      if (existing.length > 0) return existing;
    }

    await this.prisma.videoSource.update({
      where: { id: video.id },
      data: { keyframeStatus: 'PROCESSING' },
    });
    await options.onStatus?.('processing');

    if (shouldRegenerate) {
      await this.prisma.keyframe.deleteMany({ where: { videoId: video.id } });
    }

    let created: any[] = [];
    try {
      if (video.sourceType === 'LOCAL_UPLOAD' && video.storagePath) {
        created = await this.extractFromLocalUpload(video, userId, options);
      } else {
        throw new Error('当前仅支持对本地上传视频抽取关键帧');
      }

      await this.prisma.videoSource.update({
        where: { id: video.id },
        data: { keyframeStatus: 'COMPLETED' },
      });
      await options.onStatus?.('completed', { keyframeCount: created.length });
      return created;
    } catch (error) {
      this.logger.error(`Keyframe extraction failed for ${video.id}: ${error.message}`);
      await this.prisma.videoSource.update({
        where: { id: video.id },
        data: { keyframeStatus: 'FAILED' },
      });
      await options.onStatus?.('failed', { error: error.message });
      throw error;
    }
  }

  private async extractFromLocalUpload(
    video: {
      id: string;
      projectId: string;
      storagePath: string;
      duration: number | null;
    },
    userId: string,
    options: {
      onFrame?: (
        frame: {
          id: string;
          videoId: string;
          timestamp: number;
          frameType: 'PPT' | 'WHITEBOARD' | 'CHART' | 'SCENE_CHANGE' | 'SPEAKER';
          storagePath: string;
          description?: string | null;
          similarity?: number | null;
        },
        index: number,
        total: number,
      ) => Promise<void> | void;
      onProgress?: (
        progress: { current: number; total: number; message?: string },
      ) => Promise<void> | void;
      transcriptSegments?: Array<{
        start: number;
        end: number;
        text: string;
      }>;
    },
  ) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vp-keyframe-'));
    try {
      const videoExt = await this.inferExtForTempVideo(video.storagePath);
      const tempVideoPath = path.join(tempDir, `${video.id}${videoExt}`);
      const downloaded = await this.storage.download(video.storagePath);
      await fs.writeFile(tempVideoPath, downloaded);

      const meta = await this.ffmpeg.getVideoMetadata(tempVideoPath);
      const rawDuration = Number(video.duration ?? meta.duration ?? 0);
      const safeDuration = rawDuration > 0 ? rawDuration : 60;
      const timestamps = this.pickTimestamps(safeDuration);

      const frameTypes = ['PPT', 'WHITEBOARD', 'CHART', 'SCENE_CHANGE', 'SPEAKER'] as const;
      const created: any[] = [];
      let previousFingerprint: string | null = null;
      const similarityThreshold = 0.94;

      for (let idx = 0; idx < timestamps.length; idx += 1) {
        const ts = timestamps[idx];
        const tempFramePath = path.join(tempDir, `frame-${idx + 1}.jpg`);
        await options.onProgress?.({
          current: idx + 1,
          total: timestamps.length,
          message: `extracting frame @${ts}s`,
        });

        try {
          await this.ffmpeg.extractFrame(tempVideoPath, ts, tempFramePath);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`关键帧提取失败 @${ts}s: ${message}`);
        }

        const frameBuffer = await fs.readFile(tempFramePath);
        const currentFingerprint = this.computeFrameFingerprint(frameBuffer);
        if (previousFingerprint) {
          const similarity = this.compareFingerprintSimilarity(
            previousFingerprint,
            currentFingerprint,
          );
          if (similarity >= similarityThreshold) {
            this.logger.debug(
              `Dedup similar frame skipped at ${ts}s, similarity=${similarity.toFixed(3)}`,
            );
            continue;
          }
        }
        previousFingerprint = currentFingerprint;

        const storagePath = this.storage.generateStoragePath(
          userId,
          video.projectId,
          'keyframes',
          `${video.id}-kf-${idx + 1}.jpg`,
        );
        const publicUrl = await this.storage.upload(frameBuffer, storagePath, {
          'Content-Type': 'image/jpeg',
        });

        const analysis = await this.describeAndClassifyFrame(
          {
            imageBase64: frameBuffer.toString('base64'),
            imageUrl: publicUrl,
          },
          userId,
          frameTypes[idx % frameTypes.length],
        );

        const record = await this.prisma.keyframe.create({
          data: {
            videoId: video.id,
            timestamp: ts,
            frameType: analysis.frameType,
            storagePath: publicUrl,
            description: analysis.description,
            similarity: idx === 0 ? null : 0.72,
          },
        });

        const transcriptWindow = this.pickTranscriptWindow(
          options.transcriptSegments ?? [],
          ts,
        );
        const frameInsight = await this.frameInsightService.generateAndStore({
          userId,
          videoId: video.id,
          keyframeId: record.id,
          timestampSec: ts,
          imageBase64: frameBuffer.toString('base64'),
          imageUrl: publicUrl,
          frameType: record.frameType,
          keyframeDescription: record.description,
          transcriptWindow,
        });
        const enrichedRecord = await this.prisma.keyframe.update({
          where: { id: record.id },
          data: {
            description: frameInsight.visualSummary || record.description,
            metadata: {
              frameInsightId: frameInsight.id,
              chapterHint: frameInsight.chapterHint ?? null,
              visualType: frameInsight.visualType ?? null,
            },
          },
        });

        created.push(enrichedRecord);
        await options.onFrame?.(
          {
            id: enrichedRecord.id,
            videoId: enrichedRecord.videoId,
            timestamp: enrichedRecord.timestamp,
            frameType: enrichedRecord.frameType,
            storagePath: enrichedRecord.storagePath,
            description: enrichedRecord.description,
            similarity: enrichedRecord.similarity,
          },
          created.length - 1,
          timestamps.length,
        );
      }

      if (created.length === 0) {
        throw new Error('关键帧抽取失败：未产出可用关键帧');
      }

      return created;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private pickTranscriptWindow(
    segments: Array<{ start: number; end: number; text: string }>,
    timestampSec: number,
  ) {
    if (!segments.length) return [];

    const window = segments.filter(
      (segment) => segment.end >= timestampSec - 25 && segment.start <= timestampSec + 25,
    );
    if (window.length > 0) return window.slice(0, 8);

    const nearest = [...segments]
      .sort(
        (a, b) =>
          Math.abs(((a.start + a.end) / 2) - timestampSec) -
          Math.abs(((b.start + b.end) / 2) - timestampSec),
      )
      .slice(0, 4)
      .sort((a, b) => a.start - b.start);

    return nearest;
  }

  private computeFrameFingerprint(buffer: Buffer) {
    const sampleSize = 256;
    if (buffer.length === 0) return '';
    const step = Math.max(1, Math.floor(buffer.length / sampleSize));
    const bytes: number[] = [];
    for (let i = 0; i < buffer.length && bytes.length < sampleSize; i += step) {
      bytes.push(buffer[i]);
    }
    return createHash('sha1').update(Buffer.from(bytes)).digest('hex');
  }

  private compareFingerprintSimilarity(a: string, b: string) {
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;
    let same = 0;
    for (let i = 0; i < len; i += 1) {
      if (a[i] === b[i]) same += 1;
    }
    return same / len;
  }

  private async describeAndClassifyFrame(
    image: { imageBase64: string; imageUrl?: string | null },
    userId: string,
    defaultFrameType: 'PPT' | 'WHITEBOARD' | 'CHART' | 'SCENE_CHANGE' | 'SPEAKER',
  ) {
    const result = await this.aiRouter.execute(
      AITaskType.MULTIMODAL,
      {
        prompt:
          '请识别这帧画面属于哪一类：PPT, WHITEBOARD, CHART, SCENE_CHANGE, SPEAKER。返回一行类别和一句中文描述。',
        image: image.imageBase64,
        imageUrl: image.imageUrl ?? undefined,
      },
      userId,
    );

    const description = String(
      result?.description || result?.text || result?.content || '',
    ).trim();
    if (!description) {
      throw new Error('多模态模型未返回关键帧描述');
    }
    const frameType = this.inferFrameTypeFromText(description, defaultFrameType);

    return {
      frameType,
      description,
    };
  }

  private inferFrameTypeFromText(
    text: string,
    fallback: 'PPT' | 'WHITEBOARD' | 'CHART' | 'SCENE_CHANGE' | 'SPEAKER',
  ): 'PPT' | 'WHITEBOARD' | 'CHART' | 'SCENE_CHANGE' | 'SPEAKER' {
    const normalized = text.toUpperCase();
    if (normalized.includes('WHITEBOARD') || normalized.includes('白板')) return 'WHITEBOARD';
    if (normalized.includes('CHART') || normalized.includes('图表')) return 'CHART';
    if (normalized.includes('SPEAKER') || normalized.includes('人物') || normalized.includes('讲者')) return 'SPEAKER';
    if (normalized.includes('SCENE_CHANGE') || normalized.includes('场景切换')) return 'SCENE_CHANGE';
    if (normalized.includes('PPT') || normalized.includes('幻灯片')) return 'PPT';
    return fallback;
  }

  private pickTimestamps(duration: number) {
    const safeDuration = Math.max(1, duration);
    const upperBound = Math.max(0.2, safeDuration - 0.2);

    if (safeDuration <= 3) {
      return [Number(Math.min(upperBound, safeDuration / 2).toFixed(2))];
    }

    const count = Math.max(3, Math.min(8, Math.ceil(safeDuration / 45)));
    const step = safeDuration / (count + 1);
    const raw = Array.from({ length: count }, (_, i) => (i + 1) * step);
    const clamped = raw
      .map((ts) => Number(Math.min(upperBound, ts).toFixed(2)))
      .filter((ts) => ts > 0);

    return Array.from(new Set(clamped));
  }

  private inferExtFromStoragePath(storagePath: string): string {
    const ext = path.extname(storagePath || '').toLowerCase();
    if (!ext) return '.mp4';
    if (ext.length > 10 || /[^a-z0-9.]/i.test(ext)) return '.mp4';
    return ext;
  }

  private async inferExtForTempVideo(storagePath: string): Promise<string> {
    const extFromMeta = await this.readExtFromObjectMetadata(storagePath);
    if (extFromMeta) return extFromMeta;
    return this.inferExtFromStoragePath(storagePath);
  }

  private async readExtFromObjectMetadata(storagePath: string): Promise<string | null> {
    try {
      const stat = (await this.storage.getMetadata(storagePath)) as any;
      const meta = (stat?.metaData ?? {}) as Record<string, string>;
      const encoded =
        meta['x-amz-meta-original-filename-b64'] ??
        meta['X-Amz-Meta-Original-Filename-B64'] ??
        meta['original-filename-b64'];
      if (!encoded) return null;

      const originalName = Buffer.from(
        decodeURIComponent(String(encoded)),
        'base64',
      ).toString('utf8');

      const ext = path.extname(originalName || '').toLowerCase();
      if (!ext || ext.length > 10 || /[^a-z0-9.]/i.test(ext)) return null;
      return ext;
    } catch {
      return null;
    }
  }
}
