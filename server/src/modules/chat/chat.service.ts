import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { FrameAnalysisService } from './services/frame-analysis.service';

type ChatRole = 'user' | 'assistant' | 'system';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
    private readonly knowledgeService: KnowledgeService,
    private readonly videoBehaviorService: VideoBehaviorService,
    private readonly aiRouter: AiRouterService,
    private readonly frameAnalysisService: FrameAnalysisService,
  ) {}

  async createSession(userId: string, dto: CreateChatSessionDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, userId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('工程不存在或无访问权限');
    }

    const resolvedPrism =
      dto.activePrism ?? (dto.videoId ? ChatPrismType.KNOWLEDGE : undefined);

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
    const requestedPrism =
      dto.activePrism ?? this.mapPrismFromDb(session.activePrism) ?? null;
    // 默认策略：仅在未显式指定棱镜但绑定视频时，回退到知识棱镜。
    const resolvedPrism =
      requestedPrism ?? (resolvedVideoId ? ChatPrismType.KNOWLEDGE : null);

    const sessionUpdateData: { activePrism?: DbPrismType; videoId?: string | null } = {};
    if (resolvedPrism) {
      sessionUpdateData.activePrism = this.mapPrismToDb(resolvedPrism);
    }
    if (dto.videoId !== undefined || session.videoId !== resolvedVideoId) {
      sessionUpdateData.videoId = resolvedVideoId;
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

    // 检查是否需要画面分析
    const metadata = dto.metadata || {};
    const frameBase64 = metadata.frameBase64 as string | undefined;
    const timestamp = (metadata.timestamp as number | undefined) ?? 0;
    const regionClicks = metadata.regionClicks as Array<{ x: number; y: number; timestamp: number }> | undefined;
    const needsFrameAnalysis =
      frameBase64 && resolvedVideoId && resolvedPrism === ChatPrismType.KNOWLEDGE;

    // 创建用户消息
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

    // 推送用户消息
    this.wsGateway.emitChatMessage(updatedSession.projectId, {
      projectId: updatedSession.projectId,
      sessionId,
      role: 'user',
      content: userMessage.content,
      metadata: userMessage.metadata,
      timestamp: userMessage.createdAt.toISOString(),
    });

    // 画面分析处理
    let frameAnalysisContext: string | null = null;
    let frameImage: string | null = null;

    if (needsFrameAnalysis && resolvedVideoId) {
      try {
        // 分析当前帧
        const frameAnalysis = await this.frameAnalysisService.analyzeFrame({
          userId,
          videoId: resolvedVideoId,
          timestamp: timestamp || 0,
          frameBase64: frameBase64 as string,
        });

        frameAnalysisContext = `[${Math.round(frameAnalysis.timestamp)}秒]: ${frameAnalysis.description}`;
        frameImage = frameAnalysis.imageUrl || frameBase64 as string;

        // 推送帧分析结果（用于前端显示图片）
        this.wsGateway.emitFrameAnalysis(updatedSession.projectId, {
          sessionId,
          imageUrl: frameImage,
          timestamp: frameAnalysis.timestamp,
          description: frameAnalysis.description,
          detectedObjects: frameAnalysis.detectedObjects,
        });

        // 处理区域点击分析
        if (regionClicks && Array.isArray(regionClicks) && regionClicks.length >= 3) {
          const regionAnalysis = await this.frameAnalysisService.analyzeRegionClicks(
            userId,
            resolvedVideoId,
            regionClicks as any,
            frameBase64 as string,
          );

          // 推送区域分析结果
          this.wsGateway.emitFrameRegionAnalysis(updatedSession.projectId, {
            sessionId,
            analysis: regionAnalysis,
          });
        }
      } catch (error) {
        // 不阻断主对话链路，继续使用 transcript/knowledge 进行回答
        this.wsGateway.emitToProject(updatedSession.projectId, 'chat:error', {
          sessionId,
          type: 'frame_analysis',
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
      }
    }

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
            frameAnalysisContext,
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
        await this.knowledgeService.analyze(userId, resolvedVideoId, {});
        await this.knowledgeService.regenerateCrystalCards(userId, resolvedVideoId, {
          types: ['CONCEPT', 'TIMELINE', 'INSIGHT', 'SUMMARY'],
          maxCards: 12,
          includeKeyframes: true,
          difficulty: 2,
        });
      }
    }

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

    // Knowledge-only intents: avoid overlap with creation/translation/diffraction.
    if (prism === ChatPrismType.KNOWLEDGE) {
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

  private async buildAssistantReplyFromModel(
    userId: string,
    sessionId: string,
    prism: ChatPrismType | null,
    videoId: string | null,
    userContent: string,
    action: PrismActionType,
    ignoreHistory = false,
    frameAnalysisContext: string | null = null,
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
      // 如果没有传统分析结果，但有画面分析上下文，仍然可以回答
      if (!hasTranscript && !hasKnowledgeAsset && !hasQa && !frameAnalysisContext) {
        return '当前视频还没有可用的分析结果。请先点击”确认分析”，等待分析完成后再提问。';
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
        frameAnalysisContext,
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

      const text = this.extractLlmText(llm);
      if (!text) {
        const provider = String(llm?.provider ?? 'unknown');
        const model = String(llm?.model ?? 'unknown');
        throw new Error(`聊天模型未返回内容(provider=${provider}, model=${model})`);
      }
      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`模型调用失败: ${message}`);
    }
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
    frameAnalysisContext: string | null = null,
  ) {
    const base =
      '你是 Viewpoint Prism Pro 的工作台助手。回答必须简洁、可执行，优先给结构化结论。';

    if (prism === ChatPrismType.KNOWLEDGE) {
      return [
        base,
        '当前处于知识棱镜，帮助用户深度理解和学习视频内容。',
        '',
        '## 上下文信息',
        transcriptContext ? `**视频转写片段**:\n${transcriptContext.slice(0, 800)}` : '',
        knowledgeAssetContext ? `**知识资产摘要**:\n${knowledgeAssetContext.slice(0, 600)}` : '',
        qaContext ? `**历史Q&A补充**:\n${qaContext.slice(0, 400)}` : '',
        frameAnalysisContext ? `**画面分析**:\n${frameAnalysisContext}` : '',
        userProfileContext ? `**用户画像**:\n${userProfileContext}` : '',
        behaviorContext ? `**用户观看行为线索**:\n${behaviorContext}` : '',
        '',
        '## 回答要求',
        '1. 基于提供的上下文信息，给出具体、有见地的回答',
        '2. 如果有画面分析，优先引用视觉证据进行解释',
        '3. 优先使用视频中的实际内容，避免泛泛而谈',
        '4. 回答结构清晰，使用列表、分段等方式提高可读性',
        '5. 避免模板化语言，如"根据视频内容"、"一般来说"等套话',
        '6. 如果引用时间点，使用格式 "[时间:ss]"',
        '',
        `## 当前动作\n${action}`,
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
