import { Injectable, Logger } from '@nestjs/common';
import { CrystalCardType } from '../../../../generated/prisma/enums';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { PrismaService } from '../../../prisma/prisma.service';

interface GenerateCrystalCardsParams {
  userId?: string;
  assetId: string;
  videoTitle: string;
  transcriptSegments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  keyframes?: Array<{
    timestamp: number;
    storagePath: string;
    description?: string;
  }>;
  outlineMarkdown?: string;
  deepAnalysis?: {
    summary?: string;
    chapterGraph?: Array<Record<string, unknown>>;
    conceptGraph?: Array<Record<string, unknown>>;
    learningRecommendations?: Array<Record<string, unknown>>;
    ambiguities?: Array<Record<string, unknown>>;
  };
}

interface CrystalCardGenerationOptions {
  types?: CrystalCardType[];
  maxCards?: number;
  includeKeyframes?: boolean;
  difficulty?: number;
}

type CardDraft = {
  type: CrystalCardType;
  title: string;
  content: string;
  summary?: string;
  timestamp?: number;
  imageUrl?: string;
  sourceType?: string;
  tags?: string[];
  difficulty?: number;
  importance?: number;
  category?: string;
  isFeatured?: boolean;
};

@Injectable()
export class CrystalCardService {
  private readonly logger = new Logger(CrystalCardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  async generateCrystalCards(
    params: GenerateCrystalCardsParams,
    options: CrystalCardGenerationOptions = {},
  ) {
    const {
      assetId,
      videoTitle,
      transcriptSegments,
      keyframes = [],
      outlineMarkdown = '',
      deepAnalysis,
      userId,
    } = params;
    const {
      types = [
        CrystalCardType.CONCEPT,
        CrystalCardType.TIMELINE,
        CrystalCardType.INSIGHT,
        CrystalCardType.SUMMARY,
      ],
      maxCards = 12,
      includeKeyframes = true,
      difficulty = 2,
    } = options;

    await this.prisma.crystalCard.deleteMany({ where: { assetId } });

    let drafts: CardDraft[] = [];
    if (userId) {
      drafts = await this.generateWithAi({
        userId,
        videoTitle,
        transcriptSegments,
        keyframes,
        outlineMarkdown,
        deepAnalysis,
        types,
        maxCards,
        difficulty,
      });
    }

    if (drafts.length === 0) {
      drafts = this.generateFallback({
        videoTitle,
        transcriptSegments,
        keyframes,
        outlineMarkdown,
        deepAnalysis,
        types,
        maxCards,
        includeKeyframes,
        difficulty,
      });
    }

    const created: any[] = [];
    let orderIndex = 0;
    for (const draft of drafts.slice(0, maxCards)) {
      const card = await this.prisma.crystalCard.create({
        data: {
          assetId,
          type: draft.type,
          title: this.clip(draft.title, 80),
          content: this.clip(draft.content, 4000),
          summary: draft.summary ? this.clip(draft.summary, 300) : null,
          timestamp: draft.timestamp ?? null,
          videoTime:
            typeof draft.timestamp === 'number'
              ? this.formatTimestamp(draft.timestamp)
              : null,
          imageUrl: draft.imageUrl ?? null,
          sourceType: draft.sourceType ?? 'generated',
          tags: (draft.tags ?? []).slice(0, 6),
          difficulty: this.normalizeInt(draft.difficulty ?? difficulty, 1, 5),
          importance: this.normalizeInt(draft.importance ?? 3, 1, 5),
          orderIndex,
          category: draft.category ?? null,
          isFeatured: Boolean(draft.isFeatured),
        },
      });
      created.push(card);
      orderIndex += 1;
    }

    return created;
  }

  async getCrystalCards(assetId: string, options: { type?: CrystalCardType } = {}) {
    const where: any = { assetId };
    if (options.type) where.type = options.type;

    const cards = await this.prisma.crystalCard.findMany({
      where,
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      assetId,
      cards,
      count: cards.length,
      byType: this.groupByType(cards),
    };
  }

  async updateCrystalCard(
    cardId: string,
    updates: {
      title?: string;
      content?: string;
      summary?: string;
      tags?: string[];
      importance?: number;
      isFeatured?: boolean;
      isVerified?: boolean;
      category?: string;
    },
  ) {
    return this.prisma.crystalCard.update({
      where: { id: cardId },
      data: {
        title: updates.title,
        content: updates.content,
        summary: updates.summary,
        tags: updates.tags,
        importance: updates.importance,
        isFeatured: updates.isFeatured,
        isVerified: updates.isVerified,
        category: updates.category,
      },
    });
  }

  async deleteCrystalCard(cardId: string) {
    await this.prisma.crystalCard.delete({ where: { id: cardId } });
    return { success: true, cardId };
  }

  async getFeaturedCards(assetId: string) {
    return this.prisma.crystalCard.findMany({
      where: { assetId, isFeatured: true },
      orderBy: [{ importance: 'desc' }, { orderIndex: 'asc' }],
    });
  }

  private async generateWithAi(params: {
    userId: string;
    videoTitle: string;
    transcriptSegments: Array<{ start: number; end: number; text: string }>;
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string }>;
    outlineMarkdown: string;
    deepAnalysis?: {
      summary?: string;
      chapterGraph?: Array<Record<string, unknown>>;
      conceptGraph?: Array<Record<string, unknown>>;
      learningRecommendations?: Array<Record<string, unknown>>;
      ambiguities?: Array<Record<string, unknown>>;
    };
    types: CrystalCardType[];
    maxCards: number;
    difficulty: number;
  }): Promise<CardDraft[]> {
    const {
      userId,
      videoTitle,
      transcriptSegments,
      keyframes,
      outlineMarkdown,
      deepAnalysis,
      types,
      maxCards,
      difficulty,
    } = params;

    try {
      const llm = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          messages: [
            {
              role: 'system',
              content: [
                '你是视频学习助手，负责生成“晶体卡片”。',
                '输出必须是 JSON 数组，且不要使用 markdown 代码块。',
                '每项字段：type,title,content,summary,timestamp,sourceType,tags,difficulty,importance,category,isFeatured。',
                `type 仅可使用：${types.join(', ')}`,
                'sourceType 仅可使用：outline, deepAnalysis, qa, keyframe。',
                `最多 ${maxCards} 项。`,
                '优先体现章节主线、核心概念、关键帧价值、学习建议和易混淆点。',
              ].join('\n'),
            },
            {
              role: 'user',
              content: JSON.stringify(
                {
                  videoTitle,
                  outlineMarkdown: this.clip(outlineMarkdown, 2500),
                  transcriptSegments: transcriptSegments.slice(0, 40),
                  keyframes: keyframes.slice(0, 12),
                  deepAnalysis: deepAnalysis
                    ? {
                        summary: deepAnalysis.summary ?? '',
                        chapterGraph: (deepAnalysis.chapterGraph ?? []).slice(0, 8),
                        conceptGraph: (deepAnalysis.conceptGraph ?? []).slice(0, 12),
                        learningRecommendations: (deepAnalysis.learningRecommendations ?? []).slice(0, 8),
                        ambiguities: (deepAnalysis.ambiguities ?? []).slice(0, 6),
                      }
                    : null,
                  defaults: { difficulty },
                },
                null,
                2,
              ),
            },
          ],
          temperature: 0.35,
          maxTokens: 3200,
        },
        userId,
      );

      const raw = String((llm as any)?.text ?? (llm as any)?.content ?? '').trim();
      if (!raw) return [];

      const list = this.parseJsonArray(raw);
      const drafts = list
        .map((item) => this.normalizeDraft(item, difficulty))
        .filter((item): item is CardDraft => Boolean(item))
        .slice(0, maxCards);

      return drafts;
    } catch (error: any) {
      this.logger.warn(`AI crystal-card generation fallback: ${error?.message || 'unknown error'}`);
      return [];
    }
  }

  private generateFallback(params: {
    videoTitle: string;
    transcriptSegments: Array<{ start: number; end: number; text: string }>;
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string }>;
    outlineMarkdown: string;
    deepAnalysis?: {
      summary?: string;
      chapterGraph?: Array<Record<string, unknown>>;
      conceptGraph?: Array<Record<string, unknown>>;
      learningRecommendations?: Array<Record<string, unknown>>;
      ambiguities?: Array<Record<string, unknown>>;
    };
    types: CrystalCardType[];
    maxCards: number;
    includeKeyframes: boolean;
    difficulty: number;
  }): CardDraft[] {
    const {
      videoTitle,
      transcriptSegments,
      keyframes,
      outlineMarkdown,
      deepAnalysis,
      types,
      maxCards,
      includeKeyframes,
      difficulty,
    } = params;
    const drafts: CardDraft[] = [];

    if (types.includes(CrystalCardType.SUMMARY)) {
      const summary = this.clip(
        outlineMarkdown || transcriptSegments.slice(0, 8).map((s) => s.text).join('\n'),
        1200,
      );
      if (summary) {
        drafts.push({
          type: CrystalCardType.SUMMARY,
          title: `《${videoTitle}》学习摘要`,
          content: deepAnalysis?.summary ? `${deepAnalysis.summary}\n\n${summary}` : summary,
          summary: this.clip(deepAnalysis?.summary || summary, 180),
          sourceType: deepAnalysis?.summary ? 'deepAnalysis' : 'outline',
          difficulty: 1,
          importance: 5,
          category: '整体概览',
          isFeatured: true,
        });
      }
    }

    if (types.includes(CrystalCardType.CONCEPT)) {
      const conceptSeeds =
        deepAnalysis?.conceptGraph && deepAnalysis.conceptGraph.length > 0
          ? deepAnalysis.conceptGraph.slice(0, 4).map((concept) => ({
              title:
                typeof concept.name === 'string' ? concept.name : '核心概念',
              content:
                typeof concept.summary === 'string' ? concept.summary : '',
            }))
          : transcriptSegments.slice(0, 4).map((seg) => ({
              title: this.extractTitle(seg.text),
              content: seg.text,
              start: seg.start,
            }));

      for (const seg of conceptSeeds) {
        const timestamp =
          'start' in seg && typeof seg.start === 'number' ? seg.start : undefined;
        drafts.push({
          type: CrystalCardType.CONCEPT,
          title: this.clip(this.extractTitle(seg.title), 40),
          content: seg.content,
          summary: this.clip(seg.content, 120),
          timestamp,
          sourceType:
            deepAnalysis?.conceptGraph && deepAnalysis.conceptGraph.length > 0
              ? 'deepAnalysis'
              : 'outline',
          tags: ['概念'],
          difficulty,
          importance: 3,
          category: '核心概念',
        });
      }
    }

    if (types.includes(CrystalCardType.TIMELINE)) {
      const chunks = this.chunkSegments(transcriptSegments, 3);
      chunks.forEach((chunk, idx) => {
        drafts.push({
          type: CrystalCardType.TIMELINE,
          title: `阶段 ${idx + 1}`,
          content: chunk.text,
          summary: this.clip(chunk.text, 120),
          timestamp: chunk.start,
          sourceType: 'outline',
          tags: ['时间线'],
          difficulty,
          importance: 3,
          category: '学习路径',
        });
      });
    }

    if (types.includes(CrystalCardType.INSIGHT)) {
      const insightText =
        deepAnalysis?.summary ||
        transcriptSegments.find((s) =>
          ['因此', '关键', '结论', '所以', '意味着'].some((k) => s.text.includes(k)),
        )?.text;
      if (insightText) {
        drafts.push({
          type: CrystalCardType.INSIGHT,
          title: '关键洞察',
          content: insightText,
          summary: this.clip(insightText, 140),
          timestamp: transcriptSegments[0]?.start,
          sourceType: deepAnalysis?.summary ? 'deepAnalysis' : 'outline',
          tags: ['洞察'],
          difficulty: Math.min(5, difficulty + 1),
          importance: 5,
          category: '深度理解',
          isFeatured: true,
        });
      }
    }

    if (includeKeyframes && types.includes(CrystalCardType.KEYFRAME)) {
      for (const frame of keyframes.slice(0, 3)) {
        drafts.push({
          type: CrystalCardType.KEYFRAME,
          title: `关键帧 @ ${this.formatTimestamp(frame.timestamp)}`,
          content: frame.description || '关键画面',
          summary: frame.description || '关键画面',
          timestamp: frame.timestamp,
          imageUrl: frame.storagePath,
          sourceType: 'keyframe',
          tags: ['关键帧'],
          difficulty,
          importance: 3,
          category: '视觉记忆',
        });
      }
    }

    return drafts.slice(0, maxCards);
  }

  private normalizeDraft(input: any, fallbackDifficulty: number): CardDraft | null {
    const type = this.parseCardType(input?.type);
    if (!type) return null;
    const title = this.asText(input?.title);
    const content = this.asText(input?.content);
    if (!title || !content) return null;

    const timestampRaw = Number(input?.timestamp);
    return {
      type,
      title,
      content,
      summary: this.asText(input?.summary) || undefined,
      timestamp: Number.isFinite(timestampRaw) ? timestampRaw : undefined,
      sourceType: this.asText(input?.sourceType) || undefined,
      tags: Array.isArray(input?.tags) ? input.tags.map((v: any) => String(v)).slice(0, 6) : undefined,
      difficulty: this.normalizeInt(Number(input?.difficulty || fallbackDifficulty), 1, 5),
      importance: this.normalizeInt(Number(input?.importance || 3), 1, 5),
      category: this.asText(input?.category) || undefined,
      isFeatured: Boolean(input?.isFeatured),
    };
  }

  private parseCardType(raw: unknown): CrystalCardType | null {
    const value = String(raw || '').trim().toUpperCase();
    switch (value) {
      case 'CONCEPT':
        return CrystalCardType.CONCEPT;
      case 'TIMELINE':
        return CrystalCardType.TIMELINE;
      case 'COMPARISON':
        return CrystalCardType.COMPARISON;
      case 'INSIGHT':
        return CrystalCardType.INSIGHT;
      case 'QUOTE':
        return CrystalCardType.QUOTE;
      case 'KEYFRAME':
        return CrystalCardType.KEYFRAME;
      case 'QA':
        return CrystalCardType.QA;
      case 'SUMMARY':
        return CrystalCardType.SUMMARY;
      default:
        return null;
    }
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
        // ignore
      }
    }
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    }
    throw new Error('Invalid JSON array for crystal cards');
  }

  private chunkSegments(
    segments: Array<{ start: number; end: number; text: string }>,
    chunks: number,
  ) {
    if (!segments.length) return [];
    const size = Math.max(1, Math.ceil(segments.length / chunks));
    const result: Array<{ start: number; end: number; text: string }> = [];
    for (let i = 0; i < segments.length; i += size) {
      const part = segments.slice(i, i + size);
      result.push({
        start: part[0].start,
        end: part[part.length - 1].end,
        text: part.map((s) => s.text).join(' '),
      });
    }
    return result.slice(0, chunks);
  }

  private extractTitle(text: string) {
    const cleaned = this.clip(text.replace(/\s+/g, ' ').trim(), 50);
    const m = cleaned.match(/^(.{5,26}?)[，。,.!?！？\s]/);
    return m?.[1] || cleaned;
  }

  private formatTimestamp(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  private normalizeInt(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  private asText(value: unknown) {
    if (typeof value !== 'string') return '';
    return value.trim();
  }

  private clip(text: string, len: number) {
    const clean = String(text || '').trim();
    if (!clean) return '';
    return clean.length > len ? `${clean.slice(0, len)}...` : clean;
  }

  private groupByType(cards: any[]) {
    const grouped: Record<string, any[]> = {};
    cards.forEach((card) => {
      if (!grouped[card.type]) grouped[card.type] = [];
      grouped[card.type].push(card);
    });
    return grouped;
  }
}
