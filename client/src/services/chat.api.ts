import { apiFetch } from './api';

export const chatApi = {
  send: (sessionId: string, content: string) =>
    apiFetch('/api/chat/send', { method: 'POST', body: JSON.stringify({ sessionId, content }) }),
  getMessages: (sessionId: string) => apiFetch(`/api/chat/sessions/${sessionId}/messages`),
};
