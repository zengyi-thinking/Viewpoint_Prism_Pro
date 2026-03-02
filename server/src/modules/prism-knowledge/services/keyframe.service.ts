import { Injectable, Logger } from '@nestjs/common';
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
    options: { regenerate?: boolean } = {},
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

    if (shouldRegenerate) {
      await this.prisma.keyframe.deleteMany({ where: { videoId: video.id } });
    }

    let created: any[] = [];
    try {
      if (video.sourceType === 'LOCAL_UPLOAD' && video.storagePath) {
        created = await this.extractFromLocalUpload(video, userId);
      } else {
        created = await this.createFallbackKeyframes(video);
      }

      await this.prisma.videoSource.update({
        where: { id: video.id },
        data: { keyframeStatus: 'COMPLETED' },
      });
      return created;
    } catch (error) {
      this.logger.error(`Keyframe extraction failed for ${video.id}: ${error.message}`);
      await this.prisma.videoSource.update({
        where: { id: video.id },
        data: { keyframeStatus: 'FAILED' },
      });
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
  ) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vp-keyframe-'));
    try {
      const tempVideoPath = path.join(tempDir, `${video.id}.mp4`);
      const downloaded = await this.storage.download(video.storagePath);
      await fs.writeFile(tempVideoPath, downloaded);

      const meta = await this.ffmpeg.getVideoMetadata(tempVideoPath);
      const rawDuration = Number(video.duration ?? meta.duration ?? 0);
      const safeDuration = rawDuration > 0 ? rawDuration : 60;
      const timestamps = this.pickTimestamps(safeDuration);

      const frameTypes = ['PPT', 'WHITEBOARD', 'CHART', 'SCENE_CHANGE', 'SPEAKER'] as const;
      const created: any[] = [];

      for (let idx = 0; idx < timestamps.length; idx += 1) {
        const ts = timestamps[idx];
        const tempFramePath = path.join(tempDir, `frame-${idx + 1}.jpg`);

        try {
          await this.ffmpeg.extractFrame(tempVideoPath, ts, tempFramePath);
        } catch (error) {
          this.logger.warn(`Skip keyframe at ${ts}s for ${video.id}: ${error.message}`);
          continue;
        }

        const frameBuffer = await fs.readFile(tempFramePath);
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
}
