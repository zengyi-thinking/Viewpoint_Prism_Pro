import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../queue.constants';
import { FfmpegService } from '../../media/ffmpeg.service';
import { AiRouterService } from '../../ai-router/ai-router.service';
import { StorageService } from '../../storage/storage.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WsGateway } from '../../websocket/ws.gateway';
import { AITaskType } from '../../ai-router/ai-router.interface';

interface TranscribeJobData {
  videoId: string;
  userId: string;
  projectId: string;
  language?: string;
  provider?: string;
}

@Processor(QUEUE_NAMES.TRANSCRIBE)
export class TranscribeProcessor {
  private readonly logger = new Logger(TranscribeProcessor.name);

  constructor(
    private readonly ffmpegService: FfmpegService,
    private readonly aiRouterService: AiRouterService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  @Process()
  async handleTranscribe(job: Job<TranscribeJobData>) {
    const { videoId, userId, projectId, language = 'auto', provider } = job.data;

    this.logger.log(`Starting transcription for video ${videoId}`);

    try {
      // Update progress: 10%
      await job.progress(10);
      this.emitProgress(userId, projectId, videoId, 'transcribe', 10, 'Starting transcription...');

      // Step 1: Get video from database
      const video = await this.prisma.videoSource.findUnique({
        where: { id: videoId },
      });

      if (!video) {
        throw new Error(`Video ${videoId} not found`);
      }

      // Update video status
      await this.prisma.videoSource.update({
        where: { id: videoId },
        data: { transcriptStatus: 'PROCESSING' },
      });

      // Update progress: 20%
      await job.progress(20);
      this.emitProgress(userId, projectId, videoId, 'transcribe', 20, 'Extracting audio...');

      // Step 2: Download video from storage to temp path
      const videoBuffer = await this.storageService.download(video.storagePath);
      const tempVideoPath = `/tmp/${videoId}-${Date.now()}.mp4`;
      require('fs').writeFileSync(tempVideoPath, videoBuffer);

      // Step 3: Extract audio using FFmpeg
      const tempAudioPath = await this.ffmpegService.extractAudio(tempVideoPath);

      // Update progress: 40%
      await job.progress(40);
      this.emitProgress(userId, projectId, videoId, 'transcribe', 40, 'Running ASR...');

      // Step 4: Call AI Router for ASR
      const audioBuffer = require('fs').readFileSync(tempAudioPath);
      const audioBase64 = audioBuffer.toString('base64');

      const asrResult = await this.aiRouterService.execute(
        AITaskType.ASR,
        {
          audio: audioBase64,
          language,
          format: 'mp3',
        },
        userId,
      );

      // Update progress: 80%
      await job.progress(80);
      this.emitProgress(userId, projectId, videoId, 'transcribe', 80, 'Saving transcript...');

      // Step 5: Parse ASR result into segments
      const segments = this.parseASRResult(asrResult);

      // Step 6: Save transcript to database
      await this.prisma.transcript.create({
        data: {
          videoId,
          language: asrResult.language || language,
          provider: asrResult.provider || provider || 'whisper',
          segments,
        },
      });

      // Update video status
      await this.prisma.videoSource.update({
        where: { id: videoId },
        data: { transcriptStatus: 'COMPLETED' },
      });

      // Update progress: 100%
      await job.progress(100);
      this.emitProgress(userId, projectId, videoId, 'transcribe', 100, 'Transcription completed');

      // Cleanup temp files
      this.cleanupTempFiles([tempVideoPath, tempAudioPath]);

      this.logger.log(`Transcription completed for video ${videoId}`);

      return {
        success: true,
        videoId,
        segments: segments.length,
      };
    } catch (error) {
      this.logger.error(`Transcription failed for video ${videoId}: ${error.message}`, error.stack);

      // Update video status to failed
      await this.prisma.videoSource.update({
        where: { id: videoId },
        data: { transcriptStatus: 'FAILED' },
      });

      this.emitError(userId, projectId, videoId, 'transcribe', error.message);

      throw error;
    }
  }

  private parseASRResult(result: any): any[] {
    // Parse ASR result into segments with timestamps
    // Expected format: { segments: [{ start, end, text }] } or { text: "..." }
    if (result.segments && Array.isArray(result.segments)) {
      return result.segments.map(seg => ({
        start: seg.start || seg.begin || 0,
        end: seg.end || seg.finish || 0,
        text: seg.text || seg.content || '',
      }));
    }

    // If only full text provided, create a single segment
    if (result.text) {
      return [{
        start: 0,
        end: result.duration || 0,
        text: result.text,
      }];
    }

    // Fallback: return empty segments
    return [];
  }

  private emitProgress(userId: string, projectId: string, videoId: string, task: string, progress: number, message: string) {
    this.wsGateway.emitToUser(userId, 'task:progress', {
      projectId,
      videoId,
      task,
      progress,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private emitError(userId: string, projectId: string, videoId: string, task: string, error: string) {
    this.wsGateway.emitToUser(userId, 'task:error', {
      projectId,
      videoId,
      task,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  private cleanupTempFiles(paths: string[]) {
    const fs = require('fs');
    paths.forEach(path => {
      try {
        if (fs.existsSync(path)) {
          fs.unlinkSync(path);
        }
      } catch (error) {
        this.logger.warn(`Failed to cleanup temp file ${path}: ${error.message}`);
      }
    });
  }
}
