import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

enum PromptAssetType {
  CRYSTAL_CARD = 'crystal_card',
  MINDMAP = 'mindmap',
  OUTLINE = 'outline',
  FLASHCARD = 'flashcard',
}

/**
 * 创建 Prompt Template DTO
 */
export class CreatePromptTemplateDto {
  userId: string;
  assetType: PromptAssetType;
  cardType?: string; // CONCEPT/TIMELINE/INSIGHT/SUMMARY/KEYFRAME/QA/QUOTE/COMPARISON
  name: string;
  description?: string;
  template: string;
  systemPrompt?: string;
  tags?: string[];
  difficulty?: number;
  isPublic?: boolean;
  isDefault?: boolean;
}

/**
 * 更新 Prompt Template DTO
 */
export class UpdatePromptTemplateDto {
  name?: string;
  description?: string;
  template?: string;
  systemPrompt?: string;
  tags?: string[];
  difficulty?: number;
  isPublic?: boolean;
}

/**
 * 获取 Prompt Templates 查询 DTO
 */
export class GetPromptTemplatesQueryDto {
  assetType?: PromptAssetType;
  cardType?: string;
  userId?: string;
  includePublic?: boolean;
  isDefault?: boolean;
  sortBy?: 'name' | 'rating' | 'useCount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class PromptTemplateService {
  private readonly logger = new Logger(PromptTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建 Prompt 模板
   */
  async create(userId: string, dto: CreatePromptTemplateDto) {
    this.logger.log(`Creating prompt template for user ${userId}`);

    const promptTemplate = await this.prisma.promptTemplate.create({
      data: {
        userId,
        assetType: dto.assetType,
        cardType: dto.cardType,
        name: dto.name,
        description: dto.description,
        template: dto.template,
        systemPrompt: dto.systemPrompt,
        tags: dto.tags || [],
        difficulty: dto.difficulty ?? 2,
        isPublic: dto.isPublic ?? false,
        isDefault: dto.isDefault ?? false,
        useCount: 0,
      },
    });

    this.logger.log(`Created prompt template: ${promptTemplate.id}`);
    return promptTemplate;
  }

  /**
   * 获取 Prompt 模板列表
   */
  async getTemplates(query: GetPromptTemplatesQueryDto) {
    const where: any = {
      isPublic: query?.includePublic === true ? true : undefined,
      isDefault: query?.isDefault === true ? true : undefined,
    };

    if (query?.userId) {
      where.userId = query.userId;
    }

    if (query?.assetType) {
      where.assetType = query.assetType;
    }

    if (query?.cardType) {
      where.cardType = query.cardType;
    }

    const orderBy: any = {};
    if (query?.sortBy) {
      switch (query.sortBy) {
        case 'name':
          orderBy.name = query.sortOrder === 'desc' ? 'desc' : 'asc';
          break;
        case 'rating':
          orderBy.rating = query.sortOrder === 'desc' ? 'desc' : 'asc';
          break;
        case 'useCount':
          orderBy.useCount = query.sortOrder === 'desc' ? 'desc' : 'asc';
          break;
        case 'createdAt':
          orderBy.createdAt = query.sortOrder === 'desc' ? 'desc' : 'asc';
          break;
      }
    }

    const templates = await this.prisma.promptTemplate.findMany({
      where,
      orderBy,
      skip: query?.page ? (query.page - 1) * (query.limit || 20) : undefined,
      take: query?.limit || 20,
    });

    this.logger.log(`Found ${templates.length} prompt templates`);
    return templates;
  }

  /**
   * 获取 Prompt 模板详情
   */
  async getTemplate(id: string) {
    const template = await this.prisma.promptTemplate.findUnique({
      where: { id },
      include: {
        user: true,
        generations: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!template) {
      throw new Error('Prompt template not found');
    }

    return template;
  }

  /**
   * 更新 Prompt 模板
   */
  async update(id: string, userId: string, dto: UpdatePromptTemplateDto) {
    this.logger.log(`Updating prompt template ${id}`);

    // 验证权限
    const existing = await this.prisma.promptTemplate.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== userId) {
      throw new Error('Template not found or permission denied');
    }

    const updated = await this.prisma.promptTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        template: dto.template,
        systemPrompt: dto.systemPrompt,
        tags: dto.tags,
        difficulty: dto.difficulty,
        isPublic: dto.isPublic,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Updated prompt template ${id}`);
    return updated;
  }

  /**
   * 删除 Prompt 模板
   */
  async delete(id: string, userId: string) {
    this.logger.log(`Deleting prompt template ${id}`);

    const existing = await this.prisma.promptTemplate.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== userId) {
      throw new Error('Template not found or permission denied');
    }

    await this.prisma.promptTemplate.delete({
      where: { id },
    });

    this.logger.log(`Deleted prompt template ${id}`);
    return { success: true };
  }

  /**
   * 复制 Prompt 模板
   */
  async clone(id: string, userId: string) {
    this.logger.log(`Cloning prompt template ${id}`);

    const original = await this.prisma.promptTemplate.findUnique({
      where: { id },
    });

    if (!original) {
      throw new Error('Template not found');
    }

    const cloned = await this.prisma.promptTemplate.create({
      data: {
        userId,
        assetType: original.assetType,
        cardType: original.cardType,
        name: `${original.name} (副本)`,
        description: original.description,
        template: original.template,
        systemPrompt: original.systemPrompt,
        tags: [...original.tags],
        difficulty: original.difficulty,
        isPublic: false, // 副本默认不公开
        isDefault: false,
        useCount: 0,
      },
    });

    this.logger.log(`Cloned prompt template: ${cloned.id}`);
    return cloned;
  }

  /**
   * 评分 Prompt 模板
   */
  async rate(id: string, userId: string, rating: number) {
    this.logger.log(`Rating prompt template ${id} with ${rating}`);

    const template = await this.prisma.promptTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const updated = await this.prisma.promptTemplate.update({
      where: { id },
      data: {
        rating: (template.rating + rating) / (template.ratingCount + 1),
        ratingCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Rated prompt template ${id}`);
    return updated;
  }

  /**
   * 增加使用计数
   */
  async incrementUseCount(id: string) {
    await this.prisma.promptTemplate.update({
      where: { id },
      data: {
        useCount: { increment: 1 },
      },
    });
  }
}
