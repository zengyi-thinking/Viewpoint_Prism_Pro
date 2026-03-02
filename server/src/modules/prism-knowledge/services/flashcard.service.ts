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

    const aiCards =
      userId
        ? await this.generateWithAi({
            userId,
            videoTitle,
            outlineMarkdown,
            transcriptSegments,
            maxCards,
          })
        : [];

    const seeds =
      aiCards.length > 0
        ? aiCards
        : this.buildFallbackSeeds(transcriptSegments, Math.min(8, maxCards));

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
    try {
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

      const text = String(llm?.text ?? '').trim();
      if (!text) return [];

      const parsed = this.parseJsonArray(text);
      return parsed
        .map((item) => ({
          front: this.asText(item?.front),
          back: this.asText(item?.back),
          chapter: this.asText(item?.chapter) || '核心知识',
          difficulty: Number(item?.difficulty),
        }))
        .filter((item) => item.front && item.back)
        .slice(0, maxCards);
    } catch (error) {
      this.logger.warn(`Flashcard AI generation fallback: ${error?.message || 'unknown error'}`);
      return [];
    }
  }

  private buildFallbackSeeds(segments: FlashcardSegment[], maxCards: number) {
    return segments.slice(0, maxCards).map((seg, idx) => ({
      front: `第 ${idx + 1} 段的核心观点是什么？`,
      back: seg.text,
      chapter: `章节 ${idx + 1}`,
      difficulty: Math.min(5, 1 + (idx % 5)),
    }));
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
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // continue
      }
    }

    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    }

    throw new Error('Invalid flashcard JSON');
  }

  private asText(value: unknown) {
    if (typeof value !== 'string') return '';
    return value.trim();
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
}
