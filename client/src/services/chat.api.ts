import { apiFetch } from './api';

export type ChatPrismType = 'knowledge' | 'creation' | 'translation' | 'diffraction';

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

export const chatApi = {
  createSession: (payload: CreateChatSessionPayload) =>
    apiFetch('/api/chat/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMessages: (sessionId: string, params?: { limit?: number; before?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.before) query.set('before', params.before);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiFetch(`/api/chat/sessions/${sessionId}/messages${suffix}`);
  },

  sendMessage: (sessionId: string, payload: SendChatMessagePayload) =>
    apiFetch(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
