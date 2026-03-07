'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApiKeysStore, AIProvider } from '@/stores/api-keys.store';
import {
  settingsApi,
  type SafeUserSettings,
  type UpdateSettingsPayload,
} from '@/services/settings.api';

const PROVIDER_ICONS: Record<AIProvider, React.ReactNode> = {
  openai: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .5157 4.9108 5.98 5.98 0 0 0 1.9744 7.1508 6.0462 6.0462 0 0 0 6.5098 2.9A6.0651 6.0651 0 0 0 19.0193 14.8132a5.9847 5.9847 0 0 0 3.9977-2.9 6.0462 6.0462 0 0 0-.7351-2.0921z" />
    </svg>
  ),
  gemini: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  anthropic: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.304 3.541l-5.5 9.5a1.5 1.5 0 0 1-2.608 0l-5.5-9.5a1.5 1.5 0 0 1 1.304-2.236h10.608a1.5 1.5 0 0 1 1.304 2.236h-.608zM4.5 20h15a1.5 1.5 0 0 1 0 3h-15a1.5 1.5 0 0 1 0-3z" />
    </svg>
  ),
  whisper: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  midjourney: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
    </svg>
  ),
  seedance: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="4" />
      <path d="M7 12h10M12 7v10" />
    </svg>
  ),
  elevenlabs: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.5L17.5 8 12 11 6.5 8 12 4.5z" />
    </svg>
  ),
};

export default function SettingsPage() {
  const { apiKeys, setApiKey, toggleProvider, resetToDefaults } = useApiKeysStore();
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [tempApiKey, setTempApiKey] = useState('');
  const [tempBaseUrl, setTempBaseUrl] = useState('');
  const [showDefaultNotice, setShowDefaultNotice] = useState(true);
  const [serverSettings, setServerSettings] = useState<SafeUserSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeProviderPack = useMemo(() => {
    if (!serverSettings) return 'unknown';
    const asr = serverSettings.preferredAsr || 'seedance';
    const llm = serverSettings.preferredLlm || 'seedance';
    const image = serverSettings.preferredImageGen || 'seedance';
    const video = serverSettings.preferredVideoGen || 'seedance';
    const tts = serverSettings.preferredTts || 'seedance';

    if (
      asr === 'gemini' &&
      llm === 'gemini' &&
      image === 'gemini' &&
      tts === 'gemini' &&
      video === 'seedance'
    ) {
      return 'google_premium_hybrid';
    }

    if (
      asr === 'seedance' &&
      llm === 'seedance' &&
      image === 'seedance' &&
      video === 'seedance' &&
      tts === 'seedance'
    ) {
      return 'siliconflow';
    }

    return 'custom';
  }, [serverSettings]);

  useEffect(() => {
    const load = async () => {
      try {
        const payload = await settingsApi.get();
        setServerSettings(payload.settings);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '加载设置失败');
      } finally {
        setIsLoadingSettings(false);
      }
    };

    void load();
  }, []);

  const updateServerSettings = async (
    payload: UpdateSettingsPayload,
    successMessage: string,
  ) => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const response = await settingsApi.update(payload);
      setServerSettings(response.settings);
      setStatusMessage(successMessage);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const mapProviderToSettingsField = (
    provider: AIProvider,
    apiKey: string,
  ): UpdateSettingsPayload | null => {
    switch (provider) {
      case 'openai':
      case 'whisper':
        return { openaiKey: apiKey };
      case 'gemini':
        return { geminiKey: apiKey };
      case 'seedance':
        return { seedanceKey: apiKey };
      case 'midjourney':
        return { midjourneyKey: apiKey };
      case 'elevenlabs':
        return { elevenlabsKey: apiKey };
      default:
        return null;
    }
  };

  const applyProviderPack = async (pack: 'siliconflow' | 'google_premium_hybrid') => {
    if (pack === 'siliconflow') {
      await updateServerSettings(
        {
          preferredAsr: 'seedance',
          preferredLlm: 'seedance',
          preferredImageGen: 'seedance',
          preferredVideoGen: 'seedance',
          preferredTts: 'seedance',
        },
        '已切换为硅基流动默认套餐',
      );
      return;
    }

    await updateServerSettings(
      {
        preferredAsr: 'gemini',
        preferredLlm: 'gemini',
        preferredImageGen: 'gemini',
        // 当前工程的视频生成链路仍优先保留 Seedance，避免播放 URL 鉴权问题。
        preferredVideoGen: 'seedance',
        preferredTts: 'gemini',
      },
      '已切换为 Google 高级套餐（视频生成保持 Seedance）',
    );
  };

  const handleSave = async () => {
    if (!editingProvider) return;

    setApiKey(editingProvider, tempApiKey, tempBaseUrl || undefined);
    const payload = mapProviderToSettingsField(editingProvider, tempApiKey);
    if (payload) {
      await updateServerSettings(payload, `${apiKeys[editingProvider].name} Key 已保存`);
    } else {
      setStatusMessage(`${apiKeys[editingProvider].name} 仅保存在本地（当前后端未持久化该 Provider）`);
    }

    setEditingProvider(null);
    setTempApiKey('');
    setTempBaseUrl('');
  };

  const handleCancel = () => {
    setEditingProvider(null);
    setTempApiKey('');
    setTempBaseUrl('');
  };

  const handleResetAll = async () => {
    resetToDefaults();
    await updateServerSettings(
      {
        openaiKey: '',
        geminiKey: '',
        seedanceKey: '',
        midjourneyKey: '',
        elevenlabsKey: '',
        preferredAsr: 'seedance',
        preferredLlm: 'seedance',
        preferredImageGen: 'seedance',
        preferredVideoGen: 'seedance',
        preferredTts: 'seedance',
      },
      '已重置本地与服务端设置为默认',
    );
  };

  return (
    <div
      className="min-h-screen w-full bg-bg-primary p-6 md:p-8"
      style={{
        writingMode: 'horizontal-tb',
        textOrientation: 'mixed',
      }}
    >
      {/* Header */}
      <header className="mb-8 flex items-center gap-4">
        <Link href="/projects" className="flex items-center gap-2 text-text-secondary transition hover:text-text-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          返回项目
        </Link>
        <div className="h-4 w-px bg-border" />
        <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
          <defs>
            <linearGradient id="settings-logo" x1="0" y1="0" x2="28" y2="28">
              <stop offset="0%" stopColor="#FF6B35" />
              <stop offset="50%" stopColor="#E91E8C" />
              <stop offset="100%" stopColor="#4F46E5" />
            </linearGradient>
          </defs>
          <path d="M14 2L26 24H2L14 2Z" stroke="url(#settings-logo)" strokeWidth="1.5" fill="none" />
        </svg>
        <h1 className="text-xl font-bold text-text-primary">API 配置</h1>
      </header>

      {/* 默认配置提示 */}
      {showDefaultNotice && (
        <div className="mb-6 rounded-xl border border-accent-primary/30 bg-accent-muted/30 px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <div>
                <p className="text-sm font-medium text-text-primary">BYOK 架构 - 自带模型密钥</p>
                <p className="mt-1 text-xs text-text-secondary">
                  系统已预配置默认 API Key（来自 .env 配置）。如需使用自己的密钥，可在下方覆盖。
                  不填写时将自动使用系统默认配置。
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowDefaultNotice(false)}
              className="shrink-0 rounded-lg p-1 text-text-tertiary transition hover:bg-bg-panel hover:text-text-secondary"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto mb-6 w-full max-w-[48rem] rounded-xl border border-border-subtle bg-bg-panel px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">服务套餐一键切换</h2>
            <p className="mt-1 text-xs text-text-tertiary">
              直接切换 AI Router 的任务优先级（ASR / LLM / 多模态 / 生图 / TTS）。
            </p>
            <p className="mt-1 text-[11px] text-text-tertiary">
              当前模式：
              {activeProviderPack === 'siliconflow' && ' 硅基流动默认套餐'}
              {activeProviderPack === 'google_premium_hybrid' && ' Google 高级套餐（视频生成保持 Seedance）'}
              {activeProviderPack === 'custom' && ' 自定义'}
              {activeProviderPack === 'unknown' && (isLoadingSettings ? ' 读取中...' : ' 未配置')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void applyProviderPack('siliconflow')}
              disabled={isSaving || isLoadingSettings}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                activeProviderPack === 'siliconflow'
                  ? 'bg-accent-primary text-text-inverse'
                  : 'bg-bg-panel-secondary text-text-secondary hover:text-text-primary'
              } disabled:opacity-60`}
            >
              硅基默认
            </button>
            <button
              onClick={() => void applyProviderPack('google_premium_hybrid')}
              disabled={isSaving || isLoadingSettings}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                activeProviderPack === 'google_premium_hybrid'
                  ? 'bg-accent-primary text-text-inverse'
                  : 'bg-bg-panel-secondary text-text-secondary hover:text-text-primary'
              } disabled:opacity-60`}
            >
              Google 高级
            </button>
          </div>
        </div>

        {statusMessage && (
          <p className="mt-3 rounded-md bg-bg-panel-secondary px-3 py-2 text-xs text-text-secondary">
            {statusMessage}
          </p>
        )}
      </div>

      {/* API Keys 配置列表 */}
      <div className="mx-auto w-full max-w-[48rem] space-y-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary">
            AI 模型提供商
          </h2>
          <p className="mt-1 text-xs text-text-tertiary">
            配置各 AI 服务的 API Key。留空则使用系统默认配置。
          </p>
        </div>

        {Object.values(apiKeys).map((config) => (
          <div key={config.provider} className="panel overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-panel-tertiary text-text-secondary">
                  {PROVIDER_ICONS[config.provider]}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-text-primary">{config.name}</h3>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {config.apiKey && !config.isDefault
                      ? `••••${config.apiKey.slice(-4)} (自定义)`
                      : config.isDefault
                      ? '使用系统默认 (.env)'
                      : '未配置'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* 启用/禁用开关 */}
                <button
                  onClick={() => toggleProvider(config.provider)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    config.enabled ? 'bg-accent-primary' : 'bg-bg-panel-tertiary'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                      config.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>

                {/* 编辑按钮 */}
                <button
                  onClick={() => {
                    setEditingProvider(config.provider);
                    setTempApiKey(config.apiKey || '');
                    setTempBaseUrl(config.baseUrl || '');
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-bg-panel-secondary hover:text-text-primary"
                >
                  {config.apiKey && !config.isDefault ? '修改' : '配置'}
                </button>
              </div>
            </div>

            {/* 编辑模式 */}
            {editingProvider === config.provider && (
              <div className="border-t border-border-subtle bg-bg-panel-secondary p-4">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-tertiary">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={tempApiKey}
                      onChange={(e) => setTempApiKey(e.target.value)}
                      placeholder="sk-... 或留空使用默认"
                      className="input w-full"
                    />
                  </div>

                  {(config.provider === 'openai' || config.provider === 'gemini' || config.provider === 'anthropic') && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-text-tertiary">
                        Base URL (可选)
                      </label>
                      <input
                        type="text"
                        value={tempBaseUrl}
                        onChange={(e) => setTempBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1"
                        className="input w-full"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={handleCancel}
                      className="rounded-lg px-3 py-1.5 text-xs text-text-tertiary transition hover:bg-bg-panel-tertiary"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => void handleSave()}
                      disabled={isSaving}
                      className="rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-medium text-text-inverse transition hover:opacity-90"
                    >
                      {isSaving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 底部操作 */}
      <div className="mx-auto mt-8 w-full max-w-[48rem]">
        <button
          onClick={() => void handleResetAll()}
          className="text-xs text-text-tertiary transition hover:text-text-secondary"
        >
          重置所有配置为默认
        </button>
      </div>
    </div>
  );
}
