import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CrystalCardType, TaskStatus } from '../../../../generated/prisma/client';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';

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
}

interface CrystalCardGenerationOptions {
  types?: CrystalCardType[];
  maxCards?: number;
  includeKeyframes?: boolean;
  difficulty?: number;
}

@Injectable()
export class CrystalCardService {
  private readonly logger = new Logger(CrystalCardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  /**
   * 为知识资产生成晶体卡片
   */
  async generateCrystalCards(
    params: GenerateCrystalCardsParams,
    options: CrystalCardGenerationOptions = {},
  ) {
    const {
      assetId,
      videoTitle,
      transcriptSegments,
      keyframes = [],
      outlineMarkdown,
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

    // 清除现有的晶体卡片
    await this.prisma.crystalCard.deleteMany({
      where: { assetId },
    });

    const generatedCards: any[] = [];
    let orderIndex = 0;

    // 优先尝试 LLM 生成晶体卡片（真实模型调用）；失败后回退规则生成。
    if (params.userId) {
      try {
        const aiCards = await this.generateCardsWithAI({
          userId: params.userId,
          videoTitle,
          transcriptSegments,
          keyframes,
          maxCards,
          difficulty,
        });

        if (aiCards.length > 0) {
          for (const card of aiCards) {
            const saved = await this.prisma.crystalCard.create({
              data: {
                assetId,
                type: card.type,
                title: card.title,
                content: card.content,
                summary: card.summary,
                timestamp: card.timestamp,
                videoTime:
                  card.timestamp !== undefined
                    ? this.formatTimestamp(card.timestamp)
                    : undefined,
                sourceText: card.sourceText,
                sourceType: 'generated',
                tags: card.tags,
                difficulty: card.difficulty,
                importance: card.importance,
                orderIndex,
                category: card.category,
                isFeatured: card.isFeatured,
              },
            });
            generatedCards.push(saved);
            orderIndex++;
          }
        }
      } catch (error: any) {
        this.logger.warn(`AI crystal card generation failed, fallback to rules: ${error?.message || error}`);
      }
    }

    // 1. 生成概念卡片 (CONCEPT)
    if (generatedCards.length === 0 && types.includes(CrystalCardType.CONCEPT)) {
      const conceptCards = await this.generateConceptCards({
        assetId,
        transcriptSegments,
        videoTitle,
        difficulty,
        startOrderIndex: orderIndex,
      });
      generatedCards.push(...conceptCards);
      orderIndex += conceptCards.length;
    }

    // 2. 生成时间线卡片 (TIMELINE)
    if (generatedCards.length === 0 && types.includes(CrystalCardType.TIMELINE) && transcriptSegments.length > 0) {
      const timelineCards = await this.generateTimelineCards({
        assetId,
        transcriptSegments,
        videoTitle,
        difficulty,
        startOrderIndex: orderIndex,
      });
      generatedCards.push(...timelineCards);
      orderIndex += timelineCards.length;
    }

    // 3. 生成关键帧卡片 (KEYFRAME)
    if (
      generatedCards.length === 0 &&
      types.includes(CrystalCardType.KEYFRAME) &&
      includeKeyframes &&
      keyframes.length > 0
    ) {
      const keyframeCards = await this.generateKeyframeCards({
        assetId,
        keyframes,
        difficulty,
        startOrderIndex: orderIndex,
      });
      generatedCards.push(...keyframeCards);
      orderIndex += keyframeCards.length;
    }

    // 4. 生成洞察卡片 (INSIGHT)
    if (generatedCards.length === 0 && types.includes(CrystalCardType.INSIGHT)) {
      const insightCards = await this.generateInsightCards({
        assetId,
        transcriptSegments,
        outlineMarkdown,
        videoTitle,
        difficulty,
        startOrderIndex: orderIndex,
      });
      generatedCards.push(...insightCards);
      orderIndex += insightCards.length;
    }

    // 5. 生成摘要卡片 (SUMMARY)
    if (generatedCards.length === 0 && types.includes(CrystalCardType.SUMMARY)) {
      const summaryCard = await this.generateSummaryCard({
        assetId,
        transcriptSegments,
        videoTitle,
        outlineMarkdown,
        orderIndex,
      });
      if (summaryCard) {
        generatedCards.push(summaryCard);
        orderIndex++;
      }
    }

    // 更新知识资产状态
    await this.prisma.knowledgeAsset.update({
      where: { id: assetId },
      data: { status: TaskStatus.COMPLETED },
    });

    return {
      assetId,
      totalCards: generatedCards.length,
      cards: generatedCards,
    };
  }

  private async generateCardsWithAI(params: {
    userId: string;
    videoTitle: string;
    transcriptSegments: Array<{ start: number; end: number; text: string }>;
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string }>;
    maxCards: number;
    difficulty: number;
  }) {
    const { userId, videoTitle, transcriptSegments, keyframes, maxCards, difficulty } = params;

    const transcriptText = transcriptSegments
      .slice(0, 20)
      .map((s) => `[${Math.floor(s.start)}-${Math.floor(s.end)}s] ${s.text}`)
      .join('\n');

    const keyframeText = keyframes
      .slice(0, 10)
      .map((k) => `[${Math.floor(k.timestamp)}s] ${k.description || '关键帧'}`)
      .join('\n');

    const system = `你是知识卡片生成助手。请基于视频内容输出高质量学习卡片。
返回严格 JSON，结构：
{
  "cards": [
    {
      "type": "CONCEPT|TIMELINE|INSIGHT|SUMMARY|KEYFRAME|QA|QUOTE|COMPARISON",
      "title": "标题",
      "content": "详细内容",
      "summary": "一句话摘要",
      "timestamp": 12,
      "tags": ["标签1","标签2"],
      "importance": 1-5,
      "difficulty": 1-5,
      "category": "分类",
      "isFeatured": false
    }
  ]
}
要求：
1) 卡片数量不超过 ${maxCards}
2) 内容必须紧贴输入视频信息，禁止泛化空话
3) 至少覆盖 CONCEPT、INSIGHT、SUMMARY 三类`;

    const user = `视频标题：${videoTitle}

转写片段：
${transcriptText || '无'}

关键帧：
${keyframeText || '无'}
`;

    const llm = await this.aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        maxTokens: 2200,
      },
      userId,
    );

    const text = String(llm?.text || '').trim();
    if (!text) return [];

    const parsed = this.parseAiJson(text);
    const rawCards = Array.isArray(parsed?.cards) ? parsed.cards : [];

    return rawCards
      .slice(0, maxCards)
      .map((c: any, idx: number) => {
        const type = this.normalizeCardType(c?.type);
        const timestamp =
          typeof c?.timestamp === 'number' && Number.isFinite(c.timestamp)
            ? c.timestamp
            : undefined;

        return {
          type,
          title: String(c?.title || `${videoTitle}卡片 ${idx + 1}`).slice(0, 80),
          content: String(c?.content || c?.summary || '').slice(0, 4000),
          summary: String(c?.summary || '').slice(0, 400),
          timestamp,
          sourceText: timestamp !== undefined
            ? transcriptSegments.find((s) => s.start <= timestamp && s.end >= timestamp)?.text
            : undefined,
          tags: Array.isArray(c?.tags)
            ? c.tags.map((t: any) => String(t)).slice(0, 6)
            : [],
          importance: this.clampInt(c?.importance, 1, 5, 3),
          difficulty: this.clampInt(c?.difficulty, 1, 5, difficulty),
          category: c?.category ? String(c.category).slice(0, 40) : 'AI分析',
          isFeatured: Boolean(c?.isFeatured),
        };
      })
      .filter((c) => c.content);
  }

  private normalizeCardType(type: any): CrystalCardType {
    const value = String(type || '').toUpperCase();
    if (value in CrystalCardType) {
      return CrystalCardType[value as keyof typeof CrystalCardType];
    }
    return CrystalCardType.INSIGHT;
  }

  private clampInt(value: any, min: number, max: number, fallback: number) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.round(num)));
  }

  private parseAiJson(text: string): any {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf('{');
      if (start < 0) throw new Error('No JSON object found in AI response');

      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === '\\') {
          esc = true;
          continue;
        }
        if (ch === '"') {
          inStr = !inStr;
          continue;
        }
        if (inStr) continue;
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) {
            return JSON.parse(cleaned.slice(start, i + 1));
          }
        }
      }
      throw new Error('Failed to parse AI JSON');
    }
  }

  /**
   * 生成概念卡片 - 提取视频中的核心概念
   */
  private async generateConceptCards(params: {
    assetId: string;
    transcriptSegments: Array<{ start: number; end: number; text: string }>;
    videoTitle: string;
    difficulty: number;
    startOrderIndex: number;
  }) {
    const { assetId, transcriptSegments, videoTitle, difficulty, startOrderIndex } = params;

    // 简化版：从转写文本中提取关键词汇
    const conceptPatterns = [
      /什么是|定义|概念|含义/g,
      /原理|机制|方式/g,
      /特点|特征|优势/g,
    ];

    const cards: any[] = [];
    let orderIndex = startOrderIndex;

    for (const seg of transcriptSegments.slice(0, 4)) {
      const hasConcept = conceptPatterns.some((pattern) => pattern.test(seg.text));

      if (hasConcept) {
        const card = await this.prisma.crystalCard.create({
          data: {
            assetId,
            type: CrystalCardType.CONCEPT,
            title: this.extractConceptTitle(seg.text),
            content: seg.text,
            summary: this.summarizeText(seg.text, 100),
            timestamp: seg.start,
            videoTime: this.formatTimestamp(seg.start),
            sourceText: seg.text,
            sourceType: 'transcript',
            tags: ['概念', '核心知识'],
            difficulty,
            importance: 4,
            orderIndex,
            category: '概念解析',
          },
        });
        cards.push(card);
        orderIndex++;

        if (cards.length >= 4) break;
      }
    }

    return cards;
  }

  /**
   * 生成时间线卡片 - 按时间顺序组织关键内容
   */
  private async generateTimelineCards(params: {
    assetId: string;
    transcriptSegments: Array<{ start: number; end: number; text: string }>;
    videoTitle: string;
    difficulty: number;
    startOrderIndex: number;
  }) {
    const { assetId, transcriptSegments, videoTitle, difficulty, startOrderIndex } = params;

    const cards: any[] = [];
    let orderIndex = startOrderIndex;

    // 将转写分段分组为时间线节点
    const timelineSegments = this.groupIntoTimeline(transcriptSegments, 4);

    for (let i = 0; i < timelineSegments.length; i++) {
      const segment = timelineSegments[i];
      const card = await this.prisma.crystalCard.create({
        data: {
          assetId,
          type: CrystalCardType.TIMELINE,
          title: `阶段 ${i + 1}: ${this.extractStageTitle(segment.text)}`,
          content: segment.text,
          summary: this.summarizeText(segment.text, 80),
          timestamp: segment.start,
          videoTime: this.formatTimestamp(segment.start),
          sourceText: segment.text,
          sourceType: 'transcript',
          tags: ['时间线', '进度'],
          difficulty,
          importance: 3,
          orderIndex,
          category: '学习进度',
        },
      });
      cards.push(card);
      orderIndex++;
    }

    return cards;
  }

  /**
   * 生成关键帧卡片 - 基于视觉内容的卡片
   */
  private async generateKeyframeCards(params: {
    assetId: string;
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string }>;
    difficulty: number;
    startOrderIndex: number;
  }) {
    const { assetId, keyframes, difficulty, startOrderIndex } = params;

    const cards: any[] = [];
    let orderIndex = startOrderIndex;

    // 选择前6个关键帧
    const selectedKeyframes = keyframes.slice(0, 6);

    for (let i = 0; i < selectedKeyframes.length; i++) {
      const kf = selectedKeyframes[i];
      const card = await this.prisma.crystalCard.create({
        data: {
          assetId,
          type: CrystalCardType.KEYFRAME,
          title: `关键帧 ${i + 1}`,
          content: kf.description || `视频 ${this.formatTimestamp(kf.timestamp)} 的视觉内容`,
          summary: kf.description?.substring(0, 80) || '',
          timestamp: kf.timestamp,
          videoTime: this.formatTimestamp(kf.timestamp),
          imageUrl: kf.storagePath,
          sourceType: 'keyframe',
          tags: ['视觉', '关键帧'],
          difficulty,
          importance: 3,
          orderIndex,
          category: '视觉记忆',
        },
      });
      cards.push(card);
      orderIndex++;
    }

    return cards;
  }

  /**
   * 生成洞察卡片 - 深度分析和关联
   */
  private async generateInsightCards(params: {
    assetId: string;
    transcriptSegments: Array<{ start: number; end: number; text: string }>;
    outlineMarkdown?: string;
    videoTitle: string;
    difficulty: number;
    startOrderIndex: number;
  }) {
    const { assetId, transcriptSegments, videoTitle, difficulty, startOrderIndex } = params;

    const cards: any[] = [];
    let orderIndex = startOrderIndex;

    // 查找包含洞察性内容的段落
    const insightKeywords = ['因此', '所以', '关键', '重要', '总结', '结论', '意味着'];
    const insightSegments = transcriptSegments.filter((seg) =>
      insightKeywords.some((keyword) => seg.text.includes(keyword)),
    );

    for (let i = 0; i < Math.min(insightSegments.length, 3); i++) {
      const seg = insightSegments[i];
      const card = await this.prisma.crystalCard.create({
        data: {
          assetId,
          type: CrystalCardType.INSIGHT,
          title: `洞察 ${i + 1}: ${this.extractInsightTitle(seg.text)}`,
          content: seg.text,
          summary: this.summarizeText(seg.text, 100),
          timestamp: seg.start,
          videoTime: this.formatTimestamp(seg.start),
          sourceText: seg.text,
          sourceType: 'transcript',
          tags: ['洞察', '深度理解'],
          difficulty: difficulty + 1,
          importance: 5,
          orderIndex,
          category: '深度洞察',
        },
      });
      cards.push(card);
      orderIndex++;
    }

    return cards;
  }

  /**
   * 生成摘要卡片 - 整体概览
   */
  private async generateSummaryCard(params: {
    assetId: string;
    transcriptSegments: Array<{ start: number; end: number; text: string }>;
    videoTitle: string;
    outlineMarkdown?: string;
    orderIndex: number;
  }) {
    const { assetId, transcriptSegments, videoTitle, outlineMarkdown, orderIndex } = params;

    if (transcriptSegments.length === 0) {
      return null;
    }

    // 组合所有文本生成摘要
    const fullText = transcriptSegments.map((seg) => seg.text).join(' ');
    const summary = this.summarizeText(fullText, 300);

    const card = await this.prisma.crystalCard.create({
      data: {
        assetId,
        type: CrystalCardType.SUMMARY,
        title: `《${videoTitle}》学习摘要`,
        content: outlineMarkdown || summary,
        summary: this.summarizeText(summary, 100),
        sourceType: 'generated',
        tags: ['摘要', '概览'],
        difficulty: 1,
        importance: 5,
        isFeatured: true,
        orderIndex,
        category: '整体概览',
      },
    });

    return card;
  }

  /**
   * 获取知识资产的所有晶体卡片
   */
  async getCrystalCards(assetId: string, options: { type?: CrystalCardType } = {}) {
    const where: any = { assetId };

    if (options.type) {
      where.type = options.type;
    }

    const cards = await this.prisma.crystalCard.findMany({
      where,
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      assetId,
      cards,
      count: cards.length,
      byType: this.groupCardsByType(cards),
    };
  }

  /**
   * 更新晶体卡片
   */
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
    const card = await this.prisma.crystalCard.update({
      where: { id: cardId },
      data: updates,
    });

    return card;
  }

  /**
   * 删除晶体卡片
   */
  async deleteCrystalCard(cardId: string) {
    await this.prisma.crystalCard.delete({
      where: { id: cardId },
    });

    return { success: true, cardId };
  }

  /**
   * 获取精选卡片
   */
  async getFeaturedCards(assetId: string) {
    const cards = await this.prisma.crystalCard.findMany({
      where: {
        assetId,
        isFeatured: true,
      },
      orderBy: [{ importance: 'desc' }, { orderIndex: 'asc' }],
    });

    return cards;
  }

  // 辅助方法

  private extractConceptTitle(text: string): string {
    const match = text.match(/^(.{5,30}?)[，。？！,.\s]/);
    return match ? match[1] : text.substring(0, 20);
  }

  private extractStageTitle(text: string): string {
    const keywords = ['开始', '首先', '然后', '接着', '最后', '结束'];
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        const index = text.indexOf(keyword);
        return text.substring(index, index + 15);
      }
    }
    return text.substring(0, 15);
  }

  private extractInsightTitle(text: string): string {
    const patterns = [/关键(.{5,20})/, /重要(.{5,20})/, /结论(.{5,20})/];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return this.extractConceptTitle(text);
  }

  private summarizeText(text: string, maxLength: number): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    return cleaned.substring(0, maxLength - 3) + '...';
  }

  private formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private groupIntoTimeline(
    segments: Array<{ start: number; end: number; text: string }>,
    groupCount: number,
  ): Array<{ start: number; end: number; text: string }> {
    if (segments.length === 0) return [];

    const groupSize = Math.max(1, Math.floor(segments.length / groupCount));
    const groups: Array<{ start: number; end: number; text: string }> = [];

    for (let i = 0; i < segments.length; i += groupSize) {
      const groupSegments = segments.slice(i, i + groupSize);
      const combined = {
        start: groupSegments[0].start,
        end: groupSegments[groupSegments.length - 1].end,
        text: groupSegments.map((seg) => seg.text).join(' '),
      };
      groups.push(combined);

      if (groups.length >= groupCount) break;
    }

    return groups;
  }

  private groupCardsByType(cards: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    for (const card of cards) {
      const type = card.type;
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(card);
    }

    return grouped;
  }
}
