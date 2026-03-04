import { Injectable, Logger } from '@nestjs/common';
import { BatchExportDiffractionDto, GenerateDiffractionDto } from './dto';
import { BatchExportService } from './services/batch-export.service';
import { CopywritingService } from './services/copywriting.service';
import { PlatformTemplateService } from './services/platform-template.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WsGateway } from '../../infrastructure/websocket/ws.gateway';

@Injectable()
export class DiffractionService {
  private readonly logger = new Logger(DiffractionService.name);

  constructor(
    private readonly batchExportService: BatchExportService,
    private readonly copywritingService: CopywritingService,
    private readonly platformTemplateService: PlatformTemplateService,
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  /**
   * 获取平台模板列表
   */
  async getTemplates() {
    // 返回平台模板
    return {
      templates: [
        { platform: 'xiaohongshu', name: '种草干货模版', maxLength: 500 },
        { platform: 'twitter_x', name: 'Thread 悬念模版', maxLength: 280 },
        { platform: 'newsletter', name: '深度长文模版', maxLength: 2000 },
      ],
    };
  }

  /**
   * 生成衍射内容（AI 文案生成）
   */
  async generate(userId: string, videoId: string, dto: GenerateDiffractionDto) {
    const { platforms, tone, audience } = dto;
    const platform = platforms?.[0];
    const selectedFrames: string[] = [];
    const styleHints = [tone, audience].filter(Boolean).join('，') || undefined;
    const previousDraftId: string | undefined = undefined;

    if (!platform) {
      throw new Error('No platform selected');
    }

    this.logger.log(`Generating diffraction for ${platform}: videoId=${videoId}`);

    // 获取平台模板
    const platformTemplates = await this.platformTemplateService.getTemplates(platform);
    const platformTemplate = platformTemplates[0];
    if (!platformTemplate) {
      throw new Error(`No template found for platform: ${platform}`);
    }

    // 调用 CopywritingService 生成文案
    const draft = await this.copywritingService.generateCopywriting(userId, {
      videoId,
      platform: platform as any,
      selectedFrames,
      styleHints,
      previousDraftId,
    });

    // 保存到数据库
    const savedTask = await this.prisma.diffractionTask.create({
      data: {
        videoId,
        userId,
        status: 'PROCESSING',
      },
    });

    this.logger.log(`Created draft: ${savedTask.id}`);

    return {
      taskId: savedTask.id,
      userId,
      videoId,
      ...dto,
      status: 'PROCESSING',
    };
  }

  /**
   * 批量导出多平台内容
   */
  async batchExport(userId: string, videoId: string, dto: BatchExportDiffractionDto) {
    const platforms = dto.platforms ?? ['xiaohongshu' as any];

    this.logger.log(`Starting batch export for videoId=${videoId}, platforms=${platforms.join(', ')}`);

    // 检查是否有正在处理的任务
    const existingTask = await this.prisma.diffractionTask.findFirst({
      where: {
        videoId,
        status: 'PROCESSING',
      },
    });

    if (existingTask) {
      this.logger.warn(`Existing PROCESSING task found: ${existingTask.id}`);
      return {
        taskId: existingTask.id,
        userId,
        videoId,
        ...dto,
        status: 'PROCESSING',
      };
    }

    // 调用 BatchExportService 生成资产包
    const assetPackage = await this.batchExportService.generateAssets(userId, {
      videoId,
      platforms: platforms as any[],
    });

    this.logger.log(`Batch export completed: ${assetPackage.length} asset packages`);

    return {
      taskId: assetPackage.map(pkg => pkg.taskId).join(','),
      userId,
      videoId,
      ...dto,
      status: 'PROCESSING',
    };
  }

  /**
   * 获取平台草稿列表
   */
  async getDrafts(userId: string, videoId: string) {
    const tasks = await this.prisma.platformDraft.findMany({
      where: {
        diffractionId: videoId,
      isPublished: false,
      },
      include: {
        diffraction: { include: { platformDrafts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      videoId,
      drafts: tasks.map(task => ({
        id: task.id,
        platform: task.platform.toLowerCase(),
        title: task.title,
        content: task.content,
        selectedImages: task.selectedImages,
        isPublished: task.isPublished,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      })),
    };
  }

  /**
   * 删除草稿
   */
  async deleteDraft(userId: string, videoId: string, draftId: string) {
    const draft = await this.prisma.platformDraft.findFirst({
      where: { id: draftId },
      include: { diffraction: { include: { platformDrafts: true } } },
    });

    if (!draft) {
      throw new Error('Draft not found');
    }

    await this.prisma.platformDraft.delete({
      where: { id: draftId },
    });

    return { videoId, deleted: true };
  }

  /**
   * 获取视频源信息
   */
  private async getVideoSource(videoId: string) {
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        projectId: true,
        storagePath: true,
        sourceUrl: true,
        metadata: true,
        duration: true,
      },
    });

    if (!video) {
      throw new Error('Video not found or has no storage path');
    }

    return video;
  }

  /**
   * 更新任务状态
   */
  private async updateTaskStatus(taskId: string, status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED') {
    await this.prisma.diffractionTask.update({
      where: { id: taskId },
      data: { status },
    });
  }
}
