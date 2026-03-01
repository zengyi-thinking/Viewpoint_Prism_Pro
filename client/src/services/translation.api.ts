import { apiFetch } from './api';

export interface CreateTranslationTaskPayload {
  sourceLang?: string;
  targetLangs: string[];
}

export interface UpdateSubtitleSegmentsPayload {
  language: string;
  segments: Array<Record<string, unknown>>;
}

export interface VoiceClonePayload {
  language: string;
  voiceSampleUrl?: string;
}

export interface LipSyncPayload {
  language: string;
}

export interface ExportTranslationPayload {
  languages?: string[];
  burnSubtitles?: boolean;
}

export const translationApi = {
  createTask: (videoId: string, payload: CreateTranslationTaskPayload) =>
    apiFetch(`/api/prism/translation/videos/${videoId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSubtitles: (videoId: string) =>
    apiFetch(`/api/prism/translation/videos/${videoId}/subtitles`),

  updateSubtitles: (videoId: string, payload: UpdateSubtitleSegmentsPayload) =>
    apiFetch(`/api/prism/translation/videos/${videoId}/subtitles`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  voiceClone: (videoId: string, payload: VoiceClonePayload) =>
    apiFetch(`/api/prism/translation/videos/${videoId}/voice-clone`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  lipSync: (videoId: string, payload: LipSyncPayload) =>
    apiFetch(`/api/prism/translation/videos/${videoId}/lip-sync`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  export: (videoId: string, payload: ExportTranslationPayload = {}) =>
    apiFetch(`/api/prism/translation/videos/${videoId}/export`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
