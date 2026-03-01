import { apiFetch } from './api';

export interface AnalyzeKnowledgePayload {
  regenerateTranscript?: boolean;
  regenerateKeyframes?: boolean;
}

export interface ExportKnowledgePayload {
  target?: 'markdown' | 'notion' | 'feishu';
}

export const knowledgeApi = {
  analyze: (videoId: string, payload: AnalyzeKnowledgePayload = {}) =>
    apiFetch(`/api/prism/knowledge/videos/${videoId}/analyze`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getTranscript: (videoId: string) =>
    apiFetch(`/api/prism/knowledge/videos/${videoId}/transcript`),

  getOutline: (videoId: string) =>
    apiFetch(`/api/prism/knowledge/videos/${videoId}/outline`),

  getFlashcards: (videoId: string) =>
    apiFetch(`/api/prism/knowledge/videos/${videoId}/flashcards`),

  export: (videoId: string, payload: ExportKnowledgePayload = {}) =>
    apiFetch(`/api/prism/knowledge/videos/${videoId}/export`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
