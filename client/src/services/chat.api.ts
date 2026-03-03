import { apiFetch } from './api';
import type { ChatMessage, ChatSession, PrismActionType } from '@/types/chat';

export type ChatPrismType = 'knowledge' | 'creation' | 'translation' | 'diffraction';

export interface QuickPrompt {
  id: string;
  type: string;
  label: string;
  icon: string;
  promptTemplate: string;
}

export interface CreateChatSessionPayload {
  projectId: string;
  videoId?: string;
  activePrism?: ChatPrismType;
}

export interface SendChatMessagePayload {
  content: string;
  videoId?: string;
  activePrism?: ChatPrismType;
  metadata?: Record<string, unknown>;
}

export interface CreateChatSessionResponse {
  session: ChatSession;
}

export interface GetChatMessagesResponse {
  session: ChatSession;
  items: ChatMessage[];
  pagination: {
    limit: number;
    before: string | null;
    hasMore: boolean;
  };
}

export interface SendChatMessageResponse {
  session: ChatSession;
  message: ChatMessage;
  reply: ChatMessage;
  prismAction: PrismActionType;
  prismPayload: Record<string, unknown> | null;
  status: 'completed';
}

export interface GetQuickPromptsResponse {
  prompts: QuickPrompt[];
}

export const chatApi = {
  createSession: (payload: CreateChatSessionPayload) =>
    apiFetch<CreateChatSessionResponse>('/api/chat/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMessages: (sessionId: string, params?: { limit?: number; before?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.before) query.set('before', params.before);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiFetch<GetChatMessagesResponse>(
      `/api/chat/sessions/${sessionId}/messages${suffix}`,
    );
  },

  sendMessage: (sessionId: string, payload: SendChatMessagePayload) =>
    apiFetch<SendChatMessageResponse>(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getQuickPrompts: (prism?: ChatPrismType) =>
    apiFetch<GetQuickPromptsResponse>(
      `/api/chat/quick-prompts${prism ? `?prism=${encodeURIComponent(prism)}` : ''}`,
    ),
};
