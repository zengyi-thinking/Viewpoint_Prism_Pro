import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// AI 提供商类型
export type AIProvider = 'openai' | 'gemini' | 'anthropic' | 'whisper' | 'midjourney' | 'seedance' | 'elevenlabs';

interface ApiKeyConfig {
  provider: AIProvider;
  name: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  isDefault?: boolean; // 是否来自 .env 默认配置
}

interface ApiKeysStore {
  apiKeys: Record<AIProvider, ApiKeyConfig>;
  setApiKey: (provider: AIProvider, apiKey: string, baseUrl?: string) => void;
  toggleProvider: (provider: AIProvider) => void;
  resetToDefaults: () => void;
  getEffectiveKey: (provider: AIProvider) => string | null;
}

// 默认配置（占位符，实际从后端获取）
const DEFAULT_API_KEYS: Record<AIProvider, Omit<ApiKeyConfig, 'apiKey' | 'isDefault'>> = {
  openai: { provider: 'openai', name: 'OpenAI', enabled: true },
  gemini: { provider: 'gemini', name: 'Google Gemini', enabled: true },
  anthropic: { provider: 'anthropic', name: 'Anthropic Claude', enabled: false },
  whisper: { provider: 'whisper', name: 'OpenAI Whisper', enabled: true },
  midjourney: { provider: 'midjourney', name: 'Midjourney', enabled: false },
  seedance: { provider: 'seedance', name: '即梦 Seedance', enabled: false },
  elevenlabs: { provider: 'elevenlabs', name: 'ElevenLabs TTS', enabled: false },
};

/**
 * API Key 配置 Store
 * 持久化到 localStorage
 */
export const useApiKeysStore = create<ApiKeysStore>()(
  persist(
    (set, get) => ({
      apiKeys: Object.entries(DEFAULT_API_KEYS).reduce((acc, [key, value]) => {
        acc[key as AIProvider] = {
          ...value,
          apiKey: '',
          isDefault: true, // 标记为默认配置（来自 .env）
        };
        return acc;
      }, {} as Record<AIProvider, ApiKeyConfig>),

      setApiKey: (provider, apiKey, baseUrl) =>
        set((state) => ({
          apiKeys: {
            ...state.apiKeys,
            [provider]: {
              ...state.apiKeys[provider],
              apiKey,
              baseUrl,
              isDefault: false, // 用户自定义配置
            },
          },
        })),

      toggleProvider: (provider) =>
        set((state) => ({
          apiKeys: {
            ...state.apiKeys,
            [provider]: {
              ...state.apiKeys[provider],
              enabled: !state.apiKeys[provider].enabled,
            },
          },
        })),

      resetToDefaults: () =>
        set(() => ({
          apiKeys: Object.entries(DEFAULT_API_KEYS).reduce((acc, [key, value]) => {
            acc[key as AIProvider] = {
              ...value,
              apiKey: '',
              isDefault: true,
            };
            return acc;
          }, {} as Record<AIProvider, ApiKeyConfig>),
        })),

      getEffectiveKey: (provider) => {
        const config = get().apiKeys[provider];
        // 如果用户设置了自定义 key，使用自定义的
        // 否则返回 null，让后端使用 .env 中的默认值
        if (config.apiKey && !config.isDefault) {
          return config.apiKey;
        }
        return null; // 使用系统默认（.env）
      },
    }),
    {
      name: 'vpp-api-keys-storage',
      partialize: (state) => ({
        apiKeys: state.apiKeys,
      }),
    }
  )
);
