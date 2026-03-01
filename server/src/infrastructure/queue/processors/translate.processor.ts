import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../queue.constants';
import { AiRouterService } from '../../ai-router/ai-router.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WsGateway } from '../../websocket/ws.gateway';
import { AITaskType } from '../../ai-router/ai-router.interface';

interface TranslateJobData {
  translationTaskId: string;
  userId: string;
  projectId: string;
  videoId: string;
}

@Processor(QUEUE_NAMES.TRANSLATE)
export class TranslateProcessor {
  private readonly logger = new Logger(TranslateProcessor.name);

  constructor(
    private readonly aiRouterService: AiRouterService,
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  @Process()
  async handleTranslate(job: Job<TranslateJobData>) {
    const { translationTaskId, userId, projectId, videoId } = job.data;

    this.logger.log(`Starting translation task ${translationTaskId}`);

    try {
      await job.progress(10);
      this.emitProgress(userId, projectId, translationTaskId, 'translate', 10, 'Loading task data...');

      // Get translation task
      const translationTask = await this.prisma.translationTask.findUnique({
        where: { id: translationTaskId },
        include: {
          video: {
            include: {
              transcripts: true,
            },
          },
        },
      });

      if (!translationTask) {
        throw new Error(`Translation task ${translationTaskId} not found`);
      }

      // Get transcript segments
      const transcript = translationTask.video.transcripts[0];
      if (!transcript) {
        throw new Error('Video must have transcript before translation');
      }

      const segments = transcript.segments as Array<{ start: number; end: number; text: string }>;

      await job.progress(20);
      this.emitProgress(userId, projectId, translationTaskId, 'translate', 20, 'Translating subtitles...');

      // Translate for each target language
      const subtitleTracks: any[] = [];

      for (const targetLang of translationTask.targetLangs) {
        this.logger.log(`Translating to ${targetLang}`);

        // Build segments for translation
        const translatedSegments: any[] = [];

        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i];

          // Call AI Router for translation
          const translation = await this.aiRouterService.execute(
            AITaskType.TRANSLATION,
            {
              text: segment.text,
              sourceLang: translationTask.sourceLang,
              targetLang,
              context: 'video subtitle',
            },
            userId,
          );

          translatedSegments.push({
            start: segment.start,
            end: segment.end,
            text: translation.text || translation.translation || segment.text,
          });

          // Update progress
          const progress = 20 + Math.floor(((i + 1) / segments.length) * 50);
          await job.progress(progress);
          this.emitProgress(userId, projectId, translationTaskId, 'translate', progress, `Translated ${i + 1}/${segments.length} segments to ${targetLang}`);
        }

        // Generate SRT content
        const srtContent = this.generateSRT(translatedSegments);

        // Create subtitle track
        const subtitleTrack = await this.prisma.subtitleTrack.create({
          data: {
            translationId: translationTaskId,
            language: targetLang,
            segments: translatedSegments,
            srtContent,
          },
        });

        subtitleTracks.push(subtitleTrack);
      }

      await job.progress(95);
      this.emitProgress(userId, projectId, translationTaskId, 'translate', 95, 'Saving translations...');

      // Update translation task status
      await this.prisma.translationTask.update({
        where: { id: translationTaskId },
        data: { subtitleStatus: 'COMPLETED' },
      });

      await job.progress(100);
      this.emitProgress(userId, projectId, translationTaskId, 'translate', 100, 'Translation completed');

      this.logger.log(`Translation task ${translationTaskId} completed`);

      return {
        success: true,
        translationTaskId,
        languages: subtitleTracks.map(t => t.language),
      };
    } catch (error) {
      this.logger.error(`Translation task ${translationTaskId} failed: ${error.message}`, error.stack);

      await this.prisma.translationTask.update({
        where: { id: translationTaskId },
        data: { subtitleStatus: 'FAILED' },
      });

      this.emitError(userId, projectId, translationTaskId, 'translate', error.message);

      throw error;
    }
  }




  private generateSRT(segments: Array<{ start: number; end: number; text: string }>): string {
    return segments
      .map((seg, index) => {
        const startTime = this.formatSRTTime(seg.start);
        const endTime = this.formatSRTTime(seg.end);
        return `${index + 1}\n${startTime} --> ${endTime}\n${seg.text}\n`;
      })
      .join('\n');
  }

  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  private emitProgress(userId: string, projectId: string, taskId: string, task: string, progress: number, message: string) {
    this.wsGateway.emitToUser(userId, 'task:progress', {
      projectId,
      translationTaskId: taskId,
      task,
      progress,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private emitError(userId: string, projectId: string, taskId: string, task: string, error: string) {
    this.wsGateway.emitToUser(userId, 'task:error', {
      projectId,
      translationTaskId: taskId,
      task,
      error,
      timestamp: new Date().toISOString(),
    });
  }
}
