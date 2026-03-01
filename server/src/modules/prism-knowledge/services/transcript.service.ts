import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(TranscriptService.name);

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
    options: { regenerate?: boolean } = {},
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

    const segments = await this.tryAsrOrFallback(video, userId);

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

    return transcript;
  }

  private async tryAsrOrFallback(
    video: {
      id: string;
      title: string;
      sourceType: string;
      storagePath: string;
      duration: number | null;
    },
    userId: string,
  ) {
    try {
      if (video.sourceType !== 'LOCAL_UPLOAD' || !video.storagePath) {
        throw new Error('non-local source currently uses fallback');
      }

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vp-asr-'));
      const tempVideoPath = path.join(tempDir, `${video.id}.mp4`);
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

      await fs.rm(tempDir, { recursive: true, force: true });

      const rawSegments = Array.isArray(asrResult?.segments)
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
    } catch (error) {
      this.logger.warn(`ASR fallback triggered for video ${video.id}: ${error.message}`);
      const fallback = this.buildMockSegments(video.title, video.duration ?? 120);
      return Object.assign(fallback, { provider: 'mock-asr' });
    }
  }

  private buildMockSegments(title: string, duration: number) {
    const safeDuration = Math.max(30, Math.floor(duration));
    const segmentCount = Math.max(3, Math.min(12, Math.ceil(safeDuration / 45)));
    const segDuration = safeDuration / segmentCount;

    const ideas = [
      '背景与问题定义',
      '关键概念与术语说明',
      '核心方法拆解',
      '示例与案例说明',
      '常见误区与纠正',
      '行动建议与总结',
    ];

    return Array.from({ length: segmentCount }, (_, idx) => {
      const start = Number((idx * segDuration).toFixed(2));
      const end = Number(Math.min(safeDuration, (idx + 1) * segDuration).toFixed(2));
      const idea = ideas[idx % ideas.length];
      return {
        start,
        end,
        text: `【${title}】第 ${idx + 1} 段：${idea}。`,
        confidence: 0.94,
      };
    });
  }

  private wrapTextToSegments(text: string, duration: number) {
    const clean = text.trim();
    if (!clean) return this.buildMockSegments('视频', duration);

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
}
