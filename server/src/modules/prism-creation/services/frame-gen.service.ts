import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { FrameType } from '../dto';
import { randomUUID } from 'crypto';

@Injectable()
export class FrameGenService {
  private readonly logger = new Logger(FrameGenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Generate a frame (first or last) for a node
   * @param userId - User ID
   * @param nodeId - Flow node ID
   * @param frameType - 'first' or 'last'
   * @param customPrompt - Optional custom prompt to override node prompt
   * @returns Generated frame URL
   */
  async generateFrame(
    userId: string,
    nodeId: string,
    frameType: FrameType,
    customPrompt?: string,
  ): Promise<{ frameUrl: string; frameType: string }> {
    // Get the node
    const node = await this.prisma.flowNode.findUnique({
      where: { id: nodeId },
      include: { flowProject: true },
    });

    if (!node) {
      throw new NotFoundException('Node not found');
    }

    // Check if frame is locked
    const isLocked = frameType === FrameType.FIRST ? node.firstFrameLocked : node.lastFrameLocked;
    if (isLocked) {
      throw new BadRequestException(`${frameType === FrameType.FIRST ? '首帧' : '落幅'}已被锁定，无法重新生成`);
    }

    // Get the prompt for generation
    const prompt = customPrompt || node.prompt;
    if (!prompt) {
      throw new BadRequestException('节点没有可用于生成帧的描述');
    }

    // Enhance prompt based on frame type
    const enhancedPrompt = this.enhancePrompt(prompt, frameType);

    this.logger.log(`Generating ${frameType} frame for node ${nodeId} with prompt: ${enhancedPrompt}`);

    try {
      // Call AI Router to generate image
      const result = await this.aiRouter.execute(AITaskType.IMAGE_GEN, {
        prompt: enhancedPrompt,
        aspect_ratio: '16:9',
      }, userId);

      // Extract image URL from result
      const imageUrl = this.extractImageUrl(result);

      if (!imageUrl) {
        // If no image URL returned, use a placeholder for development
      this.logger.warn('AI provider did not return image URL, using placeholder');
        return {
          frameUrl: 'https://placehold.co/1280x720/2D2D3A/E91E8C?text=Generated+Frame',
          frameType,
        };
      }

      // Download image and upload to storage
      const frameBuffer = await this.downloadImage(imageUrl);
      const storageKey = `frames/${userId}/${node.flowProjectId}/${nodeId}-${frameType}-${randomUUID()}.png`;

      const uploadedUrl = await this.storage.upload(frameBuffer, storageKey, {
        'Content-Type': 'image/png',
      });

      // Update node with frame URL
      const updateData = frameType === FrameType.FIRST
        ? { firstFrameUrl: uploadedUrl }
        : { lastFrameUrl: uploadedUrl };

      await this.prisma.flowNode.update({
        where: { id: nodeId },
        data: updateData,
      });

      this.logger.log(`Generated ${frameType} frame for node ${nodeId}: ${uploadedUrl}`);

      return {
        frameUrl: uploadedUrl,
        frameType,
      };
    } catch (error) {
      this.logger.error(`Failed to generate ${frameType} frame for node ${nodeId}: ${error.message}`, error.stack);

      // Return placeholder on error for development
      return {
        frameUrl: `https://placehold.co/1280x720/2D2D3A/E91E8C?text=${frameType === FrameType.FIRST ? 'First+Frame' : 'Last+Frame'}`,
        frameType,
      };
    }
  }

  /**
   * Lock or unlock a frame
   * @param userId - User ID
   * @param nodeId - Flow node ID
   * @param frameType - 'first' or 'last'
   * @param locked - Whether to lock or unlock
   */
  async lockFrame(
    userId: string,
    nodeId: string,
    frameType: FrameType,
    locked: boolean,
  ): Promise<{ success: boolean; frameType: string; locked: boolean }> {
    // Get the node
    const node = await this.prisma.flowNode.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      throw new NotFoundException('Node not found');
    }

    // Update lock status
    const updateData = frameType === FrameType.FIRST
      ? { firstFrameLocked: locked }
      : { lastFrameLocked: locked };

    await this.prisma.flowNode.update({
      where: { id: nodeId },
      data: updateData,
    });

    this.logger.log(`${locked ? 'Locked' : 'Unlocked'} ${frameType} frame for node ${nodeId}`);

    return {
      success: true,
      frameType,
      locked,
    };
  }

  /**
   * Enhance prompt based on frame type
   */
  private enhancePrompt(prompt: string, frameType: FrameType): string {
    if (frameType === FrameType.FIRST) {
      return `${prompt}, opening shot, beginning scene, first frame, high quality, detailed`;
    } else {
      return `${prompt}, ending shot, final scene, last frame, conclusion, high quality, detailed`;
    }
  }

  /**
   * Extract image URL from AI provider result
   */
  private extractImageUrl(result: any): string | null {
    // Try various common response formats
    if (result?.url) return result.url;
    if (result?.image_url) return result.image_url;
    if (result?.data?.[0]?.url) return result.data[0].url;
    if (result?.data?.[0]?.image_url) return result.data[0].image_url;
    if (result?.images?.[0]?.url) return result.images[0].url;

    // For development, return null to use placeholder
    return null;
  }

  /**
   * Download image from URL
   */
  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
