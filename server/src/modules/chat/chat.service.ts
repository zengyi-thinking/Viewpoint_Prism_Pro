import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageRole as DbMessageRole, PrismType as DbPrismType } from '../../../generated/prisma/enums';
import { WsGateway } from '../../infrastructure/websocket/ws.gateway';
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
  ) {}

  async createSession(userId: string, dto: CreateChatSessionDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, userId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('工程不存在或无访问权限');
    }

    const session = await this.prisma.chatSession.create({
      data: {
        userId,
        projectId: dto.projectId,
        videoId: dto.videoId ?? null,
        activePrism: this.mapPrismToDb(dto.activePrism),
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

    const resolvedPrism =
      dto.activePrism ?? this.mapPrismFromDb(session.activePrism);
    const resolvedVideoId = dto.videoId ?? session.videoId ?? null;

    const sessionUpdateData: { activePrism?: DbPrismType; videoId?: string | null } = {};
    if (dto.activePrism !== undefined) {
      sessionUpdateData.activePrism = this.mapPrismToDb(dto.activePrism);
    }
    if (dto.videoId !== undefined) {
      sessionUpdateData.videoId = dto.videoId ?? null;
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
        metadata: dto.metadata as any,
      },
    });

    const prismAction = this.inferPrismAction(resolvedPrism, dto.content);
    const prismPayload = this.buildPrismPayload(
      prismAction,
      dto.content,
      resolvedVideoId,
      dto.metadata,
    );

    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId,
        role: DbMessageRole.ASSISTANT,
        content: this.buildAssistantAck(prismAction, resolvedPrism),
        prismAction:
          prismAction === PrismActionType.NONE ? null : prismAction,
        prismPayload: prismPayload as any,
      },
    });

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
    const normalized = content.trim().toLowerCase();

    if (normalized.startsWith('/summarize')) {
      return PrismActionType.GENERATE_SUMMARY;
    }

    if (normalized.startsWith('/mindmap')) {
      return PrismActionType.GENERATE_MINDMAP;
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
}
