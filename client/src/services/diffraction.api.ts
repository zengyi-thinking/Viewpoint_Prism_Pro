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

export interface ExtractKeyFramesPayload {
  count?: number;
}

export interface GenerateCopywritingPayload {
  platform: DiffractionPlatform;
  selectedFrames: Array<{ imageUrl: string; timestamp?: number }>;
  styleHints?: string;
  previousDraftId?: string;
}

export interface GenerateAssetsPayload {
  platforms: DiffractionPlatform[];
  draftIds?: string[];
}

export interface FrameQuality {
  timestamp: number;
  imageUrl: string;
  qualityScore: number;
  hasDataChart?: boolean;
  hasSpeaker?: boolean;
  emotionScore?: number;
  description?: string;
}

export interface CopywritingResult {
  platformDraftId: string;
  generatedContent: string;
  suggestions?: string[];
}

export interface AssetPackage {
  taskId: string;
  platform: string;
  assets: {
    images: string[];
    copywriting: string;
    jsonFileUrl: string;
  };
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

  // 衍射棱镜新增 API
  extractKeyFrames: (videoId: string, payload?: ExtractKeyFramesPayload) =>
    apiFetch('/api/prism/diffraction/keyframes', {
      method: 'POST',
      body: JSON.stringify({ videoId, ...payload }),
    }),

  generateCopywriting: (videoId: string, payload: GenerateCopywritingPayload) =>
    apiFetch('/api/prism/diffraction/copywriting', {
      method: 'POST',
      body: JSON.stringify({ videoId, ...payload }),
    }),

  generateAssets: (videoId: string, payload: GenerateAssetsPayload) =>
    apiFetch('/api/prism/diffraction/export', {
      method: 'POST',
      body: JSON.stringify({ videoId, ...payload }),
    }),

  getDrafts: (videoId: string) =>
    apiFetch(`/api/prism/diffraction/drafts/${videoId}`),

  deleteDraft: (draftId: string) =>
    apiFetch(`/api/prism/diffraction/drafts/${draftId}`, { method: 'DELETE' }),
};
