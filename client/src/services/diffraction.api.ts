import { apiFetch } from './api';

export type DiffractionPlatform =
  | 'xiaohongshu'
  | 'jike'
  | 'twitter_x'
  | 'wechat_mp'
  | 'newsletter'
  | 'linkedin'
  | 'instagram';

export interface GenerateDiffractionPayload {
  platforms: DiffractionPlatform[];
  tone?: string;
  audience?: string;
}

export interface BatchExportDiffractionPayload {
  platforms?: DiffractionPlatform[];
  format?: 'zip' | 'json';
}

export const diffractionApi = {
  getTemplates: () => apiFetch('/api/prism/diffraction/templates'),

  generate: (videoId: string, payload: GenerateDiffractionPayload) =>
    apiFetch(`/api/prism/diffraction/videos/${videoId}/generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  batchExport: (videoId: string, payload: BatchExportDiffractionPayload = {}) =>
    apiFetch(`/api/prism/diffraction/videos/${videoId}/export`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
