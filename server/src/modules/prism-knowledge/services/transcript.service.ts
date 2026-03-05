import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { FfmpegService } from '../../../infrastructure/media/ffmpeg.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TranscriptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  async generateTranscript(
    video: {
      id: string;
      title: string;
      sourceType: string;
      storagePath: string;
      duration: number | null;
    },
    userId: string,
    options: {
      regenerate?: boolean;
      onSegment?: (
        segment: { start: number; end: number; text: string; confidence?: number },
        index: number,
        total: number,
      ) => Promise<void> | void;
      onStatus?: (
        status: 'processing' | 'streaming' | 'completed' | 'failed',
        metadata?: Record<string, unknown>,
      ) => Promise<void> | void;
    } = {},
  ) {
    const shouldRegenerate = options.regenerate ?? false;

    if (!shouldRegenerate) {
      const existing = await this.prisma.transcript.findFirst({
        where: { videoId: video.id },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return existing;
      }
    }

    await this.prisma.videoSource.update({
      where: { id: video.id },
      data: { transcriptStatus: 'PROCESSING' },
    });
    await options.onStatus?.('processing');

    try {
      const segments = await this.runAsr(video, userId);
      const segmentItems = (segments as Array<{
        start: number;
        end: number;
        text: string;
        confidence?: number;
      }>) ?? [];

      const transcript = await this.prisma.transcript.create({
        data: {
          videoId: video.id,
          language: 'auto',
          provider: segments.provider,
          segments: segments as any,
        },
      });

      await this.prisma.videoSource.update({
        where: { id: video.id },
        data: { transcriptStatus: 'COMPLETED' },
      });
      await options.onStatus?.('streaming', { segmentCount: segmentItems.length });

      const streamLimit = Math.min(segmentItems.length, 40);
      for (let i = 0; i < streamLimit; i += 1) {
        await options.onSegment?.(segmentItems[i], i, streamLimit);
      }
      await options.onStatus?.('completed', { segmentCount: segmentItems.length });

      return transcript;
    } catch (error) {
      await this.prisma.videoSource.update({
        where: { id: video.id },
        data: { transcriptStatus: 'FAILED' },
      });
      await options.onStatus?.('failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async runAsr(
    video: {
      id: string;
      title: string;
      sourceType: string;
      storagePath: string;
      duration: number | null;
    },
    userId: string,
  ) {
    if (video.sourceType !== 'LOCAL_UPLOAD' || !video.storagePath) {
      throw new Error('当前仅支持对本地上传视频执行转写');
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vp-asr-'));
    try {
      const videoExt = await this.inferExtForTempVideo(video.storagePath);
      const tempVideoPath = path.join(tempDir, `${video.id}${videoExt}`);
      const tempAudioPath = path.join(tempDir, `${video.id}.mp3`);

      const videoBuffer = await this.storage.download(video.storagePath);
      await fs.writeFile(tempVideoPath, videoBuffer);
      await this.ffmpeg.extractAudio(tempVideoPath, tempAudioPath);

      const audioBuffer = await fs.readFile(tempAudioPath);
      const asrResult = await this.aiRouter.execute(
        AITaskType.ASR,
        {
          audio: audioBuffer.toString('base64'),
          format: 'mp3',
          language: 'auto',
        },
        userId,
      );

      const hasSegments =
        Array.isArray(asrResult?.segments) && asrResult.segments.length > 0;
      if (!hasSegments && !(asrResult?.text ?? '').trim()) {
        throw new Error('ASR 返回为空，无法生成转写');
      }
      const rawSegments = hasSegments
        ? asrResult.segments
        : this.wrapTextToSegments(asrResult?.text ?? '', video.duration ?? 120);

      return Object.assign(
        rawSegments.map((seg: any, idx: number) => ({
          start: Number(seg.start ?? idx * 10),
          end: Number(seg.end ?? (idx + 1) * 10),
          text: String(seg.text ?? ''),
          confidence: Number(seg.confidence ?? 0.9),
        })),
        { provider: asrResult?.provider || asrResult?.providerName || 'asr' },
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private wrapTextToSegments(text: string, duration: number) {
    const clean = text.trim();
    if (!clean) {
      throw new Error('ASR 未返回可用文本');
    }

    const clauses = clean
      .split(/[。！？\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);

    const items = clauses.length ? clauses : [clean];
    const segDuration = Math.max(8, duration / items.length);
    return items.map((item, idx) => ({
      start: Number((idx * segDuration).toFixed(2)),
      end: Number(Math.min(duration, (idx + 1) * segDuration).toFixed(2)),
      text: item,
      confidence: 0.9,
    }));
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
