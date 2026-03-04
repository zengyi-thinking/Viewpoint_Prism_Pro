import { apiFetch } from './api';

export interface SafeUserSettings {
  preferredAsr?: string | null;
  preferredLlm?: string | null;
  preferredImageGen?: string | null;
  preferredVideoGen?: string | null;
  preferredTts?: string | null;
  hasOpenaiKey?: boolean;
  hasGeminiKey?: boolean;
  hasVolcengineKey?: boolean;
  hasAliyunAsrKey?: boolean;
  hasMidjourneyKey?: boolean;
  hasSeedanceKey?: boolean;
  hasElevenlabsKey?: boolean;
  hasNotionToken?: boolean;
  hasFeishuAppId?: boolean;
  hasFeishuAppSecret?: boolean;
  updatedAt?: string | Date;
}

export interface SettingsResponse {
  userId: string;
  settings: SafeUserSettings | null;
}

export interface UpdateSettingsPayload {
  openaiKey?: string;
  geminiKey?: string;
  volcengineKey?: string;
  aliyunAsrKey?: string;
  midjourneyKey?: string;
  seedanceKey?: string;
  elevenlabsKey?: string;
  notionToken?: string;
  feishuAppId?: string;
  feishuAppSecret?: string;
  preferredAsr?: string;
  preferredLlm?: string;
  preferredImageGen?: string;
  preferredVideoGen?: string;
  preferredTts?: string;
}

export const settingsApi = {
  get: () => apiFetch<SettingsResponse>('/api/settings'),
  update: (payload: UpdateSettingsPayload) =>
    apiFetch<SettingsResponse>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};

