import { Injectable, Logger } from '@nestjs/common';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { PrismaService } from '../../../prisma/prisma.service';

interface FlashcardSegment {
  start?: number;
  end?: number;
  text: string;
}

@Injectable()
export class FlashcardService {
  private readonly logger = new Logger(FlashcardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  async generateFlashcards(params: {
    assetId: string;
    transcriptSegments: FlashcardSegment[];
    userId?: string;
    videoTitle?: string;
    outlineMarkdown?: string;
    maxCards?: number;
  }) {
    const {
      assetId,
      transcriptSegments,
      userId,
      videoTitle = '学习视频',
      outlineMarkdown = '',
      maxCards = 10,
    } = params;

    await this.prisma.flashcard.deleteMany({
      where: { assetId },
    });

    if (!transcriptSegments.length) {
      return [];
    }

    if (!userId) {
      throw new Error('生成闪卡需要有效的 userId');
    }
    const seeds = await this.generateWithAi({
      userId,
      videoTitle,
      outlineMarkdown,
      transcriptSegments,
      maxCards,
    });

    const created: any[] = [];
    for (let idx = 0; idx < seeds.length; idx += 1) {
      const seg = seeds[idx];
      const front = this.truncate(seg.front, 120);
      const back = this.truncate(seg.back, 400);

      const card = await this.prisma.flashcard.create({
        data: {
          assetId,
          front,
          back,
          chapter: seg.chapter || `章节 ${idx + 1}`,
          difficulty: this.normalizeDifficulty(seg.difficulty, idx),
          nextReview: this.computeNextReview(idx),
          reviewCount: 0,
        },
      });
      created.push(card);
    }

    return created;
  }

  private computeNextReview(offsetIndex: number) {
    const days = [1, 2, 4, 7, 15, 30];
    const delta = days[offsetIndex % days.length];
    const d = new Date();
    d.setDate(d.getDate() + delta);
    return d;
  }

  private async generateWithAi(params: {
    userId: string;
    videoTitle: string;
    outlineMarkdown: string;
    transcriptSegments: FlashcardSegment[];
    maxCards: number;
  }) {
    const { userId, videoTitle, outlineMarkdown, transcriptSegments, maxCards } = params;
    const compactSegments = transcriptSegments.slice(0, 40).map((seg, idx) => ({
      idx,
      start: seg.start ?? idx * 15,
      end: seg.end ?? (idx + 1) * 15,
      text: this.truncate(seg.text, 180),
    }));

    const llm = await this.aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'system',
            content: [
              '你是学习设计专家，要基于视频内容生成高质量学习闪卡。',
              '输出必须是 JSON 数组，每项字段：front, back, chapter, difficulty。',
              `卡片数量不超过 ${maxCards}，不少于 ${Math.max(6, Math.floor(maxCards * 0.7))}。`,
              'front 是问题句，back 是简明但具体的答案，必须有可执行或可复述信息。',
              'difficulty 取值 1-5。',
              '禁止输出 markdown 代码块。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                title: videoTitle,
                outline: this.truncate(outlineMarkdown, 2200),
                transcriptSegments: compactSegments,
              },
              null,
              2,
            ),
          },
        ],
        temperature: 0.45,
        maxTokens: 3200,
      },
      userId,
    );

    const text = this.extractLlmText(llm);
    if (!text) {
      const provider = String(llm?.provider ?? 'unknown');
      const model = String(llm?.model ?? 'unknown');
      throw new Error(`闪卡模型未返回内容(provider=${provider}, model=${model})`);
    }

    const parsed = this.parseJsonArray(text);
    const cards = parsed
      .map((item) => ({
        front: this.asText(item?.front),
        back: this.asText(item?.back),
        chapter: this.asText(item?.chapter) || '核心知识',
        difficulty: Number(item?.difficulty),
      }))
      .filter((item) => item.front && item.back)
      .slice(0, maxCards);
    if (cards.length === 0) {
      throw new Error('闪卡模型返回格式无效');
    }
    return cards;
  }

  private parseJsonArray(raw: string): any[] {
    const candidates = [
      raw,
      raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim(),
      raw.replace(/```json/gi, '').replace(/```/g, '').trim(),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate);
        const extracted = this.extractCardArray(parsed);
        if (extracted) return extracted;
      } catch {
        // continue
      }
    }

    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const extracted = this.extractCardArray(parsed);
      if (extracted) return extracted;
    }

    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]);
        const extracted = this.extractCardArray(parsed);
        if (extracted) return extracted;
      } catch {
        // continue
      }
    }

    this.logger.error(
      `Invalid flashcard JSON payload: ${this.truncate(raw, 400)}`,
    );
    throw new Error('Invalid flashcard JSON: expected array or object with cards/items/flashcards');
  }

  private extractCardArray(parsed: any): any[] | null {
    if (Array.isArray(parsed)) return parsed;
    if (!parsed || typeof parsed !== 'object') return null;

    const possibleKeys = ['cards', 'items', 'flashcards', 'data', 'result'];
    for (const key of possibleKeys) {
      const value = parsed[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        if (Array.isArray(value.cards)) return value.cards;
        if (Array.isArray(value.items)) return value.items;
        if (Array.isArray(value.flashcards)) return value.flashcards;
      }
    }
    return null;
  }

  private asText(value: unknown) {
    if (typeof value !== 'string') return '';
    return value.trim();
  }

  private extractLlmText(llm: any) {
    const candidates: unknown[] = [
      llm?.text,
      llm?.content,
      llm?.description,
      llm?.message?.content,
      llm?.result?.text,
      llm?.result?.content,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const text = candidate.trim();
        if (text) return text;
      }
      if (Array.isArray(candidate)) {
        const joined = candidate
          .map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object' && typeof (part as any).text === 'string') {
              return (part as any).text;
            }
            return '';
          })
          .join('\n')
          .trim();
        if (joined) return joined;
      }
    }

    return '';
  }

  private truncate(text: string, maxLength: number) {
    const clean = String(text || '').trim().replace(/\s+/g, ' ');
    if (!clean) return '';
    return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
  }

  private normalizeDifficulty(raw: number, index: number) {
    if (Number.isFinite(raw)) {
      return Math.max(1, Math.min(5, Math.round(raw)));
    }
    return Math.min(5, 1 + (index % 5));
  }

  /**
   * 闪卡复习（使用 SM-2 算法更新复习间隔）
   *
   * @param userId 用户 ID
   * @param flashcardId 闪卡 ID
   * @param quality 复习质量 (0-5)
   *   0: 完全忘记
   *   1: 错误但有印象
   *   2: 困难回忆
   *   3: 有难度但正确
   *   4: 正确且容易
   *   5: 完美回忆
   * @param timeTaken 回答耗时（秒）
   */
  async reviewFlashcard(
    userId: string,
    flashcardId: string,
    quality: number,
    timeTaken?: number,
  ) {
    void timeTaken;
    const validQuality = Math.max(0, Math.min(5, quality));

    const flashcard = await this.prisma.flashcard.findFirst({
      where: {
        id: flashcardId,
        asset: {
          video: {
            project: { userId },
          },
        },
      },
    });

    if (!flashcard) {
      throw new Error('Flashcard not found');
    }

    const currentReviewCount = flashcard.reviewCount ?? 0;
    const nextIntervalDays = this.resolveNextIntervalDays(currentReviewCount, validQuality);
    const nextReviewDate = this.calculateNextReviewDate(nextIntervalDays);
    const nextDifficulty = this.resolveNextDifficulty(flashcard.difficulty ?? 1, validQuality);

    const updated = await this.prisma.flashcard.update({
      where: { id: flashcardId },
      data: {
        reviewCount: currentReviewCount + 1,
        nextReview: nextReviewDate,
        difficulty: nextDifficulty,
      },
    });

    this.logger.log(
      `Flashcard ${flashcardId} reviewed: quality=${validQuality}, interval=${nextIntervalDays}d`,
    );

    return updated;
  }

  private calculateNextReviewDate(intervalDays: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + intervalDays);
    return date;
  }

  private resolveNextIntervalDays(reviewCount: number, quality: number): number {
    if (quality <= 2) return 1;
    if (reviewCount <= 0) return 1;
    if (reviewCount === 1) return 3;
    if (reviewCount === 2) return 7;
    if (reviewCount === 3) return 14;
    return 30;
  }

  private resolveNextDifficulty(current: number, quality: number): number {
    const base = Number.isFinite(current) ? current : 1;
    if (quality <= 2) return Math.min(5, base + 1);
    if (quality >= 4) return Math.max(1, base - 1);
    return base;
  }

  /**
   * 获取今日需要复习的闪卡
   */
  async getTodayReviews(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const flashcards = await this.prisma.flashcard.findMany({
      where: {
        asset: {
          video: {
            project: { userId },
          },
        },
        nextReview: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        asset: {
          select: {
            id: true,
            videoId: true,
          },
        },
      },
      orderBy: {
        nextReview: 'asc',
      },
    });

    const learning = flashcards.filter((f) => (f.reviewCount ?? 0) <= 2);
    const grouped = {
      new: flashcards.filter((f) => f.reviewCount === 0),
      learning,
      review: flashcards.filter((f) => !learning.find((l) => l.id === f.id)),
    };

    return {
      total: flashcards.length,
      new: grouped.new.length,
      learning: grouped.learning.length,
      review: grouped.review.length,
      flashcards,
    };
  }

  /**
   * 获取复习统计
   */
  async getReviewStats(userId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const flashcards = await this.prisma.flashcard.findMany({
      where: {
        asset: {
          video: {
            project: { userId },
          },
        },
        createdAt: {
          gte: startDate,
        },
      },
    });

    const totalReviews = flashcards.reduce((sum, c) => sum + (c.reviewCount ?? 0), 0);
    const cardsReviewed = flashcards.filter((c) => (c.reviewCount ?? 0) > 0).length;
    const dueCards = flashcards.filter((c) => (c.nextReview ? c.nextReview <= new Date() : false)).length;

    return {
      period: `${days} days`,
      totalReviews,
      cardsReviewed,
      dueCards,
      totalCards: flashcards.length,
    };
  }

  /**
   * 重新调度闪卡（重置学习进度）
   */
  async rescheduleFlashcard(flashcardId: string, reason: string) {
    const updated = await this.prisma.flashcard.update({
      where: { id: flashcardId },
      data: {
        nextReview: new Date(),
        reviewCount: 0,
      },
    });

    this.logger.log(`Flashcard ${flashcardId} rescheduled: ${reason}`);

    return updated;
  }
}
