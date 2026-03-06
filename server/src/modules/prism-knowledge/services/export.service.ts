import { Injectable, Logger } from '@nestjs/common';
import { CrystalCardType, MessageRole } from '../../../../generated/prisma/enums';
import { FeishuService } from '../../../infrastructure/sync/feishu.service';
import { NotionService } from '../../../infrastructure/sync/notion.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { FlashcardService } from './flashcard.service';

interface DbKnowledgeAsset {
  id: string;
  videoId: string;
  outlineMarkdown: string;
  notesMarkdown: string | null;
  syncedTo: string[];
}

interface DbKeyframe {
  id: string;
  timestamp: number;
  storagePath: string;
  description: string | null;
  frameType: string;
}

interface DbFlashcard {
  id: string;
  assetId: string;
  front: string;
  back: string;
  chapter: string | null;
  difficulty: number;
  nextReview: Date | null;
}

interface DbCrystalCard {
  id: string;
  assetId: string;
  title: string;
  content: string;
  summary: string | null;
  sourceText: string | null;
  timestamp: number | null;
}

interface DbChatMessage {
  role: MessageRole;
  content: string;
  metadata: unknown;
}

interface DbUserProfile {
  name: string | null;
  email: string;
  profile: unknown;
}

interface DbDeepAnalysis {
  id: string;
  version: number;
  summary: string | null;
  chapterGraphJson: unknown;
  conceptGraphJson: unknown;
  ambiguitiesJson: unknown;
  backgroundFactsJson: unknown;
  learningRecommendationsJson: unknown;
}

export type KnowledgeSyncTarget = 'notion' | 'feishu';

export interface KnowledgeSettlementOutput {
  title: string;
  outlineMarkdown: string;
  notesMarkdown: string;
  reviewPlanMarkdown: string;
  markdownPackage: {
    fileName: string;
    content: string;
    size: number;
  };
  flashcards: Array<{
    id: string;
    front: string;
    back: string;
    chapter?: string | null;
    difficulty: number;
    nextReview?: string | null;
  }>;
  keyframes: Array<{
    id: string;
    timestamp: number;
    url: string;
    description?: string | null;
    frameType: string;
  }>;
}

export interface KnowledgeSettlementSyncResult {
  success: boolean;
  mode: 'api' | 'dry-run';
  url?: string;
  id?: string;
  reason?: string;
}

export interface KnowledgeSettlementResult {
  output: KnowledgeSettlementOutput;
  sync: Partial<Record<KnowledgeSyncTarget, KnowledgeSettlementSyncResult>>;
  syncedTargets: KnowledgeSyncTarget[];
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flashcardService: FlashcardService,
    private readonly notionService: NotionService,
    private readonly feishuService: FeishuService,
  ) {}

  async settleKnowledgePackage(params: {
    userId: string;
    videoId: string;
    videoTitle: string;
    forceRegenerate?: boolean;
    syncTargets?: KnowledgeSyncTarget[];
  }): Promise<KnowledgeSettlementResult> {
    const { userId, videoId, videoTitle, forceRegenerate = false } = params;
    const syncTargets = this.normalizeSyncTargets(params.syncTargets);

    const [transcript, keyframes, latestAsset, user, userSettings, qaCards, chatMessages, behaviorEvents, deepAnalysis] =
      await Promise.all([
        this.prisma.transcript.findFirst({
          where: { videoId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, segments: true },
        }),
        this.prisma.keyframe.findMany({
          where: { videoId },
          orderBy: { timestamp: 'asc' },
        }),
        this.prisma.knowledgeAsset.findFirst({
          where: { videoId },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, profile: true },
        }),
        this.prisma.userSettings.findUnique({
          where: { userId },
          select: { notionToken: true, feishuAppId: true, feishuAppSecret: true },
        }),
        this.prisma.crystalCard.findMany({
          where: {
            asset: { videoId },
            type: CrystalCardType.QA,
          },
          orderBy: { createdAt: 'asc' },
          take: 40,
        }),
        this.prisma.chatMessage.findMany({
          where: {
            role: { in: [MessageRole.USER, MessageRole.ASSISTANT] },
            session: {
              userId,
              videoId,
            },
          },
          orderBy: { createdAt: 'asc' },
          take: 120,
        }),
        this.prisma.videoBehaviorEvent.findMany({
          where: {
            userId,
            videoId,
            eventType: { in: ['SEEK', 'PAUSE'] as any },
          },
          select: {
            eventType: true,
            previousTime: true,
            currentTime: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        this.prisma.knowledgeDeepAnalysis.findFirst({
          where: { videoId, status: 'COMPLETED' as any },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    const segments = ((transcript?.segments as any[]) ?? []).map((s: any) => ({
      start: Number(s?.start ?? 0),
      end: Number(s?.end ?? 0),
      text: String(s?.text ?? ''),
    }));

    const asset = await this.ensureKnowledgeAsset(videoId, latestAsset, segments, videoTitle);
    const cards = await this.ensureFlashcards({
      asset,
      transcriptSegments: segments,
      userId,
      videoTitle,
      forceRegenerate,
      deepAnalysis: this.toDeepAnalysisContext(deepAnalysis),
    });

    const fusedOutlineMarkdown = this.composeEnrichedOutlineMarkdown(
      asset.outlineMarkdown || '',
      keyframes,
      qaCards,
      deepAnalysis,
    );
    const fusedNotesMarkdown = this.composeFusedNotesMarkdown({
      user,
      asset,
      keyframes,
      qaCards,
      chatMessages,
      behaviorEvents,
      deepAnalysis,
    });
    const reviewPlanMarkdown = this.composeReviewPlanMarkdown(cards);
    const packageMarkdown = this.composePackageMarkdown({
      title: `${videoTitle} - 学习结算包`,
      outlineMarkdown: fusedOutlineMarkdown,
      notesMarkdown: fusedNotesMarkdown,
      reviewPlanMarkdown,
      keyframes,
      flashcards: cards,
      deepAnalysis,
    });

    await this.prisma.knowledgeAsset.update({
      where: { id: asset.id },
      data: {
        notesMarkdown: fusedNotesMarkdown,
      },
    });

    const syncResults: Partial<Record<KnowledgeSyncTarget, KnowledgeSettlementSyncResult>> = {};
    const succeededTargets: KnowledgeSyncTarget[] = [];

    for (const target of syncTargets) {
      try {
        if (target === 'notion') {
          const notion = await this.notionService.syncKnowledgePackage({
            title: `${videoTitle} - Knowledge Board`,
            outlineMarkdown: fusedOutlineMarkdown,
            notesMarkdown: fusedNotesMarkdown,
            reviewPlanMarkdown,
            flashcards: cards.map((card) => ({
              front: card.front,
              back: card.back,
              chapter: card.chapter,
              difficulty: card.difficulty,
              nextReview: card.nextReview?.toISOString() ?? null,
            })),
            keyframes: keyframes.map((kf) => ({
              timestamp: kf.timestamp,
              url: kf.storagePath,
              description: kf.description,
            })),
            notionToken: userSettings?.notionToken ?? undefined,
          });

          syncResults.notion = {
            success: notion.success,
            mode: notion.mode,
            url: notion.pageUrl,
            id: notion.pageId,
            reason: notion.reason,
          };

          if (notion.success) {
            succeededTargets.push('notion');
          }
        }

        if (target === 'feishu') {
          const feishu = await this.feishuService.syncKnowledgePackage({
            title: `${videoTitle} - Knowledge Board`,
            outlineMarkdown: fusedOutlineMarkdown,
            notesMarkdown: fusedNotesMarkdown,
            reviewPlanMarkdown,
            flashcards: cards.map((card) => ({
              front: card.front,
              back: card.back,
              chapter: card.chapter,
              difficulty: card.difficulty,
              nextReview: card.nextReview?.toISOString() ?? null,
            })),
            keyframes: keyframes.map((kf) => ({
              timestamp: kf.timestamp,
              url: kf.storagePath,
              description: kf.description,
            })),
            feishuAppId: userSettings?.feishuAppId ?? undefined,
            feishuAppSecret: userSettings?.feishuAppSecret ?? undefined,
          });

          syncResults.feishu = {
            success: feishu.success,
            mode: feishu.mode,
            url: feishu.documentUrl,
            id: feishu.documentId,
            reason: feishu.reason,
          };

          if (feishu.success) {
            succeededTargets.push('feishu');
          }
        }
      } catch (error: any) {
        this.logger.warn(`Sync failed for ${target}: ${error?.message || 'unknown error'}`);
        syncResults[target] = {
          success: false,
          mode: 'api',
          reason: error?.message || 'Sync failed',
        };
      }
    }

    if (succeededTargets.length > 0) {
      const mergedTargets = new Set<string>(asset.syncedTo ?? []);
      succeededTargets.forEach((target) => mergedTargets.add(target));
      await this.prisma.knowledgeAsset.update({
        where: { id: asset.id },
        data: {
          syncedTo: Array.from(mergedTargets),
        },
      });
    }

    return {
      output: {
        title: `${videoTitle} - 学习结算包`,
        outlineMarkdown: fusedOutlineMarkdown,
        notesMarkdown: fusedNotesMarkdown,
        reviewPlanMarkdown,
        markdownPackage: {
          fileName: this.normalizeFileName(`${videoTitle}-knowledge-settlement.md`),
          content: packageMarkdown,
          size: Buffer.byteLength(packageMarkdown, 'utf8'),
        },
        flashcards: cards.map((card) => ({
          id: card.id,
          front: card.front,
          back: card.back,
          chapter: card.chapter,
          difficulty: card.difficulty,
          nextReview: card.nextReview ? card.nextReview.toISOString() : null,
        })),
        keyframes: keyframes.map((kf) => ({
          id: kf.id,
          timestamp: kf.timestamp,
          url: kf.storagePath,
          description: kf.description,
          frameType: String(kf.frameType),
        })),
      },
      sync: syncResults,
      syncedTargets: succeededTargets,
    };
  }

  private normalizeSyncTargets(targets?: KnowledgeSyncTarget[]) {
    const normalized = new Set<KnowledgeSyncTarget>();
    for (const target of targets ?? []) {
      if (target === 'notion' || target === 'feishu') normalized.add(target);
    }
    return Array.from(normalized);
  }

  private async ensureKnowledgeAsset(
    videoId: string,
    asset: DbKnowledgeAsset | null,
    transcriptSegments: Array<{ start: number; end: number; text: string }>,
    videoTitle: string,
  ) {
    if (asset) return asset;

    const fallbackOutline = this.buildFallbackOutline(videoTitle, transcriptSegments);
    return this.prisma.knowledgeAsset.create({
      data: {
        videoId,
        outlineMarkdown: fallbackOutline,
        notesMarkdown: '',
        status: 'COMPLETED',
      },
    });
  }

  private async ensureFlashcards(params: {
    asset: DbKnowledgeAsset;
    transcriptSegments: Array<{ start: number; end: number; text: string }>;
    userId: string;
    videoTitle: string;
    forceRegenerate: boolean;
    deepAnalysis?: {
      summary?: string;
      chapterGraph?: Array<Record<string, unknown>>;
      conceptGraph?: Array<Record<string, unknown>>;
      learningRecommendations?: Array<Record<string, unknown>>;
      ambiguities?: Array<Record<string, unknown>>;
    };
  }) {
    const { asset, transcriptSegments, userId, videoTitle, forceRegenerate, deepAnalysis } = params;
    const existing = await this.prisma.flashcard.findMany({
      where: { assetId: asset.id },
      orderBy: { createdAt: 'asc' },
    });

    if (!forceRegenerate && existing.length > 0) {
      return existing;
    }

    return this.flashcardService.generateFlashcards({
      assetId: asset.id,
      transcriptSegments,
      userId,
      videoTitle,
      outlineMarkdown: asset.outlineMarkdown || '',
      maxCards: 16,
      deepAnalysis,
    });
  }

  private buildFallbackOutline(
    videoTitle: string,
    transcriptSegments: Array<{ start: number; end: number; text: string }>,
  ) {
    const lines: string[] = [`# ${videoTitle} - 结构化大纲`, ''];

    const steps = transcriptSegments.slice(0, 10);
    if (steps.length === 0) {
      lines.push('## 核心主题');
      lines.push('- 暂无可用转写，请先运行分析。');
      return lines.join('\n');
    }

    steps.forEach((seg, idx) => {
      lines.push(`## ${idx + 1}. ${this.formatTimestamp(seg.start)} - ${this.formatTimestamp(seg.end)}`);
      lines.push(`- ${seg.text}`);
      lines.push('');
    });

    return lines.join('\n').trim();
  }

  private composeEnrichedOutlineMarkdown(
    outlineMarkdown: string,
    keyframes: DbKeyframe[],
    qaCards: DbCrystalCard[],
    deepAnalysis?: DbDeepAnalysis | null,
  ) {
    const keyframeLines = keyframes.slice(0, 24).map((kf) => {
      const desc = kf.description?.trim() || `关键帧类型: ${String(kf.frameType)}`;
      return `- [${this.formatTimestamp(kf.timestamp)}] ${desc}\n  ![keyframe-${kf.id}](${kf.storagePath})`;
    });

    const qaLines = qaCards.slice(-12).map((card) => {
      const ts = card.timestamp != null ? this.formatTimestamp(card.timestamp) : '无时间锚点';
      return `- [${ts}] Q: ${card.sourceText || card.title}\n  A: ${this.takeFirstLine(card.content || card.summary || '')}`;
    });

    const backgroundLines = Array.isArray(deepAnalysis?.backgroundFactsJson)
      ? (deepAnalysis?.backgroundFactsJson as Array<Record<string, unknown>>)
          .slice(0, 8)
          .map((fact) => {
            const title = typeof fact.title === 'string' ? fact.title : '背景事实';
            const detail =
              typeof fact.detail === 'string'
                ? fact.detail
                : typeof fact.summary === 'string'
                  ? fact.summary
                  : '';
            return `- ${title}${detail ? `：${detail}` : ''}`;
          })
      : [];

    return [
      outlineMarkdown?.trim() || '# 结构化大纲\n\n（暂无内容）',
      ...(deepAnalysis?.summary ? ['', '## 二次理解摘要', deepAnalysis.summary] : []),
      ...(backgroundLines.length > 0 ? ['', '## 背景知识补充', backgroundLines.join('\n')] : []),
      '',
      '## 关键帧图谱',
      keyframeLines.length > 0 ? keyframeLines.join('\n') : '- 暂无关键帧',
      '',
      '## 对话补充索引',
      qaLines.length > 0 ? qaLines.join('\n') : '- 暂无 Q&A 补充',
    ]
      .join('\n')
      .trim();
  }

  private composeFusedNotesMarkdown(params: {
    user: DbUserProfile | null;
    asset: DbKnowledgeAsset;
    keyframes: DbKeyframe[];
    qaCards: DbCrystalCard[];
    chatMessages: DbChatMessage[];
    behaviorEvents: Array<{
      eventType: string;
      previousTime: number | null;
      currentTime: number;
      createdAt: Date;
    }>;
    deepAnalysis?: DbDeepAnalysis | null;
  }) {
    const { user, asset, keyframes, qaCards, chatMessages, behaviorEvents, deepAnalysis } = params;

    const profileText = this.serializeUserProfile(user);
    const highlights = this.deriveBehaviorHighlights(behaviorEvents);
    const qaFromCards = qaCards.slice(-12).map((card) => {
      const time = card.timestamp != null ? this.formatTimestamp(card.timestamp) : '无时间锚点';
      return `- [${time}] Q: ${card.sourceText || card.title}\n  A: ${this.takeFirstLine(card.content || card.summary || '')}`;
    });

    const qaFromChat = this.extractRecentChatQa(chatMessages).slice(-8).map((item) => {
      const time = item.timestampSec != null ? this.formatTimestamp(item.timestampSec) : '无时间锚点';
      return `- [${time}] Q: ${item.question}\n  A: ${item.answer}`;
    });

    const keyframeHints = keyframes.slice(0, 8).map((frame) => {
      return `- ${this.formatTimestamp(frame.timestamp)}：${frame.description || `关键帧(${String(frame.frameType)})`}`;
    });

    const chapterLines = Array.isArray(deepAnalysis?.chapterGraphJson)
      ? (deepAnalysis?.chapterGraphJson as Array<Record<string, unknown>>)
          .slice(0, 8)
          .map((chapter) => {
            const title = typeof chapter.title === 'string' ? chapter.title : '章节';
            const summary =
              typeof chapter.summary === 'string' ? chapter.summary : '';
            return `- ${title}${summary ? `：${summary}` : ''}`;
          })
      : [];

    const recommendationLines = Array.isArray(deepAnalysis?.learningRecommendationsJson)
      ? (deepAnalysis?.learningRecommendationsJson as Array<Record<string, unknown>>)
          .slice(0, 8)
          .map((item) => {
            const title = typeof item.title === 'string' ? item.title : '学习建议';
            const action = typeof item.action === 'string' ? item.action : '';
            return `- ${title}${action ? `：${action}` : ''}`;
          })
      : [];

    const ambiguityLines = Array.isArray(deepAnalysis?.ambiguitiesJson)
      ? (deepAnalysis?.ambiguitiesJson as Array<Record<string, unknown>>)
          .slice(0, 6)
          .map((item) => {
            const concept = typeof item.concept === 'string' ? item.concept : '易混淆点';
            const clarification =
              typeof item.clarification === 'string' ? item.clarification : '';
            return `- ${concept}${clarification ? `：${clarification}` : ''}`;
          })
      : [];

    return [
      '# 个性化学习笔记',
      '',
      '## 画像驱动策略',
      profileText || '- 暂无画像，默认以“概念清晰 + 可复述 + 可回看”策略整理。',
      ...(deepAnalysis?.summary ? ['', '## 二次理解摘要', deepAnalysis.summary] : []),
      ...(chapterLines.length > 0 ? ['', '## 章节主线', chapterLines.join('\n')] : []),
      '',
      '## 关键理解路径（由视频主线自动收敛）',
      keyframeHints.length > 0
        ? keyframeHints.join('\n')
        : '- 暂无关键帧提示，可先从大纲的 H2 主题顺序学习。',
      '',
      '## 对话驱动补充（Q&A 融合）',
      qaFromCards.length > 0
        ? qaFromCards.join('\n')
        : qaFromChat.length > 0
          ? qaFromChat.join('\n')
          : '- 暂无 Q&A 补充。',
      ...(ambiguityLines.length > 0 ? ['', '## 易混淆点澄清', ambiguityLines.join('\n')] : []),
      ...(recommendationLines.length > 0 ? ['', '## 学习建议', recommendationLines.join('\n')] : []),
      '',
      '## 用户观看行为洞察（重点/跳过）',
      highlights.length > 0 ? highlights.join('\n') : '- 暂无行为数据。',
      '',
      '## 原始笔记片段（保留）',
      asset.notesMarkdown?.trim() || '（暂无历史笔记）',
    ]
      .join('\n')
      .trim();
  }

  private composeReviewPlanMarkdown(flashcards: DbFlashcard[]) {
    if (flashcards.length === 0) {
      return '# 复习计划\n\n- 暂无闪卡可生成复习时间表。';
    }

    const grouped = new Map<string, DbFlashcard[]>();
    for (const card of flashcards) {
      const key = card.nextReview ? card.nextReview.toISOString().slice(0, 10) : '未安排';
      const bucket = grouped.get(key) ?? [];
      bucket.push(card);
      grouped.set(key, bucket);
    }

    const lines = ['# 复习计划（艾宾浩斯节奏）', ''];
    const dates = Array.from(grouped.keys()).sort();
    for (const date of dates) {
      const cards = grouped.get(date) ?? [];
      lines.push(`## ${date}`);
      cards.slice(0, 16).forEach((card, idx) => {
        lines.push(`- [${idx + 1}] ${card.front}（难度 ${card.difficulty}）`);
      });
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  private composePackageMarkdown(params: {
    title: string;
    outlineMarkdown: string;
    notesMarkdown: string;
    reviewPlanMarkdown: string;
    keyframes: DbKeyframe[];
    flashcards: DbFlashcard[];
    deepAnalysis?: DbDeepAnalysis | null;
  }) {
    const { title, outlineMarkdown, notesMarkdown, reviewPlanMarkdown, keyframes, flashcards, deepAnalysis } = params;

    const flashcardSection =
      flashcards.length > 0
        ? flashcards
            .slice(0, 40)
            .map((card, idx) => {
              const next = card.nextReview ? card.nextReview.toISOString() : '未安排';
              return `${idx + 1}. Q: ${card.front}\nA: ${card.back}\n章节: ${card.chapter || '未分章'} | 难度: ${card.difficulty} | 下次复习: ${next}`;
            })
            .join('\n\n')
        : '（暂无闪卡）';

    const keyframeSection =
      keyframes.length > 0
        ? keyframes
            .slice(0, 24)
            .map((kf, idx) => {
              return `- [${this.formatTimestamp(kf.timestamp)}] ${kf.description || `关键帧 ${idx + 1}`} \n  ![keyframe-${idx + 1}](${kf.storagePath})`;
            })
            .join('\n')
        : '（暂无关键帧）';

    return [
      `# ${title}`,
      '',
      '## 1) 图文并茂结构化大纲',
      '',
      outlineMarkdown,
      '',
      '## 2) 二次理解与背景知识',
      '',
      deepAnalysis?.summary || '（暂无二次理解摘要）',
      '',
      '## 3) 个性化学习笔记（融合 Q&A）',
      '',
      notesMarkdown,
      '',
      '## 4) 记忆闪卡',
      '',
      flashcardSection,
      '',
      '## 5) 关键帧索引',
      '',
      keyframeSection,
      '',
      '## 6) 复习计划',
      '',
      reviewPlanMarkdown,
    ]
      .join('\n')
      .trim();
  }

  private toDeepAnalysisContext(deepAnalysis?: DbDeepAnalysis | null) {
    if (!deepAnalysis) return undefined;
    return {
      summary: deepAnalysis.summary ?? '',
      chapterGraph: (deepAnalysis.chapterGraphJson as any[]) ?? [],
      conceptGraph: (deepAnalysis.conceptGraphJson as any[]) ?? [],
      learningRecommendations:
        (deepAnalysis.learningRecommendationsJson as any[]) ?? [],
      ambiguities: (deepAnalysis.ambiguitiesJson as any[]) ?? [],
    };
  }

  private serializeUserProfile(user: DbUserProfile | null) {
    if (!user) return '';
    const lines: string[] = [];
    if (user.name) lines.push(`- 用户名：${user.name}`);
    if (user.email) lines.push(`- 邮箱：${user.email}`);
    if (user.profile != null) {
      if (typeof user.profile === 'string') {
        lines.push(`- 画像：${user.profile}`);
      } else {
        lines.push(`- 画像：${JSON.stringify(user.profile)}`);
      }
    }
    return lines.join('\n');
  }

  private deriveBehaviorHighlights(
    events: Array<{
      eventType: string;
      previousTime: number | null;
      currentTime: number;
      createdAt: Date;
    }>,
  ) {
    const hotspot = new Map<number, number>();
    const skipped: Array<{ from: number; to: number }> = [];

    for (const event of events) {
      const bucket = Math.floor(Math.max(0, event.currentTime) / 30) * 30;
      hotspot.set(bucket, (hotspot.get(bucket) ?? 0) + 1);

      if (
        event.eventType === 'SEEK' &&
        event.previousTime != null &&
        event.currentTime - event.previousTime > 20
      ) {
        skipped.push({ from: event.previousTime, to: event.currentTime });
      }
    }

    const lines: string[] = [];
    const topHotspots = Array.from(hotspot.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (topHotspots.length > 0) {
      lines.push(
        `- 高频关注片段：${topHotspots
          .map(([start, count]) => `${this.formatTimestamp(start)}-${this.formatTimestamp(start + 30)} (${count} 次)`)
          .join('，')}`,
      );
    }

    if (skipped.length > 0) {
      const clipped = skipped.slice(0, 6);
      lines.push(
        `- 常见跳过片段：${clipped
          .map((item) => `${this.formatTimestamp(item.from)} -> ${this.formatTimestamp(item.to)}`)
          .join('，')}`,
      );
      lines.push('- 建议对跳过片段配合闪卡回看，优先关注定义、公式、转折结论。');
    }

    return lines;
  }

  private extractRecentChatQa(messages: DbChatMessage[]) {
    const qa: Array<{ question: string; answer: string; timestampSec?: number }> = [];
    for (let index = 0; index < messages.length - 1; index += 1) {
      const current = messages[index];
      const next = messages[index + 1];
      if (current.role !== MessageRole.USER || next.role !== MessageRole.ASSISTANT) continue;

      let timestampSec: number | undefined;
      const metadata = (current.metadata as any) ?? null;
      if (metadata && typeof metadata.timestampSec === 'number') {
        timestampSec = Number(metadata.timestampSec);
      }

      qa.push({
        question: current.content,
        answer: this.takeFirstLine(next.content),
        timestampSec,
      });
    }

    return qa;
  }

  private formatTimestamp(seconds: number) {
    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private takeFirstLine(text: string) {
    return (
      String(text || '')
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? ''
    );
  }

  private normalizeFileName(fileName: string) {
    return fileName
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_');
  }
}
