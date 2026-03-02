import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CrystalCardType as DbCrystalCardType,
  MessageRole as DbMessageRole,
  PrismType as DbPrismType,
} from '../../../generated/prisma/enums';
import { AITaskType } from '../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../infrastructure/ai-router/ai-router.service';
import { WsGateway } from '../../infrastructure/websocket/ws.gateway';
import { VideoBehaviorService } from '../video-behavior/video-behavior.service';
import { KnowledgeService } from '../prism-knowledge/knowledge.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ChatPrismType,
  CreateChatSessionDto,
  GetChatMessagesQueryDto,
  PrismActionType,
  SendChatMessageDto,
} from './dto';

type ChatRole = 'user' | 'assistant' | 'system';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
    private readonly knowledgeService: KnowledgeService,
    private readonly videoBehaviorService: VideoBehaviorService,
    private readonly aiRouter: AiRouterService,
  ) {}

  async createSession(userId: string, dto: CreateChatSessionDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, userId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('工程不存在或无访问权限');
    }

    const resolvedPrism = dto.videoId
      ? ChatPrismType.KNOWLEDGE
      : dto.activePrism;

    const session = await this.prisma.chatSession.create({
      data: {
        userId,
        projectId: dto.projectId,
        videoId: dto.videoId ?? null,
        activePrism: this.mapPrismToDb(resolvedPrism),
      },
      select: {
        id: true,
        projectId: true,
        userId: true,
        videoId: true,
        activePrism: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      session: this.toSessionDto(session),
    };
  }

  async getMessages(
    userId: string,
    sessionId: string,
    query: GetChatMessagesQueryDto,
  ) {
    const session = await this.ensureSessionOwnership(userId, sessionId);

    const take = query.limit ?? 50;
    const rows = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.before
        ? {
            cursor: { id: query.before },
            skip: 1,
          }
        : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return {
      session: this.toSessionDto(session),
      items: page.reverse().map((item) => this.toMessageDto(item)),
      pagination: {
        limit: take,
        before: query.before ?? null,
        hasMore,
      },
    };
  }

  async sendMessage(
    userId: string,
    sessionId: string,
    dto: SendChatMessageDto,
  ) {
    const session = await this.ensureSessionOwnership(userId, sessionId);

    const resolvedVideoId = dto.videoId ?? session.videoId ?? null;
    const hasVideoSwitched = resolvedVideoId !== (session.videoId ?? null);
    // 强制绑定：只要会话绑定了视频，就固定使用知识棱镜上下文。
    const resolvedPrism = resolvedVideoId
      ? ChatPrismType.KNOWLEDGE
      : dto.activePrism ?? this.mapPrismFromDb(session.activePrism) ?? null;

    const sessionUpdateData: { activePrism?: DbPrismType; videoId?: string | null } = {};
    if (resolvedVideoId) {
      sessionUpdateData.activePrism = this.mapPrismToDb(ChatPrismType.KNOWLEDGE);
      if (session.videoId !== resolvedVideoId) {
        sessionUpdateData.videoId = resolvedVideoId;
      }
    } else {
      if (dto.activePrism !== undefined) {
        sessionUpdateData.activePrism = this.mapPrismToDb(dto.activePrism);
      }
      if (dto.videoId !== undefined) {
        sessionUpdateData.videoId = dto.videoId ?? null;
      }
    }

    const updatedSession =
      Object.keys(sessionUpdateData).length > 0
        ? await this.prisma.chatSession.update({
            where: { id: sessionId },
            data: sessionUpdateData,
            select: {
              id: true,
              projectId: true,
              userId: true,
              videoId: true,
              activePrism: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : session;

    const userMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId,
        role: DbMessageRole.USER,
        content: dto.content,
        metadata: {
          ...(dto.metadata ?? {}),
          videoId: resolvedVideoId,
        } as any,
      },
    });

    const prismAction = this.inferPrismAction(resolvedPrism, dto.content);
    const prismPayload = this.buildPrismPayload(
      prismAction,
      dto.content,
      resolvedVideoId,
      dto.metadata,
    );

    const requiresVideoForAction =
      prismAction === PrismActionType.GENERATE_SUMMARY ||
      prismAction === PrismActionType.GENERATE_MINDMAP;

    const assistantContent =
      requiresVideoForAction && !resolvedVideoId
        ? '要基于视频生成总结或思维导图，请先在左侧点击一个视频进行绑定。'
        : await this.buildAssistantReplyFromModel(
            userId,
            sessionId,
            resolvedPrism,
            resolvedVideoId,
            dto.content,
            prismAction,
            hasVideoSwitched,
          );

    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId,
        role: DbMessageRole.ASSISTANT,
        content: assistantContent,
        prismAction:
          prismAction === PrismActionType.NONE ? null : prismAction,
        prismPayload: prismPayload as any,
      },
    });

    // 处理知识棱镜动作
    if (resolvedPrism === ChatPrismType.KNOWLEDGE && resolvedVideoId) {
      if (prismAction === PrismActionType.INJECT_QA_CARD) {
        await this.knowledgeService.injectQaCard({
          userId,
          videoId: resolvedVideoId,
          question: dto.content,
          answer: assistantMessage.content,
          metadata: dto.metadata ?? null,
        });
      }

      if (prismAction === PrismActionType.GENERATE_MINDMAP) {
        const prompt = this.stripCommand(dto.content);
        await this.knowledgeService.generateMindmap(userId, resolvedVideoId, {
          sessionId,
          prompt,
          maxDepth: 5,
          maxNodes: 90,
        });
      }

      if (prismAction === PrismActionType.GENERATE_SUMMARY) {
        try {
          await this.knowledgeService.analyze(userId, resolvedVideoId, {});
        } catch {
          // Ignore re-analyze errors and continue to card generation attempt.
        }

        try {
          await this.knowledgeService.regenerateCrystalCards(userId, resolvedVideoId, {
            types: ['CONCEPT', 'TIMELINE', 'INSIGHT', 'SUMMARY'],
            maxCards: 12,
            includeKeyframes: true,
            difficulty: 2,
          });
        } catch {
          // Keep chat flow responsive even when card generation fails.
        }
      }
    }

    this.wsGateway.emitChatMessage(updatedSession.projectId, {
      projectId: updatedSession.projectId,
      sessionId,
      role: 'user',
      content: userMessage.content,
      metadata: userMessage.metadata,
      timestamp: userMessage.createdAt.toISOString(),
    });

    this.wsGateway.emitChatMessage(updatedSession.projectId, {
      projectId: updatedSession.projectId,
      sessionId,
      role: 'assistant',
      content: assistantMessage.content,
      metadata: {
        prismAction:
          prismAction === PrismActionType.NONE ? null : prismAction,
        prismPayload,
      },
      timestamp: assistantMessage.createdAt.toISOString(),
    });

    if (resolvedPrism && prismAction !== PrismActionType.NONE) {
      this.wsGateway.emitPrismAction(updatedSession.projectId, {
        projectId: updatedSession.projectId,
        prismType: resolvedPrism,
        action: prismAction,
        payload: prismPayload,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      session: this.toSessionDto(updatedSession),
      message: this.toMessageDto(userMessage),
      reply: this.toMessageDto(assistantMessage),
      prismAction,
      prismPayload,
      status: 'completed',
    };
  }

  private async ensureSessionOwnership(userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      select: {
        id: true,
        projectId: true,
        userId: true,
        videoId: true,
        activePrism: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!session) {
      throw new NotFoundException('会话不存在或无访问权限');
    }

    return session;
  }

  private mapPrismToDb(prism?: ChatPrismType): DbPrismType | undefined {
    if (!prism) return undefined;

    switch (prism) {
      case ChatPrismType.KNOWLEDGE:
        return DbPrismType.KNOWLEDGE;
      case ChatPrismType.CREATION:
        return DbPrismType.CREATION;
      case ChatPrismType.TRANSLATION:
        return DbPrismType.TRANSLATION;
      case ChatPrismType.DIFFRACTION:
        return DbPrismType.DIFFRACTION;
      default:
        return undefined;
    }
  }

  private mapPrismFromDb(prism?: DbPrismType | null): ChatPrismType | null {
    if (!prism) return null;

    switch (prism) {
      case DbPrismType.KNOWLEDGE:
        return ChatPrismType.KNOWLEDGE;
      case DbPrismType.CREATION:
        return ChatPrismType.CREATION;
      case DbPrismType.TRANSLATION:
        return ChatPrismType.TRANSLATION;
      case DbPrismType.DIFFRACTION:
        return ChatPrismType.DIFFRACTION;
      default:
        return null;
    }
  }

  private mapRoleFromDb(role: DbMessageRole): ChatRole {
    switch (role) {
      case DbMessageRole.USER:
        return 'user';
      case DbMessageRole.ASSISTANT:
        return 'assistant';
      case DbMessageRole.SYSTEM:
        return 'system';
      default:
        return 'assistant';
    }
  }

  private toSessionDto(session: {
    id: string;
    projectId: string;
    userId: string;
    videoId: string | null;
    activePrism: DbPrismType | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: session.id,
      projectId: session.projectId,
      userId: session.userId,
      videoId: session.videoId,
      activePrism: this.mapPrismFromDb(session.activePrism),
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private toMessageDto(message: {
    id: string;
    role: DbMessageRole;
    content: string;
    metadata: unknown;
    prismAction: string | null;
    prismPayload: unknown;
    createdAt: Date;
  }) {
    return {
      id: message.id,
      role: this.mapRoleFromDb(message.role),
      content: message.content,
      metadata: message.metadata,
      prismAction: message.prismAction,
      prismPayload: message.prismPayload,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private inferPrismAction(
    prism: ChatPrismType | null,
    content: string,
  ): PrismActionType {
    const normalized = content.trim();
    const normalizedLower = normalized.toLowerCase();

    if (normalizedLower.startsWith('/summarize')) {
      return PrismActionType.GENERATE_SUMMARY;
    }

    if (normalizedLower.startsWith('/mindmap')) {
      return PrismActionType.GENERATE_MINDMAP;
    }

    // 自然语言触发，避免用户必须输入 slash 指令。
    if (this.isMindmapIntent(normalized)) {
      return PrismActionType.GENERATE_MINDMAP;
    }

    if (this.isSummaryIntent(normalized)) {
      return PrismActionType.GENERATE_SUMMARY;
    }

    switch (prism) {
      case ChatPrismType.KNOWLEDGE:
        return PrismActionType.INJECT_QA_CARD;
      case ChatPrismType.CREATION:
        return PrismActionType.UPDATE_NODE_PROMPT;
      case ChatPrismType.TRANSLATION:
        return PrismActionType.REFINE_TRANSLATION_SEGMENT;
      case ChatPrismType.DIFFRACTION:
        return PrismActionType.REGENERATE_PLATFORM_DRAFT;
      default:
        return PrismActionType.NONE;
    }
  }

  private buildPrismPayload(
    action: PrismActionType,
    rawContent: string,
    videoId: string | null,
    metadata?: Record<string, unknown>,
  ) {
    const prompt = this.stripCommand(rawContent);
    return {
      action,
      prompt,
      rawContent,
      videoId,
      metadata: metadata ?? null,
    };
  }

  private stripCommand(content: string) {
    const text = content.trim();
    if (!text.startsWith('/')) return text;

    const parts = text.split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }

  private isMindmapIntent(content: string) {
    return /思维导图|脑图|mind\s*map|mindmap/i.test(content);
  }

  private isSummaryIntent(content: string) {
    return /总结|概括|摘要|梳理|复盘|要点|文章|章节|学习卡片|晶体卡片/i.test(
      content,
    );
  }

  private buildAssistantAck(
    action: PrismActionType,
    prism: ChatPrismType | null,
  ) {
    switch (action) {
      case PrismActionType.INJECT_QA_CARD:
        return '已收到问题，正在生成并注入知识时间轴 Q&A 卡片。';
      case PrismActionType.UPDATE_NODE_PROMPT:
        return '已收到创作指令，正在更新当前节点 Prompt。';
      case PrismActionType.REFINE_TRANSLATION_SEGMENT:
        return '已收到译制润色请求，正在更新字幕语境。';
      case PrismActionType.REGENERATE_PLATFORM_DRAFT:
        return '已收到分发改写请求，正在重生成平台文案草稿。';
      case PrismActionType.GENERATE_SUMMARY:
        return '已收到总结指令，正在整理关键内容。';
      case PrismActionType.GENERATE_MINDMAP:
        return '已收到思维导图指令，正在构建内容结构。';
      case PrismActionType.NONE:
      default:
        return prism
          ? '已收到消息，正在按当前棱镜上下文处理。'
          : '已收到消息，正在处理。';
    }
  }

  private async buildAssistantReplyFromModel(
    userId: string,
    sessionId: string,
    prism: ChatPrismType | null,
    videoId: string | null,
    userContent: string,
    action: PrismActionType,
    ignoreHistory = false,
  ) {
    let transcriptContext: string | null = null;
    let behaviorContext: string | null = null;
    let knowledgeAssetContext: string | null = null;
    let qaContext: string | null = null;
    let userProfileContext: string | null = null;

    if (prism === ChatPrismType.KNOWLEDGE && videoId) {
      [transcriptContext, behaviorContext, knowledgeAssetContext, qaContext, userProfileContext] = await Promise.all([
        this.getKnowledgeTranscriptContext(videoId),
        this.getBehaviorInsightContext(userId, videoId),
        this.getKnowledgeAssetContext(videoId),
        this.getKnowledgeQaContext(videoId),
        this.getUserProfileContext(userId),
      ]);

      const hasTranscript = Boolean(transcriptContext?.trim());
      const hasKnowledgeAsset = Boolean(knowledgeAssetContext?.trim());
      const hasQa = Boolean(qaContext?.trim());
      if (!hasTranscript && !hasKnowledgeAsset && !hasQa) {
        return '当前视频还没有可用的分析结果。请先点击“确认分析”，等待分析完成后再提问。';
      }
    }

    try {
      const history = ignoreHistory
        ? []
        : await this.prisma.chatMessage.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'desc' },
            take: 8,
          });

      const systemPrompt = this.buildSystemPrompt(
        prism,
        action,
        transcriptContext,
        behaviorContext,
        knowledgeAssetContext,
        qaContext,
        userProfileContext,
      );
      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...history
          .reverse()
          .map((m) => ({
            role: m.role === DbMessageRole.USER ? 'user' : 'assistant',
            content: m.content,
          })),
        { role: 'user', content: userContent },
      ];

      const llm = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          messages: chatMessages,
          temperature: 0.5,
          maxTokens: 1600,
        },
        userId,
      );

      const text = String(llm?.text ?? '').trim();
      if (text) return text;
    } catch {
      // fallback below
    }

    if (prism === ChatPrismType.KNOWLEDGE) {
      const contextualFallback = this.buildKnowledgeContextFallback(
        userContent,
        transcriptContext,
        knowledgeAssetContext,
        qaContext,
      );
      if (contextualFallback) return contextualFallback;
    }

    return this.buildAssistantAck(action, prism);
  }

  private async getKnowledgeTranscriptContext(videoId: string) {
    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
      select: { segments: true },
    });

    const segments = (transcript?.segments as Array<{ text?: string }>) ?? [];
    return segments.slice(0, 10).map((s) => s.text ?? '').join('\n');
  }

  private buildSystemPrompt(
    prism: ChatPrismType | null,
    action: PrismActionType,
    transcriptContext: string | null,
    behaviorContext: string | null,
    knowledgeAssetContext: string | null,
    qaContext: string | null,
    userProfileContext: string | null,
  ) {
    const base =
      '你是 Viewpoint Prism Pro 的工作台助手。回答必须简洁、可执行，优先给结构化结论。';

    if (prism === ChatPrismType.KNOWLEDGE) {
      return [
        base,
        '当前处于知识棱镜，请给学习者可理解的解释，并尽量对应视频上下文。',
        `当前动作: ${action}`,
        transcriptContext ? `视频转写片段:\n${transcriptContext}` : '',
        knowledgeAssetContext ? `知识资产摘要:\n${knowledgeAssetContext}` : '',
        qaContext ? `历史Q&A补充:\n${qaContext}` : '',
        userProfileContext ? `用户画像:\n${userProfileContext}` : '',
        behaviorContext ? `用户观看行为线索:\n${behaviorContext}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    }

    if (prism === ChatPrismType.CREATION) {
      return `${base}\n\n当前处于创作棱镜，请输出可直接用于节点 Prompt 的建议。`;
    }

    if (prism === ChatPrismType.TRANSLATION) {
      return `${base}\n\n当前处于译制棱镜，请优先保证语境自然和术语一致。`;
    }

    if (prism === ChatPrismType.DIFFRACTION) {
      return `${base}\n\n当前处于衍射棱镜，请按平台语境给出改写建议。`;
    }

    return base;
  }

  private async getKnowledgeAssetContext(videoId: string) {
    const [asset, keyframes] = await Promise.all([
      this.prisma.knowledgeAsset.findFirst({
        where: { videoId },
        orderBy: { updatedAt: 'desc' },
        select: { outlineMarkdown: true, notesMarkdown: true },
      }),
      this.prisma.keyframe.findMany({
        where: { videoId },
        orderBy: { timestamp: 'asc' },
        take: 5,
        select: { timestamp: true, description: true },
      }),
    ]);

    const outline = (asset?.outlineMarkdown ?? '').slice(0, 1200);
    const notes = (asset?.notesMarkdown ?? '').slice(0, 600);
    const keyframeText = keyframes
      .map((kf) => `- ${Math.round(kf.timestamp)}s: ${kf.description ?? ''}`)
      .join('\n');

    const parts = [
      outline ? `大纲:\n${outline}` : '',
      notes ? `笔记:\n${notes}` : '',
      keyframeText ? `关键帧:\n${keyframeText}` : '',
    ].filter(Boolean);

    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  private async getKnowledgeQaContext(videoId: string) {
    const qaCards = await this.prisma.crystalCard.findMany({
      where: {
        asset: { videoId },
        type: DbCrystalCardType.QA,
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        title: true,
        summary: true,
        content: true,
        timestamp: true,
        videoTime: true,
      },
    });

    if (qaCards.length === 0) return null;

    return qaCards
      .map((card, idx) => {
        const time = card.videoTime || (card.timestamp != null ? `${Math.round(card.timestamp)}s` : '');
        const summary = card.summary || this.takeFirstLine(card.content);
        return `${idx + 1}. [${time || '无时间锚点'}] ${summary}`;
      })
      .join('\n');
  }

  private async getUserProfileContext(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile: true, name: true, email: true },
    });
    if (!user) return null;

    const segments: string[] = [];
    if (user.name) segments.push(`姓名: ${user.name}`);
    if (user.email) segments.push(`邮箱: ${user.email}`);

    if (user.profile) {
      if (typeof user.profile === 'string') {
        segments.push(`画像: ${user.profile}`);
      } else {
        const profileText = JSON.stringify(user.profile);
        segments.push(`画像: ${profileText}`);
      }
    }

    return segments.length > 0 ? segments.join('\n') : null;
  }

  private buildKnowledgeContextFallback(
    userContent: string,
    transcriptContext: string | null,
    knowledgeAssetContext: string | null,
    qaContext: string | null,
  ) {
    const context =
      [knowledgeAssetContext, qaContext, transcriptContext]
        .filter(Boolean)
        .join('\n')
        .trim() || '';

    if (!context) return null;

    const preview = context.split('\n').filter(Boolean).slice(0, 8).join('\n');
    return [
      '我已基于当前视频的已分析内容整理回答。',
      `你的问题：${userContent}`,
      '',
      '相关内容摘录：',
      preview,
      '',
      '如果你要更精确，我可以继续按“时间点 + 概念”方式展开。',
    ].join('\n');
  }

  private async getBehaviorInsightContext(userId: string, videoId: string) {
    try {
      const [analytics, recentEvents] = await Promise.all([
        this.videoBehaviorService.getVideoAnalytics(userId, videoId),
        this.prisma.videoBehaviorEvent.findMany({
          where: {
            userId,
            videoId,
            eventType: { in: ['SEEK', 'PAUSE'] as any },
          },
          orderBy: { createdAt: 'desc' },
          take: 120,
          select: {
            eventType: true,
            previousTime: true,
            currentTime: true,
          },
        }),
      ]);

      const hotspotBuckets = new Map<number, number>();
      const skippedRanges: string[] = [];

      for (const evt of recentEvents) {
        if (evt.currentTime != null) {
          const bucket = Math.floor(evt.currentTime / 30) * 30;
          hotspotBuckets.set(bucket, (hotspotBuckets.get(bucket) ?? 0) + 1);
        }

        if (
          evt.eventType === 'SEEK' &&
          evt.previousTime != null &&
          evt.currentTime != null &&
          evt.currentTime - evt.previousTime > 20
        ) {
          skippedRanges.push(
            `${Math.floor(evt.previousTime)}s -> ${Math.floor(evt.currentTime)}s`,
          );
        }
      }

      const hotspots = Array.from(hotspotBuckets.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([bucket, count]) => `${bucket}-${bucket + 30}s(${count}次)`);

      const lines = [
        `观看覆盖率: ${analytics.averageCoverage.toFixed(1)}%`,
        hotspots.length ? `高频关注片段: ${hotspots.join(', ')}` : '',
        skippedRanges.length
          ? `常见跳过片段: ${skippedRanges.slice(0, 3).join(', ')}`
          : '',
      ].filter(Boolean);

      return lines.join('\n');
    } catch {
      return null;
    }
  }

  private takeFirstLine(text?: string | null) {
    if (!text) return '';
    return (
      text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? ''
    );
  }
}
