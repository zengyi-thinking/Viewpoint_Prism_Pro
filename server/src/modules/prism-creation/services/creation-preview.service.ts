import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { FfmpegService } from '../../../infrastructure/media/ffmpeg.service';
import { WsGateway } from '../../../infrastructure/websocket/ws.gateway';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import * as path from 'path';
import * as fs from 'fs/promises';

interface CharacterAnchor {
  identity?: string;
  hair?: string;
  outfit?: string;
  face?: string;
  prop?: string;
}

@Injectable()
export class CreationPreviewService {
  private readonly logger = new Logger(CreationPreviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
    private readonly wsGateway: WsGateway,
  ) {}

  /**
   * Generate 3x3 grid preview for a node
   * Creates 9 intermediate frames between first and last frame,
   * then stitches them into a 3x3 grid
   */
  async generateNodePreview(params: {
    nodeId: string;
    userId: string;
    projectId: string;
    flowProjectId: string;
    firstFrameUrl: string;
    lastFrameUrl: string;
    prompt: string;
    continuityNotes?: string;
    characterAnchor?: CharacterAnchor;
    duration?: number; // default 3 seconds
  }): Promise<{ previewGridUrl: string; frameUrls: string[] }> {
    const {
      nodeId,
      userId,
      projectId,
      flowProjectId,
      firstFrameUrl,
      lastFrameUrl,
      prompt,
      continuityNotes,
      characterAnchor,
      duration = 3,
    } = params;

    this.logger.log(`Generating preview for node ${nodeId}`);

    // Update node preview status
    await this.prisma.flowNode.update({
      where: { id: nodeId },
      data: { previewStatus: 'PROCESSING' },
    });

    try {
      // Download first and last frame images
      this.emitProgress(userId, projectId, nodeId, 'preview', 5, 'Downloading frame images...');

      const firstFrameBuffer = await this.storage.download(
        this.storage.resolveStorageKey(firstFrameUrl),
      );
      const lastFrameBuffer = await this.storage.download(
        this.storage.resolveStorageKey(lastFrameUrl),
      );

      const firstFrameBase64 = firstFrameBuffer.toString('base64');
      const lastFrameBase64 = lastFrameBuffer.toString('base64');

      // Build the continuity prompt
      const continuityPrompt = [
        prompt.trim(),
        continuityNotes?.trim() || '',
        this.serializeCharacterAnchor(characterAnchor),
      ].filter(Boolean).join('\n');

      // Generate 9 intermediate frames at evenly distributed timestamps
      const frameUrls: string[] = [];
      const timestamps = this.generateTimestamps(duration, 9);

      for (let i = 0; i < 9; i++) {
        const progress = 10 + Math.floor((i / 9) * 60);
        this.emitProgress(userId, projectId, nodeId, 'preview', progress, `Generating frame ${i + 1}/9...`);

        // Use interpolation between first and last frame
        // For image-to-video, we use the first frame and a slight variation for each timestamp
        const frameResult = await this.aiRouter.execute(
          AITaskType.IMAGE_GEN,
          {
            prompt: continuityPrompt || prompt,
            image_size: '1280x720',
            num_inference_steps: 24,
            guidance_scale: 7,
            negative_prompt:
              'text, chinese characters, calligraphy, title, logo, watermark, poster layout, typography, word overlay, low detail, fantasy mountains, floating clouds, abstract concept art',
            // Use first frame as reference for continuity
            image: i < 4 ? firstFrameBase64 : lastFrameBase64,
          },
          userId,
        );

        const remoteUrl = String(frameResult?.imageUrl || frameResult?.url || '').trim();
        if (!remoteUrl) {
          throw new Error(`Frame ${i + 1}: Image model did not return a downloadable URL`);
        }

        // Download and upload to storage
        const response = await fetch(remoteUrl);
        if (!response.ok) {
          throw new Error(`Failed to download generated image (${response.status})`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const storageKey = this.storage.generateStoragePath(
          userId,
          projectId,
          'preview-frames',
          `${nodeId}-frame-${i + 1}.png`,
        );
        const uploadedUrl = await this.storage.upload(buffer, storageKey, { contentType: 'image/png' });
        frameUrls.push(uploadedUrl);
      }

      // Create 3x3 grid from the 9 frames
      this.emitProgress(userId, projectId, nodeId, 'preview', 75, 'Creating grid preview...');

      // Download all frames to temp files
      const tempDir = path.join(process.cwd(), 'temp', 'preview', nodeId);
      await fs.mkdir(tempDir, { recursive: true });
      const tempImagePaths: string[] = [];

      for (let i = 0; i < 9; i++) {
        const frameBuffer = await this.storage.download(
          this.storage.resolveStorageKey(frameUrls[i]),
        );
        const tempPath = path.join(tempDir, `frame-${i + 1}.jpg`);
        await fs.writeFile(tempPath, frameBuffer);
        tempImagePaths.push(tempPath);
      }

      // Create grid preview
      const gridPath = path.join(tempDir, `grid-${Date.now()}.jpg`);
      await this.ffmpeg.createGridPreview(tempImagePaths, gridPath);

      // Upload grid to storage
      const gridBuffer = await fs.readFile(gridPath);
      const gridStorageKey = this.storage.generateStoragePath(
        userId,
        projectId,
        'preview-grids',
        `${nodeId}-${Date.now()}.jpg`,
      );
      const previewGridUrl = await this.storage.upload(gridBuffer, gridStorageKey, {
        contentType: 'image/jpeg',
      });

      // Update node with preview data
      await this.prisma.flowNode.update({
        where: { id: nodeId },
        data: {
          previewGridUrl,
          previewStatus: 'COMPLETED',
          previewFrames: frameUrls,
        },
      });

      // Cleanup temp files
      await this.cleanupTempFiles(tempDir);

      this.emitProgress(userId, projectId, nodeId, 'preview', 100, 'Preview completed');
      this.wsGateway.emitToUser(userId, 'task:complete', {
        projectId,
        nodeId,
        task: 'preview',
        result: { previewGridUrl, frameUrls },
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Preview generated for node ${nodeId}: ${previewGridUrl}`);

      return { previewGridUrl, frameUrls };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Preview generation failed for node ${nodeId}: ${message}`);

      await this.prisma.flowNode.update({
        where: { id: nodeId },
        data: { previewStatus: 'FAILED' },
      });

      this.emitProgress(userId, projectId, nodeId, 'preview', 0, `Preview failed: ${message}`);
      this.wsGateway.emitToUser(userId, 'task:error', {
        projectId,
        nodeId,
        task: 'preview',
        error: message,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Generate evenly distributed timestamps for frame sampling
   * For a 3-second video: [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7]
   */
  private generateTimestamps(duration: number, count: number): number[] {
    const timestamps: number[] = [];
    const step = duration / (count + 1);
    for (let i = 1; i <= count; i++) {
      timestamps.push(step * i);
    }
    return timestamps;
  }

  private serializeCharacterAnchor(input?: CharacterAnchor): string {
    if (!input) return '';
    const parts: string[] = [];
    if (input.identity) parts.push(`identity=${input.identity}`);
    if (input.hair) parts.push(`hair=${input.hair}`);
    if (input.outfit) parts.push(`outfit=${input.outfit}`);
    if (input.face) parts.push(`face=${input.face}`);
    if (input.prop) parts.push(`prop=${input.prop}`);
    return parts.join('; ');
  }

  private emitProgress(
    userId: string,
    projectId: string,
    nodeId: string,
    task: string,
    progress: number,
    message: string,
  ) {
    this.wsGateway.emitToUser(userId, 'task:progress', {
      projectId,
      nodeId,
      task,
      progress,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private async cleanupTempFiles(tempDir: string) {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(`Failed to cleanup temp files: ${error}`);
    }
  }
}
