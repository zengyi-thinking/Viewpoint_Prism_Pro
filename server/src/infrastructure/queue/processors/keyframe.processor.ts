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

interface KeyframeJobData {
  videoId: string;
  userId: string;
  projectId: string;
  interval?: number; // Seconds between frames
  maxFrames?: number;
}

@Processor(QUEUE_NAMES.KEYFRAME)
export class KeyframeProcessor {
  private readonly logger = new Logger(KeyframeProcessor.name);

  constructor(
    private readonly ffmpegService: FfmpegService,
    private readonly aiRouterService: AiRouterService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  @Process()
  async handleKeyframe(job: Job<KeyframeJobData>) {
    const { videoId, userId, projectId, interval = 5, maxFrames = 50 } = job.data;

    this.logger.log(`Starting keyframe extraction for video ${videoId}`);

    try {
      await job.progress(10);
      this.emitProgress(userId, projectId, videoId, 'keyframe', 10, 'Loading video...');

      // Get video from database
      const video = await this.prisma.videoSource.findUnique({
        where: { id: videoId },
      });

      if (!video) {
        throw new Error(`Video ${videoId} not found`);
      }

      // Update video status
      await this.prisma.videoSource.update({
        where: { id: videoId },
        data: { keyframeStatus: 'PROCESSING' },
      });

      // Download video from storage
      const videoBuffer = await this.storageService.download(video.storagePath);
      const tempVideoPath = `/tmp/${videoId}-keyframe-${Date.now()}.mp4`;
      require('fs').writeFileSync(tempVideoPath, videoBuffer);

      await job.progress(20);
      this.emitProgress(userId, projectId, videoId, 'keyframe', 20, 'Extracting frames...');

      // Extract frames at regular intervals
      const framePaths = await this.ffmpegService.extractFrames(
        tempVideoPath,
        interval,
        maxFrames,
      );

      this.logger.log(`Extracted ${framePaths.length} frames from video ${videoId}`);

      await job.progress(50);
      this.emitProgress(userId, projectId, videoId, 'keyframe', 50, 'Analyzing frames...');

      // Analyze each frame with multimodal model
      const keyframes: any[] = [];
      const fs = require('fs');

      for (let i = 0; i < framePaths.length; i++) {
        const framePath = framePaths[i];
        const timestamp = i * interval;

        // Read frame image
        const frameBuffer = fs.readFileSync(framePath);
        const frameBase64 = frameBuffer.toString('base64');

        // Call AI Router for frame analysis
        const analysis = await this.aiRouterService.execute(
          AITaskType.MULTIMODAL,
          {
            image: frameBase64,
            prompt: 'Analyze this video frame. Classify as PPT, WHITEBOARD, CHART, SCENE_CHANGE, or SPEAKER. Describe the key content.',
          },
          userId,
        );

        // Determine frame type
        const frameType = this.classifyFrameType(analysis);

        // Upload frame to storage
        const storageKey = this.storageService.generateStoragePath(
          userId,
          projectId,
          'keyframes',
          `${videoId}-frame-${i}.jpg`,
        );
        const frameUrl = await this.storageService.upload(
          frameBuffer,
          storageKey,
          { contentType: 'image/jpeg' },
        );

        // Save keyframe to database
        const keyframe = await this.prisma.keyframe.create({
          data: {
            videoId,
            timestamp,
            frameType,
            storagePath: storageKey,
            description: analysis.description || '',
            similarity: analysis.confidence || 0,
          },
        });

        keyframes.push(keyframe);

        // Update progress
        const progress = 50 + Math.floor((i / framePaths.length) * 40);
        await job.progress(progress);
        this.emitProgress(userId, projectId, videoId, 'keyframe', progress, `Analyzed ${i + 1}/${framePaths.length} frames`);

        // Cleanup temp frame file
        fs.unlinkSync(framePath);
      }

      // Remove duplicate keyframes (based on perceptual hash similarity)
      const uniqueKeyframes = await this.deduplicateKeyframes(keyframes);

      // Update video status
      await this.prisma.videoSource.update({
        where: { id: videoId },
        data: { keyframeStatus: 'COMPLETED' },
      });

      await job.progress(100);
      this.emitProgress(userId, projectId, videoId, 'keyframe', 100, 'Keyframe extraction completed');

      // Cleanup temp video file
      fs.unlinkSync(tempVideoPath);

      this.logger.log(`Keyframe extraction completed for video ${videoId}. Found ${uniqueKeyframes.length} unique keyframes`);

      return {
        success: true,
        videoId,
        totalFrames: framePaths.length,
        uniqueKeyframes: uniqueKeyframes.length,
      };
    } catch (error) {
      this.logger.error(`Keyframe extraction failed for video ${videoId}: ${error.message}`, error.stack);

      await this.prisma.videoSource.update({
        where: { id: videoId },
        data: { keyframeStatus: 'FAILED' },
      });

      this.emitError(userId, projectId, videoId, 'keyframe', error.message);

      throw error;
    }
  }


  private classifyFrameType(analysis: any): 'PPT' | 'WHITEBOARD' | 'CHART' | 'SCENE_CHANGE' | 'SPEAKER' {
    const content = (analysis.description || analysis.content || '').toLowerCase();

    if (content.includes('ppt') || content.includes('powerpoint') || content.includes('slide')) {
      return 'PPT';
    }
    if (content.includes('whiteboard') || content.includes('blackboard') || content.includes('handwriting')) {
      return 'WHITEBOARD';
    }
    if (content.includes('chart') || content.includes('graph') || content.includes('diagram')) {
      return 'CHART';
    }
    if (content.includes('scene') || content.includes('location') || content.includes('background')) {
      return 'SCENE_CHANGE';
    }
    return 'SPEAKER';
  }

  private async deduplicateKeyframes(keyframes: any[]): Promise<any[]> {
    // Simple deduplication based on frame type and description similarity
    const seen = new Set<string>();
    const unique: any[] = [];

    for (const keyframe of keyframes) {
      const key = `${keyframe.frameType}-${keyframe.description.substring(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(keyframe);
      } else {
        // Delete duplicate keyframe
        await this.prisma.keyframe.delete({ where: { id: keyframe.id } });
      }
    }

    return unique;
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
}
