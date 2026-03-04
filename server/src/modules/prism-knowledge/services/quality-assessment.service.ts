import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * 质量维度定义
 */
interface QualityDimensions {
  accuracy: number;
  completeness: number;
  clarity: number;
  relevance: number;
  depth: number;
}

/**
 * 生成质量 DTO
 */
export class GenerateQualityDto {
  qualityId?: string;
  cardId?: string;
  flashcardId?: string;
  aiModel?: string;
  userId: string;

  accuracy?: number;
  completeness?: number;
  clarity?: number;
  relevance?: number;
  depth?: number;
}

@Injectable()
export class QualityAssessmentService {
  private readonly logger = new Logger(QualityAssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 评估生成内容的质量
   */
  async assessGenerated(
    params: GenerateQualityDto,
  ): Promise<QualityDimensions & { qualityScore: number }> {
    this.logger.log(`Assessing generated content for user ${params.userId}`);

    let dimensions: QualityDimensions = {
      accuracy: 0,
      completeness: 0,
      clarity: 0,
      relevance: 0,
      depth: 0,
    };

    // 根据内容长度评分
    if (params.cardId) {
      const card = await this.prisma.crystalCard.findUnique({
        where: { id: params.cardId },
        select: { content: true, title: true, summary: true },
      });

      if (card) {
        dimensions = this.assessCard(card);
      }
    }

    if (params.flashcardId) {
      const flashcard = await this.prisma.flashcard.findUnique({
        where: { id: params.flashcardId },
        select: { front: true, back: true },
      });

      if (flashcard) {
        dimensions = this.assessFlashcard(flashcard);
      }
    }

    // 计算综合质量分数 (0-100)
    const dimensionsTotal =
      dimensions.accuracy + dimensions.completeness + dimensions.clarity + dimensions.relevance + dimensions.depth;

    const qualityScore = dimensionsTotal / 4;

    this.logger.log(`Quality assessment: ${JSON.stringify(dimensions)}, score: ${qualityScore}`);

    return { ...dimensions, qualityScore };
  }

  /**
   * 评估晶体卡片
   */
  private assessCard(card: { content, title, summary }): QualityDimensions {
    let dimensions: QualityDimensions = {
      accuracy: 0,
      completeness: 0,
      clarity: 0,
      relevance: 0,
      depth: 0,
    };

    // 1. 准确性：内容是否包含关键信息
    if (title && title.trim().length > 5) dimensions.accuracy += 25;
    if (summary && summary.trim().length > 20) dimensions.completeness += 25;
    if (content.trim().length > 100 && content.trim().length < 1000) dimensions.accuracy += 25;

    // 2. 完整性：是否涵盖定义、举例、应用场景
    const hasDefinition = content.toLowerCase().includes('定义：') || content.toLowerCase().includes('举例：');
    if (hasDefinition) dimensions.completeness += 20;
    const hasExample = content.toLowerCase().includes('举例：') || content.toLowerCase().includes('应用场景：');
    if (hasExample) dimensions.completeness += 20;

    // 3. 清晰度：语言是否简洁明了，结构是否清晰
    const sentences = content.split(/[.!?。！]/).length;
    const avgSentenceLength = content.length / sentences;
    if (avgSentenceLength < 30) dimensions.clarity += 25;
    else if (avgSentenceLength < 50) dimensions.clarity += 20;
    else dimensions.clarity += 15;

    // 4. 相关性：标题和内容是否相关
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();
    const titleKeywords = titleLower.split(/\s+/).filter(w => w.length > 2);
    const hasKeyword = titleKeywords.some(keyword => contentLower.includes(keyword));
    if (hasKeyword) {
      dimensions.relevance += 25;
    }

    // 5. 深度：内容是否深入，是否有多层次
    const depthIndicators = ['深入', '分析', '原因', '后果', '意义'];
    const depthCount = depthIndicators.filter(word => content.includes(word)).length;
    if (depthCount >= 2) dimensions.depth += 25;
    else if (depthCount === 1) dimensions.depth += 15;
    else dimensions.depth += 10;

    return dimensions;
  }

  /**
   * 评估闪卡
   */
  private assessFlashcard(flashcard: { front, back }): QualityDimensions {
    let dimensions: QualityDimensions = {
      accuracy: 0,
      completeness: 0,
      clarity: 0,
      relevance: 0,
      depth: 0,
    };

    // 1. 准确性：问题是否准确可验证
    if (front.trim().includes('?')) {
      const questionCount = (front.match(/\?/g) || []).length;
      dimensions.accuracy += Math.min(questionCount / (front.replace(/\?/g, '').length) * 20);
    }
    if (back.trim().length > 10 && back.trim().length < 300) {
      dimensions.accuracy += 20;
    }

    // 2. 完整性：问题是否完整可执行
    if (front.trim().length > 0 && back.trim().length > 0) {
      dimensions.completeness += 25;
    }

    // 3. 清晰度：语言是否简洁明了
    const words = front.split(/\s+/).length;
    if (words.every(word => word.length <= 20)) dimensions.clarity += 25;
    else if (words.every(word => word.length <= 40)) dimensions.clarity += 20;
    else dimensions.clarity += 15;

    // 4. 相关性：问题与答案是否相关
    const frontLower = front.toLowerCase();
    const backLower = back.toLowerCase();
    const frontKeywords = frontLower.split(/\s+/).filter(w => w.length > 2);
    const hasKeyword = frontKeywords.some(keyword => backLower.includes(keyword));
    if (hasKeyword) {
      dimensions.relevance += 25;
    }

    // 5. 深度：是否促进深度理解
    const depthIndicators = ['概念', '原理', '应用', '联系'];
    const depthCount = depthIndicators.filter(word => front.includes(word) || back.includes(word)).length;
    if (depthCount >= 2) dimensions.depth += 25;
    else if (depthCount === 1) dimensions.depth += 15;
    else dimensions.depth += 10;

    return dimensions;
  }

  /**
   * 保存质量评估
   */
  async saveAssessment(
    userId: string,
    qualityId?: string,
    cardId?: string,
    flashcardId?: string,
    dimensions: QualityDimensions,
    qualityScore: number,
  userFeedback?: string,
  ) {
    this.logger.log(`Saving quality assessment: qualityScore}`);

    const data: any = {
      dimensions,
      qualityScore,
      userFeedback,
    };

    if (qualityId) {
      await this.prisma.generationQuality.create({
        data: {
          userId,
          assetId: qualityId,
          cardId,
          generatedBy: 'quality_assessment',
          qualityScore,
          dimensions,
        },
      });
    } else if (cardId) {
      await this.prisma.generationQuality.create({
        data: {
          userId,
          assetId: cardId,
          flashcardId,
          generatedBy: 'quality_assessment',
          qualityScore,
          dimensions,
        },
      });
    } else if (flashcardId) {
      await this.prisma.generationQuality.create({
        data: {
          userId,
          assetId: flashcardId,
          generatedBy: 'quality_assessment',
          qualityScore,
          dimensions,
        },
      });
    }

    this.logger.log(`Saved quality assessment`);
  }

  /**
   * 获取质量评估历史
   */
  async getHistory(assetId: string) {
    const history = await this.prisma.generationQuality.findMany({
      where: { assetId },
      include: {
        template: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return history;
  }
}