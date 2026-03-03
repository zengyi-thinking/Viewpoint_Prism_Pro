import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { FfmpegService } from '../../../infrastructure/media/ffmpeg.service';
import * as path from 'path';

export type ExportFormat = 'xiaohongshu' | 'twitter_x' | 'newsletter' | 'linkedin' | 'instagram';

interface GenerateAssetsDto {
  videoId: string;
  platforms: ExportFormat[];
  draftIds?: string[];
}

interface AssetPackage {
  taskId: string;
  platform: string;
  assets: {
    images: string[];
    copywriting: string;
    dataFileUrl: string;
  };
}

@Injectable()
export class BatchExportService {
  private readonly logger = new Logger(BatchExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  async generateAssets(
    userId: string,
    dto: GenerateAssetsDto,
  ): Promise<AssetPackage[]> {
    const { videoId, platforms, draftIds } = dto;

    const task = await this.prisma.diffractionTask.findUnique({
      where: { id: videoId },
    });

    if (!task) {
      throw new Error('DiffractionTask not found');
    }

    const assetPackages = await Promise.all(
      platforms.map(async (platform) => {
        const draft = await this.prisma.platformDraft.findFirst({
          where: {
            diffractionId: task.id,
            platform: platform.toUpperCase() as any,
          },
        });

        if (!draft) {
          this.logger.warn('No draft found for platform, skipping');
          return null;
        }

        const images = (draft.selectedImages as string[]) || [];

        const processedImages = await this.processImages(
          images,
          platform,
          task.id,
        );

        const copywriting = draft.content || '';

        const jsonContent = this.buildJsonExport(platform, processedImages, copywriting, draft);

        const dataFileUrl = await this.storage.upload(
          Buffer.from(JSON.stringify(jsonContent, null, 2), 'utf8'),
          'diffraction/' + task.id + '/' + platform + '/data.json',
          { 'Content-Type': 'application/json' },
        );

        return {
          taskId: task.id,
          platform,
          assets: {
            images: processedImages,
            copywriting,
            dataFileUrl: dataFileUrl,
          },
        };
      })
    );

    await this.prisma.diffractionTask.update({
      where: { id: task.id },
      data: { status: 'COMPLETED', updatedAt: new Date() },
    });

    return assetPackages.filter(pkg => pkg !== null);
  }

  private async processImages(
    imageUrls: string[],
    platform: ExportFormat,
    taskId: string,
  ): Promise<string[]> {
    const platformSpecs = {
      xiaohongshu: { width: 1080, height: 1920 },
      twitter_x: { width: 1200, height: 900 },
      newsletter: { width: 1200, height: 800 },
      linkedin: { width: 1200, height: 627 },
      instagram: { width: 1080, height: 1080 },
    };

    const spec = platformSpecs[platform];
    if (!spec) {
      return imageUrls;
    }

    return Promise.all(
      imageUrls.map(async (url) => {
        try {
          const tempPath = url;
          const resizedPath = await this.ffmpeg.resizeImage(
            tempPath,
            { width: spec.width, height: spec.height, format: 'jpg', quality: 90 },
          );
          const resizedUrl = resizedPath;
          return resizedUrl;
        } catch (error) {
          this.logger.warn('Failed to process image');
          return url;
        }
      })
    );
  }

  private buildJsonExport(
    platform: ExportFormat,
    images: string[],
    copywriting: string,
    draft: any,
  ): any {
    return {
      platform,
      generatedAt: new Date().toISOString(),
      images,
      copywriting,
      draftId: draft.id,
      title: draft.title,
    };
  }
}
