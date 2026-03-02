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

@Injectable()
export class KeyframeService {
  private readonly logger = new Logger(KeyframeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
    private readonly aiRouter: AiRouterService,
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
        created = await this.createFallbackKeyframes(video);
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
      return [];
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
          this.logger.warn(`Skip keyframe at ${ts}s for ${video.id}: ${error.message}`);
          continue;
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
        created.push(record);
        await options.onFrame?.(
          {
            id: record.id,
            videoId: record.videoId,
            timestamp: record.timestamp,
            frameType: record.frameType,
            storagePath: record.storagePath,
            description: record.description,
            similarity: record.similarity,
          },
          created.length - 1,
          timestamps.length,
        );
      }

      if (created.length === 0) {
        return this.createFallbackKeyframes({
          id: video.id,
          duration: Math.round(safeDuration),
          thumbnailUrl: null,
        });
      }

      return created;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
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
    try {
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
      const frameType = this.inferFrameTypeFromText(description, defaultFrameType);

      return {
        frameType,
        description: description || `关键帧自动识别：${frameType}`,
      };
    } catch (error) {
      this.logger.warn(`Multimodal classify fallback: ${error.message}`);
      return {
        frameType: defaultFrameType,
        description: `关键帧自动提取（${defaultFrameType}）`,
      };
    }
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

  private async createFallbackKeyframes(video: {
    id: string;
    duration: number | null;
    thumbnailUrl: string | null;
  }) {
    const duration = Math.max(6, Math.round(video.duration ?? 60));
    const timestamps = this.pickTimestamps(duration).slice(0, 4);
    const created: any[] = [];

    for (let idx = 0; idx < timestamps.length; idx += 1) {
      const ts = timestamps[idx];
      const record = await this.prisma.keyframe.create({
        data: {
          videoId: video.id,
          timestamp: ts,
          frameType: 'SCENE_CHANGE',
          storagePath:
            video.thumbnailUrl ??
            `external://video/${video.id}/keyframe/${idx + 1}`,
          description: `降级关键帧 ${idx + 1}`,
          similarity: idx === 0 ? null : 0.8,
        },
      });
      created.push(record);
    }

    return created;
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
