import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CrystalCardType, TaskStatus } from '../../../generated/prisma/enums';
import { WsGateway } from '../../infrastructure/websocket/ws.gateway';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AnalyzeKnowledgeDto,
  BatchAnalyzeKnowledgeDto,
  ExportKnowledgeDto,
  GenerateMindmapDto,
  RegenerateFlashcardsDto,
  SettleKnowledgeDto,
} from './dto';
import {
  deriveKnowledgeBoardState,
  KnowledgeBoardSnapshot,
  KnowledgeBoardState,
  KnowledgeTimelineItem,
  KnowledgeTimelineItemType,
  parseTimestampToSeconds,
} from './contracts/knowledge-board.contract';
import { CrystalCardService } from './services/crystal-card.service';
import { FlashcardService } from './services/flashcard.service';
import { KeyframeService } from './services/keyframe.service';
import { MindmapService, MindmapResult } from './services/mindmap.service';
import { OutlineService } from './services/outline.service';
import { TranscriptService } from './services/transcript.service';
import { ExportService } from './services/export.service';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
    private readonly transcriptService: TranscriptService,
    private readonly keyframeService: KeyframeService,
    private readonly outlineService: OutlineService,
    private readonly flashcardService: FlashcardService,
    private readonly crystalCardService: CrystalCardService,
    private readonly mindmapService: MindmapService,
    private readonly exportService: ExportService,
  ) {}

  async analyze(
    userId: string,
    videoId: string,
    dto: AnalyzeKnowledgeDto,
  ) {
    const video = await this.getOwnedVideo(userId, videoId);
    const taskId = `knowledge_${Date.now()}`;
    const now = new Date().toISOString();

    await this.ensureProcessingAsset(video.id);
    this.emitKnowledgeState(video.projectId, {
      taskId,
      videoId: video.id,
      state: KnowledgeBoardState.ANALYZING,
      message: '知识分析启动',
      stats: {
        transcriptSegments: 0,
        keyframes: 0,
        flashcards: 0,
      },
      timestamp: now,
    });
    this.wsGateway.emitTaskProgress(userId, {
      projectId: video.projectId,
      videoId: video.id,
      task: 'knowledge_analyze',
      progress: 3,
      message: '开始执行 ASR 转写',
      timestamp: now,
    });

    const transcript = await this.transcriptService.generateTranscript(
      {
        id: video.id,
        title: video.title,
        sourceType: video.sourceType,
        storagePath: video.storagePath,
        duration: video.duration,
      },
      userId,
      {
        regenerate: dto.regenerateTranscript,
        onStatus: async (status, metadata) => {
          if (status === 'streaming' || status === 'completed') {
            this.emitKnowledgeState(video.projectId, {
              taskId,
              videoId: video.id,
              state: KnowledgeBoardState.STREAMING,
              message: '转写结果已生成，正在推送时间轴片段',
              stats: {
                transcriptSegments: Number(metadata?.segmentCount ?? 0),
              },
              timestamp: new Date().toISOString(),
            });
          }
        },
        onSegment: async (segment, index, total) => {
          const progress = 8 + Math.round(((index + 1) / Math.max(total, 1)) * 22);
          this.wsGateway.emitTaskProgress(userId, {
            projectId: video.projectId,
            videoId: video.id,
            task: 'knowledge_analyze',
            progress,
            message: `ASR 片段 ${index + 1}/${total}`,
            timestamp: new Date().toISOString(),
          });
          this.emitKnowledgeTimelineItem(video.projectId, {
            projectId: video.projectId,
            videoId: video.id,
            taskId,
            item: {
              id: `outline-seg-${video.id}-${index + 1}`,
              type: KnowledgeTimelineItemType.OUTLINE_BLOCK,
              title: `转写片段 ${index + 1}`,
              summary: segment.text,
              content: segment.text,
              timestampSec: segment.start,
              metadata: {
                source: 'asr',
                start: segment.start,
                end: segment.end,
                confidence: segment.confidence,
              },
              createdAt: new Date().toISOString(),
            },
            timestamp: new Date().toISOString(),
          });
        },
      },
    );

    this.wsGateway.emitTaskProgress(userId, {
      projectId: video.projectId,
      videoId: video.id,
      task: 'knowledge_analyze',
      progress: 35,
      message: '开始关键帧抽取与多模态分类',
      timestamp: new Date().toISOString(),
    });

    const keyframes = await this.keyframeService.extractKeyframes(
      {
        id: video.id,
        projectId: video.projectId,
        sourceType: video.sourceType,
        storagePath: video.storagePath,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
      },
      userId,
      {
        regenerate: dto.regenerateKeyframes,
        onProgress: async ({ current, total }) => {
          const ratio = total <= 0 ? 0 : current / total;
          const progress = 36 + Math.round(ratio * 24);
          this.wsGateway.emitTaskProgress(userId, {
            projectId: video.projectId,
            videoId: video.id,
            task: 'knowledge_analyze',
            progress,
            message: `关键帧抽取 ${current}/${total}`,
            timestamp: new Date().toISOString(),
          });
        },
        onFrame: async (frame, index, total) => {
          this.emitKnowledgeState(video.projectId, {
            taskId,
            videoId: video.id,
            state: KnowledgeBoardState.STREAMING,
            message: '关键帧已更新',
            stats: { keyframes: index + 1, keyframeCandidates: total },
            timestamp: new Date().toISOString(),
          });

          this.emitKnowledgeTimelineItem(video.projectId, {
            projectId: video.projectId,
            videoId: video.id,
            taskId,
            item: {
              id: `keyframe-${frame.id}`,
              type: KnowledgeTimelineItemType.KEYFRAME_CARD,
              title: `关键帧 ${index + 1}`,
              summary: frame.description ?? `关键帧分类：${frame.frameType}`,
              imageUrl: frame.storagePath,
              timestampSec: frame.timestamp,
              metadata: {
                frameType: frame.frameType,
                similarity: frame.similarity ?? null,
              },
              createdAt: new Date().toISOString(),
            },
            timestamp: new Date().toISOString(),
          });
        },
      },
    );

    const transcriptSegments =
      (transcript.segments as Array<{
        start: number;
        end: number;
        text: string;
      }>) ?? [];

    const asset = await this.outlineService.buildOutline({
      userId,
      videoId: video.id,
      videoTitle: video.title,
      transcriptSegments,
      keyframes: keyframes.map((kf) => ({
        timestamp: kf.timestamp,
        storagePath: kf.storagePath,
        description: kf.description,
      })),
    });

    this.wsGateway.emitTaskProgress(userId, {
      projectId: video.projectId,
      videoId: video.id,
      task: 'knowledge_analyze',
      progress: 72,
      message: '结构化大纲已生成',
      timestamp: new Date().toISOString(),
    });

    this.emitKnowledgeTimelineItem(video.projectId, {
      projectId: video.projectId,
      videoId: video.id,
      taskId,
      item: {
        id: `outline-${asset.id}`,
        type: KnowledgeTimelineItemType.OUTLINE_BLOCK,
        title: '结构化大纲',
        summary: this.takeFirstNonEmptyLine(asset.outlineMarkdown) ?? '知识大纲已生成',
        content: asset.outlineMarkdown,
        timestampSec: parseTimestampToSeconds(asset.outlineMarkdown),
        metadata: { source: 'outline_service' },
        createdAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });

    const flashcards = await this.flashcardService.generateFlashcards({
      assetId: asset.id,
      transcriptSegments,
      userId,
      videoTitle: video.title,
      outlineMarkdown: asset.outlineMarkdown ?? '',
      maxCards: 12,
    });

    const flashcardItems = flashcards.slice(0, 12);
    flashcardItems.forEach((card, idx) => {
      this.emitKnowledgeTimelineItem(video.projectId, {
        projectId: video.projectId,
        videoId: video.id,
        taskId,
        item: {
          id: `flashcard-${card.id}`,
          type: KnowledgeTimelineItemType.FLASHCARD,
          title: `记忆闪卡 ${idx + 1}`,
          summary: card.front,
          content: card.back,
          metadata: {
            chapter: card.chapter,
            difficulty: card.difficulty,
            nextReview: card.nextReview ? new Date(card.nextReview).toISOString() : null,
          },
          createdAt: card.createdAt ? new Date(card.createdAt).toISOString() : new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    });

    if (flashcards.length > 0) {
      const reviews = flashcards
        .map((card) => card.nextReview)
        .filter(Boolean)
        .map((d) => new Date(d).toISOString());
      this.emitKnowledgeTimelineItem(video.projectId, {
        projectId: video.projectId,
        videoId: video.id,
        taskId,
        item: {
          id: `review-plan-${asset.id}`,
          type: KnowledgeTimelineItemType.REVIEW_PLAN,
          title: '复习计划',
          summary: `已生成 ${flashcards.length} 张闪卡的复习时间表`,
          content: reviews.join('\n'),
          metadata: {
            reviewCount: reviews.length,
            reviewTimes: reviews,
          },
          createdAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    }

    this.wsGateway.emitTaskProgress(userId, {
      projectId: video.projectId,
      videoId: video.id,
      task: 'knowledge_analyze',
      progress: 100,
      message: '知识分析完成',
      timestamp: new Date().toISOString(),
    });
    this.wsGateway.emitTaskComplete(userId, {
      projectId: video.projectId,
      task: 'knowledge_analyze',
      result: {
        taskId,
        videoId: video.id,
        assetId: asset.id,
      },
      timestamp: new Date().toISOString(),
    });
    this.emitKnowledgeState(video.projectId, {
      taskId,
      videoId: video.id,
      state: KnowledgeBoardState.READY,
      message: '知识看板已就绪',
      stats: {
        transcriptSegments: transcriptSegments.length,
        keyframes: keyframes.length,
        flashcards: flashcards.length,
      },
      timestamp: new Date().toISOString(),
    });

    return {
      taskId,
      userId,
      videoId,
      status: 'completed',
      boardState: KnowledgeBoardState.READY,
      options: dto,
      transcriptId: transcript.id,
      keyframeCount: keyframes.length,
      assetId: asset.id,
      flashcardCount: flashcards.length,
    };
  }

  async analyzeBatch(userId: string, dto: BatchAnalyzeKnowledgeDto) {
    const startedAt = Date.now();
    const options: AnalyzeKnowledgeDto = {
      regenerateTranscript: dto.regenerateTranscript,
      regenerateKeyframes: dto.regenerateKeyframes,
    };

    const results: Array<{
      videoId: string;
      status: 'completed' | 'failed';
      result?: any;
      error?: string;
    }> = [];

    // 按用户要求逐个分析，确保视频与音频流分析过程稳定可追踪。
    for (const videoId of dto.videoIds) {
      try {
        const result = await this.analyze(userId, videoId, options);
        results.push({ videoId, status: 'completed', result });
      } catch (error: any) {
        const message = error?.message || 'Unknown error';
        this.logger.error(
          `Analyze batch failed for video ${videoId}: ${message}`,
          error?.stack,
        );
        results.push({
          videoId,
          status: 'failed',
          error: message,
        });
      }
    }

    const completed = results.filter((r) => r.status === 'completed').length;
    const failed = results.length - completed;

    return {
      taskId: `knowledge_batch_${Date.now()}`,
      status: failed > 0 ? 'partial' : 'completed',
      total: results.length,
      completed,
      failed,
      durationMs: Date.now() - startedAt,
      results,
    };
  }

  async getBoardSnapshot(userId: string, videoId: string): Promise<KnowledgeBoardSnapshot> {
    const video = await this.getOwnedVideo(userId, videoId);

    const [transcript, keyframes, asset, flashcards, qaCards] = await Promise.all([
      this.prisma.transcript.findFirst({
        where: { videoId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, segments: true, createdAt: true },
      }),
      this.prisma.keyframe.findMany({
        where: { videoId },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.knowledgeAsset.findFirst({
        where: { videoId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.flashcard.findMany({
        where: {
          asset: { videoId },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.crystalCard.findMany({
        where: {
          asset: { videoId },
          type: CrystalCardType.QA,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const transcriptSegments = (transcript?.segments as Array<{
      start?: number;
      end?: number;
      text?: string;
    }>) ?? [];

    const outlineBlocks = this.extractOutlineBlocks(asset?.outlineMarkdown ?? '', video.id, asset?.id ?? null);
    const qaFromNotes = this.extractQaCardsFromNotes(asset?.notesMarkdown ?? '', video.id, asset?.id ?? null);

    const timeline: KnowledgeTimelineItem[] = [
      ...keyframes.map((frame) => ({
        id: `keyframe-${frame.id}`,
        type: KnowledgeTimelineItemType.KEYFRAME_CARD,
        videoId: video.id,
        assetId: asset?.id ?? null,
        timestampSec: frame.timestamp,
        title: `关键帧 @ ${this.formatTimestamp(frame.timestamp)}`,
        summary: frame.description ?? `画面类型：${frame.frameType}`,
        imageUrl: frame.storagePath,
        metadata: {
          frameType: frame.frameType,
          similarity: frame.similarity ?? null,
        },
        createdAt: frame.createdAt.toISOString(),
      })),
      ...outlineBlocks,
      ...qaFromNotes,
      ...qaCards.map((card) => ({
        id: `qa-${card.id}`,
        type: KnowledgeTimelineItemType.QA_CARD,
        videoId: video.id,
        assetId: card.assetId,
        timestampSec: card.timestamp ?? undefined,
        title: card.title || '专属 Q&A 补充',
        summary: card.summary ?? this.takeFirstNonEmptyLine(card.content) ?? undefined,
        content: card.content,
        imageUrl: card.imageUrl ?? undefined,
        metadata: {
          source: 'crystal_card',
          cardId: card.id,
          tags: card.tags ?? [],
        },
        createdAt: card.createdAt.toISOString(),
      })),
      ...flashcards.map((card) => ({
        id: `flashcard-${card.id}`,
        type: KnowledgeTimelineItemType.FLASHCARD,
        videoId: video.id,
        assetId: card.assetId,
        title: card.front,
        summary: card.chapter ?? undefined,
        content: card.back,
        metadata: {
          difficulty: card.difficulty,
          reviewCount: card.reviewCount,
          nextReview: card.nextReview ? card.nextReview.toISOString() : null,
        },
        createdAt: card.createdAt.toISOString(),
      })),
    ];

    if (flashcards.length > 0) {
      const reviewTimes = flashcards
        .map((card) => card.nextReview)
        .filter(Boolean)
        .map((date) => (date as Date).toISOString());
      timeline.push({
        id: `review-plan-${video.id}`,
        type: KnowledgeTimelineItemType.REVIEW_PLAN,
        videoId: video.id,
        assetId: asset?.id ?? null,
        title: '复习计划',
        summary: `共 ${flashcards.length} 张闪卡，按艾宾浩斯节奏安排`,
        content: reviewTimes.join('\n'),
        metadata: { reviewTimes },
        createdAt: new Date().toISOString(),
      });
    }

    timeline.sort((a, b) => {
      const ta = a.timestampSec ?? Number.POSITIVE_INFINITY;
      const tb = b.timestampSec ?? Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const state = deriveKnowledgeBoardState({
      transcriptStatus: video.transcriptStatus as any,
      keyframeStatus: video.keyframeStatus as any,
      assetStatus: (asset?.status as any) ?? null,
      syncedTo: asset?.syncedTo ?? [],
      hasTranscript: transcriptSegments.length > 0,
      hasKeyframes: keyframes.length > 0,
      hasOutline: Boolean(asset?.outlineMarkdown?.trim()),
      hasFlashcards: flashcards.length > 0,
    });

    return {
      videoId: video.id,
      projectId: video.projectId,
      state,
      timeline,
      stats: {
        transcriptSegments: transcriptSegments.length,
        keyframes: keyframes.length,
        flashcards: flashcards.length,
        qaCards: qaFromNotes.length + qaCards.length,
        outlineBlocks: outlineBlocks.length,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async getTranscript(userId: string, videoId: string) {
    await this.getOwnedVideo(userId, videoId);
    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      userId,
      videoId,
      status: transcript ? 'COMPLETED' : 'PENDING',
      transcript,
      segments: (transcript?.segments as any[]) ?? [],
    };
  }

  async getOutline(userId: string, videoId: string) {
    await this.getOwnedVideo(userId, videoId);
    const asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      userId,
      videoId,
      status: asset?.status ?? 'PENDING',
      assetId: asset?.id ?? null,
      outlineMarkdown: asset?.outlineMarkdown ?? '',
      notesMarkdown: asset?.notesMarkdown ?? '',
      syncedTo: asset?.syncedTo ?? [],
    };
  }

  async getFlashcards(userId: string, videoId: string) {
    await this.getOwnedVideo(userId, videoId);
    const asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true },
    });

    const items = asset
      ? await this.prisma.flashcard.findMany({
          where: { assetId: asset.id },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    return {
      userId,
      videoId,
      status: asset?.status ?? 'PENDING',
      assetId: asset?.id ?? null,
      items,
      count: items.length,
      flashcards: items,
    };
  }

  async regenerateOutline(userId: string, videoId: string) {
    const video = await this.getOwnedVideo(userId, videoId);

    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    if (!transcript) {
      throw new NotFoundException('请先生成转写内容');
    }

    const keyframes = await this.prisma.keyframe.findMany({
      where: { videoId },
      orderBy: { timestamp: 'asc' },
    });

    const transcriptSegments = (transcript.segments as Array<{
      start: number;
      end: number;
      text: string;
    }>) ?? [];

    const asset = await this.outlineService.buildOutline({
      userId,
      videoId,
      videoTitle: video.title,
      transcriptSegments,
      keyframes: keyframes.map((kf) => ({
        timestamp: kf.timestamp,
        storagePath: kf.storagePath,
        description: kf.description,
      })),
    });

    return {
      taskId: `outline_${Date.now()}`,
      userId,
      videoId,
      status: 'completed',
      assetId: asset.id,
      outlineMarkdown: asset.outlineMarkdown,
    };
  }

  async regenerateFlashcards(userId: string, videoId: string, dto: RegenerateFlashcardsDto = {}) {
    const video = await this.getOwnedVideo(userId, videoId);

    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    if (!transcript) {
      throw new NotFoundException('请先生成转写内容');
    }

    let asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!asset) {
      asset = await this.outlineService.buildOutline({
        userId,
        videoId,
        videoTitle: video.title,
        transcriptSegments: (transcript.segments as Array<{ start: number; end: number; text: string }>) ?? [],
        keyframes: [],
      });
    }

    const transcriptSegments = (transcript.segments as Array<{
      start: number;
      end: number;
      text: string;
    }>) ?? [];

    const cards = await this.flashcardService.generateFlashcards({
      assetId: asset.id,
      transcriptSegments,
      userId,
      videoTitle: video.title,
      outlineMarkdown: asset.outlineMarkdown ?? '',
      maxCards: dto.maxCards ?? 12,
    });

    return {
      taskId: `flashcards_${Date.now()}`,
      userId,
      videoId,
      status: 'completed',
      count: cards.length,
      items: cards,
    };
  }

  async export(userId: string, videoId: string, dto: ExportKnowledgeDto) {
    const target = (dto.target ?? 'markdown') as 'markdown' | 'notion' | 'feishu';
    const syncTargets = this.resolveSyncTargets(target, dto.syncTargets);
    return this.settle(userId, videoId, {
      syncTargets,
      forceRegenerate: dto.forceRegenerate,
    });
  }

  async settle(userId: string, videoId: string, dto: SettleKnowledgeDto = {}) {
    const video = await this.getOwnedVideo(userId, videoId);
    const taskId = `knowledge_settle_${Date.now()}`;
    const syncTargets = this.resolveSyncTargets('markdown', dto.syncTargets);
    const isSyncing = syncTargets.length > 0;

    this.emitKnowledgeState(video.projectId, {
      taskId,
      videoId: video.id,
      state: isSyncing ? KnowledgeBoardState.SYNCING : KnowledgeBoardState.READY,
      message: isSyncing ? '一键结算中，正在同步外部平台' : '一键结算中',
      timestamp: new Date().toISOString(),
    });
    this.wsGateway.emitTaskProgress(userId, {
      projectId: video.projectId,
      videoId: video.id,
      task: 'knowledge_settle',
      progress: 15,
      message: '正在生成结算产物',
      timestamp: new Date().toISOString(),
    });

    const result = await this.exportService.settleKnowledgePackage({
      userId,
      videoId: video.id,
      videoTitle: video.title,
      forceRegenerate: dto.forceRegenerate ?? false,
      syncTargets,
    });

    this.wsGateway.emitTaskProgress(userId, {
      projectId: video.projectId,
      videoId: video.id,
      task: 'knowledge_settle',
      progress: 100,
      message: '结算产物已完成',
      timestamp: new Date().toISOString(),
    });
    this.wsGateway.emitTaskComplete(userId, {
      projectId: video.projectId,
      task: 'knowledge_settle',
      result: {
        videoId: video.id,
        taskId,
        syncedTargets: result.syncedTargets,
      },
      timestamp: new Date().toISOString(),
    });
    this.emitKnowledgeState(video.projectId, {
      taskId,
      videoId: video.id,
      state: result.syncedTargets.length > 0 ? KnowledgeBoardState.SYNCED : KnowledgeBoardState.READY,
      message:
        result.syncedTargets.length > 0
          ? `结算完成，已同步 ${result.syncedTargets.join(', ')}`
          : '结算完成，可继续同步到 Notion/飞书',
      timestamp: new Date().toISOString(),
    });

    return {
      taskId,
      userId,
      videoId,
      status: 'completed',
      boardState: result.syncedTargets.length > 0 ? KnowledgeBoardState.SYNCED : KnowledgeBoardState.READY,
      output: result.output,
      sync: result.sync,
      syncedTargets: result.syncedTargets,
    };
  }

  async injectQaCard(params: {
    userId: string;
    videoId: string;
    question: string;
    answer: string;
    metadata?: Record<string, unknown> | null;
  }) {
    const { userId, videoId, question, answer, metadata } = params;
    await this.getOwnedVideo(userId, videoId);

    let asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!asset) {
      asset = await this.prisma.knowledgeAsset.create({
        data: {
          videoId,
          outlineMarkdown: '# 知识大纲\n\n（待生成）',
          notesMarkdown: '',
          status: 'PROCESSING',
        },
      });
    }

    const ts = new Date().toISOString();
    const metaLine = metadata ? `\n- metadata: \`${JSON.stringify(metadata)}\`` : '';
    const block = [
      `### Q&A 补充 (${ts})`,
      '',
      `- Q: ${question}`,
      `- A: ${answer}`,
      metaLine,
      '',
    ].join('\n');

    const updated = await this.prisma.knowledgeAsset.update({
      where: { id: asset.id },
      data: {
        notesMarkdown: `${asset.notesMarkdown ?? ''}\n${block}`.trim(),
      },
    });

    const timestampSec =
      typeof metadata?.timestampSec === 'number'
        ? Number(metadata.timestampSec)
        : undefined;
    const qaCard = await this.prisma.crystalCard.create({
      data: {
        assetId: updated.id,
        type: CrystalCardType.QA,
        title: '专属 Q&A 补充',
        content: `Q: ${question}\nA: ${answer}`,
        summary: answer.slice(0, 160),
        timestamp: timestampSec ?? null,
        videoTime: timestampSec != null ? this.formatTimestamp(timestampSec) : null,
        sourceText: question,
        sourceType: 'chat',
        tags: ['qa', 'chat'],
        difficulty: 2,
        importance: 3,
        orderIndex: 0,
        category: 'Q&A',
        metadata: (metadata ?? null) as any,
      },
    });

    const video = await this.getOwnedVideo(userId, videoId);
    this.emitKnowledgeTimelineItem(video.projectId, {
      projectId: video.projectId,
      videoId: video.id,
      item: {
        id: `qa-${qaCard.id}`,
        type: KnowledgeTimelineItemType.QA_CARD,
        title: qaCard.title,
        summary: qaCard.summary ?? undefined,
        content: qaCard.content,
        timestampSec: qaCard.timestamp ?? undefined,
        metadata: {
          source: 'chat',
          question,
        },
        createdAt: qaCard.createdAt.toISOString(),
      },
      timestamp: new Date().toISOString(),
    });

    return {
      assetId: updated.id,
      videoId,
      injectedAt: ts,
    };
  }

  /**
   * 生成思维导图
   */
  async generateMindmap(userId: string, videoId: string, dto: GenerateMindmapDto) {
    const video = await this.getOwnedVideo(userId, videoId);
    const sessionId = dto.sessionId ?? null;

    // 获取转写内容
    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    if (!transcript) {
      throw new NotFoundException('请先生成转写内容');
    }

    const transcriptSegments = (transcript.segments as Array<{
      start: number;
      end: number;
      text: string;
    }>) ?? [];

    // 获取关键帧
    const keyframes = await this.prisma.keyframe.findMany({
      where: { videoId },
      orderBy: { timestamp: 'asc' },
      take: 20,
    });

    let result;

    if (sessionId && dto.prompt) {
      // 从对话生成思维导图
      result = await this.mindmapService.generateMindmapFromChat({
        userId,
        videoId: video.id,
        sessionId,
        prompt: dto.prompt,
      });
    } else {
      // 从视频内容生成思维导图
      result = await this.mindmapService.generateMindmap({
        userId,
        videoId: video.id,
        videoTitle: video.title,
        transcriptSegments,
        keyframes: keyframes.map((kf) => ({
          timestamp: kf.timestamp,
          storagePath: kf.storagePath,
          description: kf.description,
        })),
        maxDepth: dto.maxDepth ?? 5,
        maxNodes: dto.maxNodes ?? 90,
      });
    }

    return {
      taskId: `mindmap_${Date.now()}`,
      userId,
      videoId,
      status: 'completed',
      result: {
        nodeCount: result.nodeCount,
        json: result.json,
        markdown: result.markdown,
        mermaid: result.mermaid,
      },
    };
  }

  /**
   * 获取思维导图
   */
  async getMindmap(userId: string, videoId: string) {
    await this.getOwnedVideo(userId, videoId);
    const mindmap = await this.mindmapService.getMindmap(videoId);

    return {
      userId,
      videoId,
      status: mindmap ? 'COMPLETED' : 'PENDING',
      mindmap,
    };
  }

  /**
   * 导出思维导图
   */
  async exportMindmap(userId: string, videoId: string, format: 'json' | 'markdown' | 'mermaid' | 'xmind' | 'freemind') {
    await this.getOwnedVideo(userId, videoId);

    const content = await this.mindmapService.exportMindmap({
      videoId,
      format,
    });

    return {
      videoId,
      format,
      content,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * 获取晶体卡片列表
   */
  async getCrystalCards(userId: string, videoId: string, type?: string) {
    await this.getOwnedVideo(userId, videoId);
    const asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true },
    });

    if (!asset) {
      return {
        userId,
        videoId,
        status: 'PENDING',
        assetId: null,
        cards: [],
        count: 0,
        byType: {},
      };
    }

    return this.crystalCardService.getCrystalCards(asset.id, type ? { type: type as any } : {});
  }

  /**
   * 获取精选晶体卡片
   */
  async getFeaturedCrystalCards(userId: string, videoId: string) {
    await this.getOwnedVideo(userId, videoId);
    const asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    if (!asset) {
      return {
        userId,
        videoId,
        cards: [],
        count: 0,
      };
    }

    const cards = await this.crystalCardService.getFeaturedCards(asset.id);

    return {
      userId,
      videoId,
      cards,
      count: cards.length,
    };
  }

  /**
   * 获取单个晶体卡片
   */
  async getCrystalCard(userId: string, cardId: string) {
    const card = await this.prisma.crystalCard.findUnique({
      where: { id: cardId },
      include: { asset: true },
    });

    if (!card) {
      throw new NotFoundException('晶体卡片不存在');
    }

    // 验证权限
    await this.getOwnedVideo(userId, card.asset.videoId);

    return {
      userId,
      card,
    };
  }

  /**
   * 更新晶体卡片
   */
  async updateCrystalCard(userId: string, cardId: string, updates: any) {
    const card = await this.prisma.crystalCard.findUnique({
      where: { id: cardId },
      include: { asset: true },
    });

    if (!card) {
      throw new NotFoundException('晶体卡片不存在');
    }

    // 验证权限
    await this.getOwnedVideo(userId, card.asset.videoId);

    const updated = await this.crystalCardService.updateCrystalCard(cardId, updates);

    return {
      userId,
      card: updated,
    };
  }

  /**
   * 删除晶体卡片
   */
  async deleteCrystalCard(userId: string, cardId: string) {
    const card = await this.prisma.crystalCard.findUnique({
      where: { id: cardId },
      include: { asset: true },
    });

    if (!card) {
      throw new NotFoundException('晶体卡片不存在');
    }

    // 验证权限
    await this.getOwnedVideo(userId, card.asset.videoId);

    await this.crystalCardService.deleteCrystalCard(cardId);

    return {
      userId,
      success: true,
      cardId,
    };
  }

  /**
   * 重新生成晶体卡片
   */
  async regenerateCrystalCards(userId: string, videoId: string, options: any = {}) {
    const video = await this.getOwnedVideo(userId, videoId);

    // 获取转写内容
    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    if (!transcript) {
      throw new NotFoundException('请先生成转写内容');
    }

    // 获取关键帧
    const keyframes = await this.prisma.keyframe.findMany({
      where: { videoId },
      orderBy: { timestamp: 'asc' },
    });

    // 获取或创建知识资产
    let asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!asset) {
      asset = await this.prisma.knowledgeAsset.create({
        data: {
          videoId,
          outlineMarkdown: '# 知识大纲\n\n（待生成）',
          status: 'PROCESSING',
        },
      });
    }

    const transcriptSegments = (transcript.segments as Array<{
      start: number;
      end: number;
      text: string;
    }>) ?? [];

    const result = await this.crystalCardService.generateCrystalCards(
      {
        userId,
        assetId: asset.id,
        videoTitle: video.title,
        transcriptSegments,
        keyframes: keyframes.map((kf) => ({
          timestamp: kf.timestamp,
          storagePath: kf.storagePath,
          description: kf.description ?? undefined,
        })),
        outlineMarkdown: asset.outlineMarkdown ?? undefined,
      },
      options,
    );

    return {
      taskId: `crystal_cards_${Date.now()}`,
      userId,
      videoId,
      status: 'completed',
      result,
    };
  }

  private async getOwnedVideo(userId: string, videoId: string) {
    const video = await this.prisma.videoSource.findFirst({
      where: { id: videoId, project: { userId } },
      select: {
        id: true,
        projectId: true,
        title: true,
        sourceType: true,
        sourceUrl: true,
        storagePath: true,
        duration: true,
        thumbnailUrl: true,
        transcriptStatus: true,
        keyframeStatus: true,
      },
    });

    if (!video) {
      throw new NotFoundException('视频不存在或无访问权限');
    }

    return video;
  }

  private async ensureProcessingAsset(videoId: string) {
    const existing = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      return this.prisma.knowledgeAsset.update({
        where: { id: existing.id },
        data: {
          status: TaskStatus.PROCESSING,
        },
      });
    }

    return this.prisma.knowledgeAsset.create({
      data: {
        videoId,
        outlineMarkdown: '',
        notesMarkdown: '',
        status: TaskStatus.PROCESSING,
      },
    });
  }

  private emitKnowledgeState(
    projectId: string,
    payload: {
      taskId?: string;
      videoId: string;
      state: KnowledgeBoardState;
      message?: string;
      stats?: Record<string, unknown>;
      timestamp: string;
    },
  ) {
    this.wsGateway.emitKnowledgeState(projectId, {
      projectId,
      videoId: payload.videoId,
      taskId: payload.taskId,
      state: payload.state,
      message: payload.message,
      stats: payload.stats,
      timestamp: payload.timestamp,
    });
  }

  private emitKnowledgeTimelineItem(
    projectId: string,
    payload: {
      projectId: string;
      videoId: string;
      taskId?: string;
      item: {
        id: string;
        type: KnowledgeTimelineItemType;
        timestampSec?: number;
        title: string;
        summary?: string;
        content?: string;
        imageUrl?: string;
        metadata?: Record<string, unknown>;
        createdAt: string;
      };
      timestamp: string;
    },
  ) {
    this.wsGateway.emitKnowledgeTimeline(projectId, payload);
  }

  private extractOutlineBlocks(
    markdown: string,
    videoId: string,
    assetId: string | null,
  ): KnowledgeTimelineItem[] {
    if (!markdown?.trim()) return [];
    const lines = markdown.split('\n');
    const blocks: KnowledgeTimelineItem[] = [];
    let currentTitle = '';
    let bucket: string[] = [];

    const flush = () => {
      if (!currentTitle) return;
      const text = bucket.join('\n').trim();
      blocks.push({
        id: `outline-${videoId}-${blocks.length + 1}`,
        type: KnowledgeTimelineItemType.OUTLINE_BLOCK,
        videoId,
        assetId,
        timestampSec: parseTimestampToSeconds(text) ?? parseTimestampToSeconds(currentTitle),
        title: currentTitle,
        summary: this.takeFirstNonEmptyLine(text) ?? undefined,
        content: text,
        createdAt: new Date().toISOString(),
      });
    };

    for (const line of lines) {
      if (/^#{1,3}\s+/.test(line.trim())) {
        if (currentTitle) flush();
        currentTitle = line.replace(/^#{1,3}\s+/, '').trim();
        bucket = [];
      } else {
        bucket.push(line);
      }
    }
    if (currentTitle) flush();
    return blocks.slice(0, 40);
  }

  private extractQaCardsFromNotes(
    notesMarkdown: string,
    videoId: string,
    assetId: string | null,
  ): KnowledgeTimelineItem[] {
    if (!notesMarkdown?.trim()) return [];
    const cards: KnowledgeTimelineItem[] = [];
    const chunks = notesMarkdown.split(/\n(?=###\s+Q&A)/g);
    for (const chunk of chunks) {
      if (!chunk.includes('Q&A')) continue;
      const q = chunk.match(/- Q:\s*(.+)/)?.[1]?.trim() ?? '';
      const a = chunk.match(/- A:\s*([\s\S]+?)(?:\n-\smetadata:|$)/)?.[1]?.trim() ?? '';
      if (!q && !a) continue;
      const timestampSec = parseTimestampToSeconds(chunk);
      cards.push({
        id: `qa-note-${videoId}-${cards.length + 1}`,
        type: KnowledgeTimelineItemType.QA_CARD,
        videoId,
        assetId,
        timestampSec,
        title: '专属 Q&A 补充',
        summary: q,
        content: a,
        createdAt: new Date().toISOString(),
      });
    }
    return cards;
  }

  private formatTimestamp(seconds: number) {
    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private takeFirstNonEmptyLine(text?: string | null) {
    if (!text) return null;
    return (
      text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? null
    );
  }

  private resolveSyncTargets(
    target: 'markdown' | 'notion' | 'feishu',
    extraTargets?: Array<'notion' | 'feishu'>,
  ) {
    const targets = new Set<'notion' | 'feishu'>(extraTargets ?? []);
    if (target === 'notion' || target === 'feishu') {
      targets.add(target);
    }
    return Array.from(targets);
  }
}
