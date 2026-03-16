'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ThemeSelector } from '@/components/theme';
import { MetricChip, SectionHeader, StatusPill, SurfaceCard } from '@/components/system';
import { Button } from '@/components/ui/button';
import { useApiKeysStore, type AIProvider } from '@/stores/api-keys.store';
import { settingsApi, type SafeUserSettings, type UpdateSettingsPayload } from '@/services/settings.api';

const PROVIDER_ICONS: Record<AIProvider, string> = {
  openai: 'OA',
  gemini: 'GE',
  anthropic: 'AN',
  whisper: 'WH',
  midjourney: 'MJ',
  seedance: 'SD',
  elevenlabs: 'EL',
};

export default function SettingsPage() {
  const { apiKeys, setApiKey, toggleProvider, resetToDefaults } = useApiKeysStore();
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [tempApiKey, setTempApiKey] = useState('');
  const [tempBaseUrl, setTempBaseUrl] = useState('');
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

    if (asr === 'whisper' && llm === 'openai' && image === 'openai' && video === 'openai' && tts === 'openai') return 't8star_default';
    if (asr === 'gemini' && llm === 'gemini' && image === 'gemini' && video === 'seedance' && tts === 'gemini') return 'google_premium_hybrid';
    if (asr === 'seedance' && llm === 'seedance' && image === 'seedance' && video === 'openai' && tts === 'seedance') return 'siliconflow';
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

  const updateServerSettings = async (payload: UpdateSettingsPayload, successMessage: string) => {
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

  const mapProviderToSettingsField = (provider: AIProvider, apiKey: string): UpdateSettingsPayload | null => {
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

  const applyProviderPack = async (pack: 'siliconflow' | 'google_premium_hybrid' | 't8star_default') => {
    if (pack === 't8star_default') {
      await updateServerSettings({ preferredAsr: 'whisper', preferredLlm: 'openai', preferredImageGen: 'openai', preferredVideoGen: 'openai', preferredTts: 'openai' }, '已切换为新中转站默认套餐');
      return;
    }
    if (pack === 'siliconflow') {
      await updateServerSettings({ preferredAsr: 'seedance', preferredLlm: 'seedance', preferredImageGen: 'seedance', preferredVideoGen: 'openai', preferredTts: 'seedance' }, '已切换为硅基流动默认套餐');
      return;
    }
    await updateServerSettings({ preferredAsr: 'gemini', preferredLlm: 'gemini', preferredImageGen: 'gemini', preferredVideoGen: 'seedance', preferredTts: 'gemini' }, '已切换为 Google 高级套餐（视频生成保持 Seedance）');
  };

  const handleSave = async () => {
    if (!editingProvider) return;
    setApiKey(editingProvider, tempApiKey, tempBaseUrl || undefined);
    const payload = mapProviderToSettingsField(editingProvider, tempApiKey);
    if (payload) {
      await updateServerSettings(payload, `${apiKeys[editingProvider].name} Key 已保存`);
    } else {
      setStatusMessage(`${apiKeys[editingProvider].name} 仅保存在本地`);
    }
    setEditingProvider(null);
    setTempApiKey('');
    setTempBaseUrl('');
  };

  const handleResetAll = async () => {
    resetToDefaults();
    await updateServerSettings({ openaiKey: '', geminiKey: '', seedanceKey: '', midjourneyKey: '', elevenlabsKey: '', preferredAsr: 'whisper', preferredLlm: 'openai', preferredImageGen: 'openai', preferredVideoGen: 'seedance', preferredTts: 'openai' }, '已重置本地与服务端设置');
  };

  const enabledCount = Object.values(apiKeys).filter((provider) => provider.enabled).length;

  return (
    <div className="min-h-screen px-4 py-6 text-text-primary md:px-6">
      <div className="page-width space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/projects" className="rounded-full border border-stroke-default px-4 py-2 text-sm text-text-secondary transition hover:text-text-primary">返回项目中枢</Link>
            <StatusPill tone="info">设置工作区</StatusPill>
          </div>
          <ThemeSelector />
        </header>

        <SurfaceCard className="grid gap-8 p-7 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <SectionHeader
              eyebrow="Workspace Settings"
              title="把主题、模型、套餐切换集中到一个工作区"
              description="这里优先解决三个问题：当前用什么主题、任务优先走哪个供应商、哪些 API Key 由系统默认提供，哪些由你覆盖。"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <MetricChip label="主题模式" value="2" hint="只保留暗色调与明色调，避免多主题碎裂。" />
            <MetricChip label="启用 Provider" value={String(enabledCount)} hint="当前本地已启用的模型服务数量。" />
            <MetricChip label="套餐模式" value={activeProviderPack === 'unknown' ? '读取中' : activeProviderPack} hint="AI Router 任务优先级将基于此模式切换。" className="sm:col-span-3 xl:col-span-1" />
          </div>
        </SurfaceCard>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <SurfaceCard className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Theme</div>
                <h2 className="mt-2 text-2xl font-semibold">明暗两套主题</h2>
              </div>
              <ThemeSelector />
            </div>
            <p className="mt-4 text-sm leading-7 text-text-secondary">暗色调用于持续工作和长时间阅读；明色调用于浏览、设置和柔和展示。这里不再提供多套风格主题。</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-stroke-default bg-[#0d1018] p-4 text-white">
                <div className="text-sm font-semibold">Prism Dark</div>
                <p className="mt-2 text-xs leading-6 text-white/70">更高对比、更强层级，适合工作台与复杂操作。</p>
              </div>
              <div className="rounded-[22px] border border-stroke-default bg-[#f8f3ec] p-4 text-[#1d1a17]">
                <div className="text-sm font-semibold">Prism Light</div>
                <p className="mt-2 text-xs leading-6 text-[#4e4437]">柔和中性色、简约排版，适合项目页与设置页浏览。</p>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Provider Packs</div>
                <h2 className="mt-2 text-2xl font-semibold">套餐切换</h2>
              </div>
              <StatusPill tone={isLoadingSettings ? 'default' : 'warning'}>{isLoadingSettings ? '读取中' : '可切换'}</StatusPill>
            </div>
            <p className="mt-4 text-sm leading-7 text-text-secondary">一键切换 ASR、LLM、生图、生视频和 TTS 的优先级，让工作流保持一致，模型策略按任务替换。</p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <PackCard title="新中转站默认" active={activeProviderPack === 't8star_default'} onClick={() => void applyProviderPack('t8star_default')} disabled={isLoadingSettings || isSaving} description="Whisper + OpenAI 全链路优先。" />
              <PackCard title="硅基默认" active={activeProviderPack === 'siliconflow'} onClick={() => void applyProviderPack('siliconflow')} disabled={isLoadingSettings || isSaving} description="Seedance 为主，视频生成保留 openai。" />
              <PackCard title="Google 高级" active={activeProviderPack === 'google_premium_hybrid'} onClick={() => void applyProviderPack('google_premium_hybrid')} disabled={isLoadingSettings || isSaving} description="Gemini 为主，视频生成继续走 Seedance。" />
            </div>
            {statusMessage ? <div className="mt-4 rounded-[18px] border border-stroke-default bg-bg-panel-secondary/65 px-4 py-3 text-sm text-text-secondary">{statusMessage}</div> : null}
          </SurfaceCard>
        </div>

        <SurfaceCard className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Providers</div>
              <h2 className="mt-2 text-2xl font-semibold">AI 提供商</h2>
              <p className="mt-3 text-sm leading-7 text-text-secondary">留空时默认走系统配置。你只在需要覆盖时填入自己的 Key。</p>
            </div>
            <Button variant="outline" onClick={() => void handleResetAll()}>重置默认</Button>
          </div>
          <div className="mt-6 space-y-4">
            {Object.values(apiKeys).map((config) => {
              const providerEditing = editingProvider === config.provider;
              return (
                <div key={config.provider} className="rounded-[24px] border border-stroke-default bg-bg-panel-secondary/65 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-stroke-default bg-bg-panel text-xs font-semibold text-text-primary">{PROVIDER_ICONS[config.provider]}</div>
                      <div>
                        <div className="text-base font-semibold text-text-primary">{config.name}</div>
                        <div className="mt-1 text-sm text-text-secondary">
                          {config.apiKey && !config.isDefault ? `••••${config.apiKey.slice(-4)} · 自定义` : config.isDefault ? '使用系统默认配置' : '未配置'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleProvider(config.provider)} className={`relative h-6 w-11 rounded-full transition ${config.enabled ? 'bg-[var(--accent-primary)]' : 'bg-bg-panel'}`}>
                        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      <Button variant="ghost" onClick={() => { setEditingProvider(config.provider); setTempApiKey(config.apiKey || ''); setTempBaseUrl(config.baseUrl || ''); }}>
                        {providerEditing ? '编辑中' : '配置'}
                      </Button>
                    </div>
                  </div>
                  {providerEditing ? (
                    <div className="mt-4 grid gap-3 border-t border-stroke-default pt-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">API Key</label>
                        <input type="password" value={tempApiKey} onChange={(event) => setTempApiKey(event.target.value)} className="input" placeholder="留空时使用系统默认配置" />
                      </div>
                      {(config.provider === 'openai' || config.provider === 'gemini' || config.provider === 'anthropic') ? (
                        <div className="md:col-span-2">
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Base URL</label>
                          <input type="text" value={tempBaseUrl} onChange={(event) => setTempBaseUrl(event.target.value)} className="input" placeholder="https://api.openai.com/v1" />
                        </div>
                      ) : null}
                      <div className="md:col-span-2 flex justify-end gap-3">
                        <Button variant="ghost" onClick={() => setEditingProvider(null)}>取消</Button>
                        <Button variant="accent" onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? '保存中...' : '保存设置'}</Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}

function PackCard({ title, description, active, onClick, disabled }: { title: string; description: string; active: boolean; onClick: () => void; disabled: boolean; }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`rounded-[22px] border px-4 py-4 text-left transition ${active ? 'border-[color:var(--accent-primary)] bg-[color:var(--accent-soft)]' : 'border-stroke-default bg-bg-panel-secondary/60 hover:border-stroke-strong'} disabled:opacity-60`}>
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
    </button>
  );
}
