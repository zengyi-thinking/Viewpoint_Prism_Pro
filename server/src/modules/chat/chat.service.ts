import { Injectable } from '@nestjs/common';
import { CreateChatSessionDto, GetChatMessagesQueryDto, SendChatMessageDto } from './dto';

@Injectable()
export class ChatService {
  async createSession(userId: string, dto: CreateChatSessionDto) {
    // TODO: persist session in DB
    return {
      sessionId: `session_${Date.now()}`,
      projectId: dto.projectId,
      userId,
      videoId: dto.videoId ?? null,
      activePrism: dto.activePrism ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  async getMessages(
    userId: string,
    sessionId: string,
    query: GetChatMessagesQueryDto,
  ) {
    // TODO: read messages from DB by session + user
    return {
      sessionId,
      userId,
      items: [],
      pagination: {
        limit: query.limit ?? 50,
        before: query.before ?? null,
        hasMore: false,
      },
    };
  }

  async sendMessage(
    userId: string,
    sessionId: string,
    dto: SendChatMessageDto,
  ) {
    // TODO: route prompt to AI Router and inject prismAction
    return {
      sessionId,
      userId,
      message: {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: dto.content,
        metadata: dto.metadata ?? null,
        activePrism: dto.activePrism ?? null,
        videoId: dto.videoId ?? null,
        createdAt: new Date().toISOString(),
      },
      reply: null,
      prismAction: null,
      status: 'queued',
    };
  }
}
