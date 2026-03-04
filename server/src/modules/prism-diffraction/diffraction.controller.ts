import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DiffractionService } from './diffraction.service';
import { ImageSelectService } from './services/image-select.service';
import { CopywritingService } from './services/copywriting.service';
import { BatchExportService } from './services/batch-export.service';
import { BatchExportDiffractionDto, GenerateDiffractionDto } from './dto';
import { PrismaService } from '../../prisma/prisma.service';

interface ControllerFrameQuality {
  timestamp: number;
  imageUrl: string;
  qualityScore: number;
  hasDataChart: boolean;
  hasSpeaker: boolean;
  emotionScore?: number;
  description?: string;
}

interface ControllerCopywritingResult {
  platformDraftId: string;
  generatedContent: string;
  suggestions?: string[];
}

interface ControllerAssetPackage {
  taskId: string;
  platform: string;
  assets: {
    images: string[];
    copywriting: string;
    dataFileUrl: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('api/prism/diffraction')
export class DiffractionController {
  constructor(
    private readonly diffractionService: DiffractionService,
    private readonly imageSelectService: ImageSelectService,
    private readonly copywritingService: CopywritingService,
    private readonly batchExportService: BatchExportService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('templates')
  getTemplates() {
    return this.diffractionService.getTemplates();
  }

  @Post(':videoId/generate')
  generate(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: GenerateDiffractionDto,
  ) {
    return this.diffractionService.generate(userId, videoId, dto);
  }

  @Post('videos/:videoId/export')
  @Post(':videoId/batch-export')
  batchExport(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: BatchExportDiffractionDto,
  ) {
    return this.diffractionService.batchExport(userId, videoId, dto);
  }

  @Post('keyframes')
  async extractKeyFrames(
    @CurrentUser() userId: string,
    @Body() dto: { videoId: string; count?: number },
  ): Promise<{ videoId: string; frames: ControllerFrameQuality[] }> {
    const video = await this.prisma.videoSource.findUnique({
      where: { id: dto.videoId },
      select: { storagePath: true, duration: true },
    });

    if (!video || !video.storagePath) {
      throw new Error('Video not found or has no storage path');
    }

    const duration = video.duration || 120;

    const frames = await this.imageSelectService.extractKeyFrames(
      video.storagePath,
      duration,
      dto.count || 12,
    );

    return { videoId: dto.videoId, frames };
  }

  @Post('copywriting')
  async generateCopywriting(
    @CurrentUser() userId: string,
    @Body() dto: {
      videoId: string;
      platform: string;
      selectedFrames: Array<{ imageUrl: string; timestamp?: number }>;
      styleHints?: string;
      previousDraftId?: string;
    },
  ): Promise<ControllerCopywritingResult> {
    let task = await this.prisma.diffractionTask.findFirst({
      where: { videoId: dto.videoId, userId },
    });

    if (!task) {
      task = await this.prisma.diffractionTask.create({
        data: {
          videoId: dto.videoId,
          userId,
          status: 'PROCESSING',
        },
      });
    }

    const result = await this.copywritingService.generateCopywriting(userId, {
      videoId: dto.videoId,
      platform: dto.platform as any,
      selectedFrames: dto.selectedFrames.map(f => f.imageUrl),
      styleHints: dto.styleHints,
      previousDraftId: dto.previousDraftId,
    });

    return result;
  }

  @Post('export')
  async generateAssets(
    @CurrentUser() userId: string,
    @Body() dto: {
      videoId: string;
      platforms: string[];
      draftIds?: string[];
    },
  ): Promise<ControllerAssetPackage[]> {
    let task = await this.prisma.diffractionTask.findFirst({
      where: { videoId: dto.videoId, userId },
    });

    if (!task) {
      task = await this.prisma.diffractionTask.create({
        data: {
          videoId: dto.videoId,
          userId,
          status: 'PROCESSING',
        },
      });
    }

    const result = await this.batchExportService.generateAssets(userId, {
      videoId: task.id,
      platforms: dto.platforms as any[],
      draftIds: dto.draftIds,
    });

    return result;
  }

  @Get('drafts/:videoId')
  async getDrafts(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    const task = await this.prisma.diffractionTask.findFirst({
      where: { videoId, userId },
      include: { platformDrafts: true },
    });

    if (!task) {
      return { videoId, drafts: [] };
    }

    const drafts = task.platformDrafts.map(draft => ({
      id: draft.id,
      platform: draft.platform.toLowerCase(),
      title: draft.title,
      content: draft.content,
      selectedImages: draft.selectedImages,
      isPublished: draft.isPublished,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    }));

    return { videoId, drafts };
  }

  @Delete('drafts/:draftId')
  async deleteDraft(
    @CurrentUser() userId: string,
    @Param('draftId') draftId: string,
  ) {
    const draft = await this.prisma.platformDraft.findUnique({
      where: { id: draftId },
      include: { diffraction: true },
    });

    if (!draft || !draft.diffraction) {
      throw new Error('Draft not found');
    }

    // 验证权限
    if (draft.diffraction.userId !== userId) {
      throw new Error('Permission denied');
    }

    await this.prisma.platformDraft.delete({
      where: { id: draftId },
    });

    return { draftId, deleted: true };
  }
}
