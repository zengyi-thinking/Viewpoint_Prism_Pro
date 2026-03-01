import { apiFetch } from './api';

export const knowledgeApi = {
  getAsset: (videoId: string) => apiFetch(`/api/prism/knowledge/${videoId}`),
  generateOutline: (videoId: string) =>
    apiFetch(`/api/prism/knowledge/${videoId}/outline`, { method: 'POST' }),
  exportAsset: (assetId: string) =>
    apiFetch(`/api/prism/knowledge/${assetId}/export`, { method: 'POST' }),
};
