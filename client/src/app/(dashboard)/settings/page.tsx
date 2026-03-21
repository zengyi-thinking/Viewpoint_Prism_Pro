'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ThemeSelector } from '@/components/theme';
import { MetricChip, ModeSwitch, SectionHeader, StatusPill, SurfaceCard } from '@/components/system';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiKeysStore, type AIProvider } from '@/stores/api-keys.store';
import {
  useModelCatalogStore,
  type CapabilityTab,
  type ModelProfile,
  type VendorFamily,
  type VendorPreset,
} from '@/stores/model-catalog.store';
import { settingsApi, type SafeUserSettings, type UpdateSettingsPayload } from '@/services/settings.api';

const CAPABILITY_ORDER: CapabilityTab[] = ['chat', 'image', 'video', 'audio', 'tools'];

const CAPABILITY_LABELS: Record<CapabilityTab, string> = {
  chat: 'Chat',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  tools: '工具',
};

const FAMILY_LABELS: Record<VendorFamily, string> = {
  siliconflow: '硅基流动低配版',
  zhenzhen: '贞贞工坊高配版',
  google: '谷歌全家桶',
  compatible: '兼容自定义版',
};

const FAMILY_ACCENTS: Record<VendorFamily, string> = {
  siliconflow: 'var(--signal-warning)',
  zhenzhen: 'var(--accent-primary)',
  google: 'var(--signal-info)',
  compatible: 'var(--signal-success)',
};

const PRESET_TITLES: Record<VendorPreset, string> = {
  'siliconflow-lite': '硅基流动低配版',
  'zhenzhen-pro': '贞贞工坊高配版',
  'google-suite': '谷歌全家桶',
  'custom-compatible': '兼容自定义版',
};

const PRESET_DESCRIPTIONS: Record<VendorPreset, string> = {
  'siliconflow-lite': '成本优先，聊天、生图、音频和工具链默认走 SiliconFlow。',
  'zhenzhen-pro': '高质量链路，聊天、生图、视频和语音统一切到高配兼容层。',
  'google-suite': '聊天、图像、音频和工具链切到 Google，视频面向兼容模型卡片配置。',
  'custom-compatible': '完全按下方模型卡片逐项自定义，不强制覆盖当前服务端偏好。',
};

export default function SettingsPage() {
  const { setApiKey, resetToDefaults: resetApiKeys } = useApiKeysStore();
  const {
    selectedPreset,
    setPreset,
    globals,
    profiles,
    updateGlobal,
    updateProfile,
    addCustomProfile,
    resetCatalog,
  } = useModelCatalogStore();

  const [serverSettings, setServerSettings] = useState<SafeUserSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CapabilityTab>('image');

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

  useEffect(() => {
    if (!serverSettings || isLoadingSettings) return;
    if (serverSettings.providerConfigs) return;
    if (!serverSettings.preferredLlm) return;

    // 历史用户只有 preferred*，没有运行时 providerConfigs。
    // 这里不自动写库，避免无感覆盖；仅提示需要重新同步。
    setStatusMessage((current) => current ?? '检测到旧版厂商切换配置。请重新点击一次当前套餐或“同步到运行链路”，让模型厂商设置真正写入运行时配置。');
  }, [serverSettings, isLoadingSettings]);

  const tabCounts = useMemo(
    () =>
      CAPABILITY_ORDER.reduce<Record<CapabilityTab, number>>((acc, key) => {
        acc[key] = profiles.filter((profile) => profile.capability === key).length;
        return acc;
      }, {} as Record<CapabilityTab, number>),
    [profiles],
  );

  const currentProfiles = useMemo(
    () => profiles.filter((profile) => profile.capability === activeTab),
    [profiles, activeTab],
  );

  const runtimeProviderConfigs = useMemo(
    () => buildRuntimeProviderConfigs(globals, profiles),
    [globals, profiles],
  );

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

  const applyPreset = async (preset: VendorPreset) => {
    setPreset(preset);

    if (preset === 'siliconflow-lite') {
      await updateServerSettings(
        {
          seedanceKey: globals.siliconflow.apiKey,
          preferredAsr: 'seedance',
          preferredLlm: 'seedance',
          preferredImageGen: 'seedance',
          preferredVideoGen: 'seedance',
          preferredTts: 'seedance',
          providerConfigs: runtimeProviderConfigs,
        },
        '已切换为硅基流动低配版',
      );
      return;
    }

    if (preset === 'zhenzhen-pro') {
      await updateServerSettings(
        {
          openaiKey: globals.zhenzhen.apiKey,
          preferredAsr: 'whisper',
          preferredLlm: 'openai',
          preferredImageGen: 'openai',
          preferredVideoGen: 'openai',
          preferredTts: 'openai',
          providerConfigs: runtimeProviderConfigs,
        },
        '已切换为贞贞工坊高配版',
      );
      return;
    }

    if (preset === 'google-suite') {
      await updateServerSettings(
        {
          geminiKey: globals.google.apiKey,
          preferredAsr: 'gemini',
          preferredLlm: 'gemini',
          preferredImageGen: 'gemini',
          preferredVideoGen: 'seedance',
          preferredTts: 'gemini',
          providerConfigs: runtimeProviderConfigs,
        },
        '已切换为谷歌全家桶。视频链路仍保留兼容 fallback。',
      );
      return;
    }

    setStatusMessage('已切换为兼容自定义版。下方模型卡片将作为主配置工作区。');
  };

  const syncVendorToServer = async (family: VendorFamily) => {
    const globalConfig = globals[family];

    if (family === 'siliconflow') {
      setApiKey('seedance', globalConfig.apiKey, globalConfig.baseUrl || undefined);
      await updateServerSettings(
        { seedanceKey: globalConfig.apiKey, providerConfigs: runtimeProviderConfigs },
        '硅基流动全局配置已同步',
      );
      return;
    }

    if (family === 'zhenzhen') {
      setApiKey('openai', globalConfig.apiKey, globalConfig.baseUrl || undefined);
      setApiKey('whisper', globalConfig.apiKey, globalConfig.baseUrl || undefined);
      await updateServerSettings(
        { openaiKey: globalConfig.apiKey, providerConfigs: runtimeProviderConfigs },
        '贞贞工坊高配版已同步到兼容链路',
      );
      return;
    }

    if (family === 'google') {
      setApiKey('gemini', globalConfig.apiKey, globalConfig.baseUrl || undefined);
      await updateServerSettings(
        { geminiKey: globalConfig.apiKey, providerConfigs: runtimeProviderConfigs },
        '谷歌全家桶全局配置已同步',
      );
      return;
    }

    setStatusMessage('兼容自定义版当前仅保存在本地设置工作区。');
  };

  const handleResetAll = async () => {
    resetApiKeys();
    resetCatalog();
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
        providerConfigs: {},
      },
      '已重置设置工作区与服务端偏好',
    );
  };

  return (
    <div className="min-h-screen px-4 py-6 text-text-primary md:px-6">
      <div className="page-width space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/projects" className="rounded-full border border-stroke-default px-4 py-2 text-sm text-text-secondary transition hover:text-text-primary">
              返回项目中枢
            </Link>
            <StatusPill tone="info">模型与套餐工作区</StatusPill>
          </div>
          <ThemeSelector />
        </header>

        <SurfaceCard className="grid gap-8 p-7 xl:grid-cols-[1.08fr_0.92fr]">
          <div>
            <SectionHeader
              eyebrow="Model Routing"
              title="把多厂商切换、自定义模型和主题放到同一个设置工作区"
              description="上层切换套餐，下层按能力管理模型。硅基流动低配版、贞贞工坊高配版、谷歌全家桶和兼容模型可以共存，真正影响后端链路的偏好继续同步到现有设置接口。"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <MetricChip label="当前套餐" value={PRESET_TITLES[selectedPreset]} hint="支持套餐级切换，也支持单模型覆盖。" />
            <MetricChip label="模型卡片" value={String(profiles.length)} hint="覆盖聊天、生图、视频、音频和工具链。" />
            <MetricChip
              label="服务端偏好"
              value={isLoadingSettings ? '读取中' : '已同步'}
              hint={
                serverSettings
                  ? `LLM:${serverSettings.preferredLlm || '-'} / Image:${serverSettings.preferredImageGen || '-'}`
                  : '当前尚未读取到服务端配置。'
              }
              className="sm:col-span-3 xl:col-span-1"
            />
          </div>
        </SurfaceCard>

        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <SurfaceCard className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Theme</div>
                <h2 className="mt-2 text-2xl font-semibold">界面主题</h2>
              </div>
              <ThemeSelector />
            </div>
            <p className="mt-4 text-sm leading-7 text-text-secondary">主题仍然只保留两种。暗色调用于长时间工作台操作，明色调用于浏览、设置与项目整理，不再出现多套割裂色盘。</p>
            <div className="mt-6">
              <ModeSwitch
                value="two-mode"
                onChange={() => undefined}
                options={[
                  { value: 'two-mode', label: '双主题制' },
                  { value: 'stable', label: '统一语法' },
                ]}
              />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-stroke-default bg-[#0d1018] p-4 text-white">
                <div className="text-sm font-semibold">Prism Dark</div>
                <p className="mt-2 text-xs leading-6 text-white/70">清晰、层级强、适合持续创作。</p>
              </div>
              <div className="rounded-[22px] border border-stroke-default bg-[#f8f3ec] p-4 text-[#1d1a17]">
                <div className="text-sm font-semibold">Prism Light</div>
                <p className="mt-2 text-xs leading-6 text-[#4e4437]">柔和、简约、适合项目整理和设置浏览。</p>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Preset Packs</div>
                <h2 className="mt-2 text-2xl font-semibold">厂商套餐切换</h2>
              </div>
              <StatusPill tone={isSaving ? 'warning' : 'success'}>{isSaving ? '保存中' : '可切换'}</StatusPill>
            </div>
            <p className="mt-4 text-sm leading-7 text-text-secondary">先决定主要生产链路，再在下方标签页里逐项覆盖模型。这样兼顾一键切换与细粒度控制。</p>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {(Object.keys(PRESET_TITLES) as VendorPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => void applyPreset(preset)}
                  disabled={isSaving || isLoadingSettings}
                  className={`rounded-[22px] border px-4 py-4 text-left transition ${
                    selectedPreset === preset
                      ? 'border-[color:var(--accent-primary)] bg-[color:var(--accent-soft)]'
                      : 'border-stroke-default bg-bg-panel-secondary/60 hover:border-stroke-strong'
                  } disabled:opacity-60`}
                >
                  <div className="text-sm font-semibold text-text-primary">{PRESET_TITLES[preset]}</div>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{PRESET_DESCRIPTIONS[preset]}</p>
                </button>
              ))}
            </div>
            {statusMessage ? (
              <div className="mt-4 rounded-[18px] border border-stroke-default bg-bg-panel-secondary/65 px-4 py-3 text-sm text-text-secondary">
                {statusMessage}
              </div>
            ) : null}
          </SurfaceCard>
        </div>

        <SurfaceCard className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Vendor Globals</div>
              <h2 className="mt-2 text-2xl font-semibold">厂商全局入口</h2>
              <p className="mt-3 text-sm leading-7 text-text-secondary">先填全局 Base URL 和全局 API Key，再让下方模型卡片继承。兼容自定义版支持每张卡片单独覆盖。</p>
            </div>
            <Button variant="outline" onClick={() => void handleResetAll()}>
              重置工作区
            </Button>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {(Object.keys(globals) as VendorFamily[]).map((family) => (
              <VendorGlobalCard
                key={family}
                family={family}
                label={FAMILY_LABELS[family]}
                accent={FAMILY_ACCENTS[family]}
                baseUrl={globals[family].baseUrl}
                apiKey={globals[family].apiKey}
                isSaving={isSaving}
                onChange={(patch) => updateGlobal(family, patch)}
                onSync={() => void syncVendorToServer(family)}
              />
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Model Catalog</div>
              <h2 className="mt-2 text-2xl font-semibold">按能力配置模型</h2>
              <p className="mt-3 text-sm leading-7 text-text-secondary">标签页负责能力分组，卡片负责具体模型。每张卡片都能决定模型 ID、是否启用、是否继承全局 Base URL 和 API Key。</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill tone="default">兼容 OpenAI / 中转站格式</StatusPill>
              <Button variant="outline" onClick={() => addCustomProfile(activeTab)}>
                添加 {CAPABILITY_LABELS[activeTab]} 自定义模型
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CapabilityTab)} className="mt-6">
            <TabsList className="flex w-full flex-wrap justify-start rounded-[22px] p-1.5">
              {CAPABILITY_ORDER.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="rounded-[18px] px-4 py-2.5 text-sm">
                  {CAPABILITY_LABELS[tab]}
                  <span className="ml-2 rounded-full border border-stroke-default px-2 py-0.5 text-[11px] text-text-muted">
                    {tabCounts[tab]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            {CAPABILITY_ORDER.map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-6">
                <div className="grid gap-4">
                  {currentProfiles
                    .filter((profile) => profile.capability === tab)
                    .map((profile) => (
                      <ModelProfileCard
                        key={profile.id}
                        profile={profile}
                        familyLabel={FAMILY_LABELS[profile.family]}
                        accent={FAMILY_ACCENTS[profile.family]}
                        globalBaseUrl={globals[profile.family].baseUrl}
                        globalApiKey={globals[profile.family].apiKey}
                        onChange={(patch) => updateProfile(profile.id, patch)}
                      />
                    ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </SurfaceCard>
      </div>
    </div>
  );
}

function buildRuntimeProviderConfigs(
  globals: Record<VendorFamily, { baseUrl: string; apiKey: string }>,
  profiles: ModelProfile[],
) {
  const pickModel = (family: VendorFamily, capability: CapabilityTab) =>
    profiles.find((profile) => profile.family === family && profile.capability === capability && profile.enabled)?.modelId || '';

  return {
    seedance: {
      baseUrl: globals.siliconflow.baseUrl,
      models: {
        asr: pickModel('siliconflow', 'tools') || pickModel('siliconflow', 'audio'),
        chat: pickModel('siliconflow', 'chat'),
        // Use VLM model for multimodal (Qwen/Qwen2.5-VL-32B-Instruct)
        multimodal: pickModel('siliconflow', 'tools') || 'Qwen/Qwen2.5-VL-32B-Instruct',
        image: pickModel('siliconflow', 'image'),
        video: pickModel('siliconflow', 'video'),
        tts: pickModel('siliconflow', 'audio'),
        translation: pickModel('siliconflow', 'chat'),
      },
    },
    openai: {
      baseUrl: globals.zhenzhen.baseUrl || globals.compatible.baseUrl,
      models: {
        asr: pickModel('compatible', 'tools') || 'whisper-1',
        chat: pickModel('zhenzhen', 'chat') || pickModel('compatible', 'chat'),
        multimodal:
          pickModel('zhenzhen', 'chat') ||
          pickModel('compatible', 'chat') ||
          pickModel('compatible', 'image'),
        image: pickModel('zhenzhen', 'image') || pickModel('compatible', 'image'),
        video: pickModel('zhenzhen', 'video') || pickModel('compatible', 'video'),
        tts: pickModel('zhenzhen', 'audio') || pickModel('compatible', 'audio'),
        translation: pickModel('zhenzhen', 'chat') || pickModel('compatible', 'chat'),
      },
    },
    gemini: {
      baseUrl: globals.google.baseUrl,
      models: {
        asr: pickModel('google', 'tools') || pickModel('google', 'chat'),
        chat: pickModel('google', 'chat'),
        multimodal: pickModel('google', 'chat'),
        image: pickModel('google', 'image'),
        tts: pickModel('google', 'audio'),
        translation: pickModel('google', 'chat'),
      },
    },
  };
}

function VendorGlobalCard({
  family,
  label,
  accent,
  baseUrl,
  apiKey,
  isSaving,
  onChange,
  onSync,
}: {
  family: VendorFamily;
  label: string;
  accent: string;
  baseUrl: string;
  apiKey: string;
  isSaving: boolean;
  onChange: (patch: { baseUrl?: string; apiKey?: string }) => void;
  onSync: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-stroke-default bg-bg-panel-secondary/65 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full" style={{ background: accent }} />
          <div>
            <div className="text-lg font-semibold text-text-primary">{label}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-text-muted">{family}</div>
          </div>
        </div>
        <StatusPill tone={apiKey ? 'success' : 'default'}>{apiKey ? '已配置' : '待填写'}</StatusPill>
      </div>

      <div className="mt-5 grid gap-3">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Global Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(event) => onChange({ baseUrl: event.target.value })}
            className="input"
            placeholder="https://api.openai.com/v1"
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Global API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => onChange({ apiKey: event.target.value })}
            className="input"
            placeholder="sk-..."
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="accent" onClick={onSync} disabled={isSaving}>
          {family === 'compatible' ? '保存到本地' : isSaving ? '同步中...' : '同步到运行链路'}
        </Button>
      </div>
    </div>
  );
}

function ModelProfileCard({
  profile,
  familyLabel,
  accent,
  globalBaseUrl,
  globalApiKey,
  onChange,
}: {
  profile: ModelProfile;
  familyLabel: string;
  accent: string;
  globalBaseUrl: string;
  globalApiKey: string;
  onChange: (patch: Partial<ModelProfile>) => void;
}) {
  const effectiveBaseUrl = profile.useGlobalBase ? globalBaseUrl : profile.baseUrl;
  const effectiveApiKey = profile.useGlobalKey ? globalApiKey : profile.apiKey;
  const connectionTone = effectiveApiKey ? 'success' : 'default';

  return (
    <div className="rounded-[24px] border border-stroke-default bg-bg-panel-secondary/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-1 h-3 w-3 rounded-full" style={{ background: accent }} />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-lg font-semibold text-text-primary">{profile.name}</div>
              <StatusPill tone={connectionTone}>{effectiveApiKey ? '连接成功' : '待配置'}</StatusPill>
              <span className="rounded-full border border-stroke-default px-2.5 py-1 text-xs text-text-secondary">{profile.tag}</span>
            </div>
            <div className="mt-2 text-sm text-text-secondary">{familyLabel}</div>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{profile.description}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onChange({ enabled: !profile.enabled })}
          className={`relative h-6 w-11 rounded-full transition ${profile.enabled ? 'bg-[var(--accent-primary)]' : 'bg-bg-panel'}`}
        >
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${profile.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Model ID</label>
          <input
            type="text"
            value={profile.modelId}
            onChange={(event) => onChange({ modelId: event.target.value })}
            className="input"
          />
        </div>

        <div className="rounded-[18px] border border-stroke-default bg-bg-panel/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-text-primary">Base URL</div>
            <button
              type="button"
              onClick={() => onChange({ useGlobalBase: !profile.useGlobalBase })}
              className="text-xs text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
            >
              {profile.useGlobalBase ? '改为单独配置' : '改为继承全局'}
            </button>
          </div>
          <input
            type="text"
            value={profile.useGlobalBase ? effectiveBaseUrl : profile.baseUrl}
            onChange={(event) => onChange({ baseUrl: event.target.value })}
            disabled={profile.useGlobalBase}
            className="input mt-3"
            placeholder="https://api.openai.com/v1"
          />
          <p className="mt-2 text-xs text-text-muted">
            {profile.useGlobalBase ? '当前继承厂商全局 Base URL。' : '当前使用卡片级 Base URL。'}
          </p>
        </div>

        <div className="rounded-[18px] border border-stroke-default bg-bg-panel/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-text-primary">API Key</div>
            <button
              type="button"
              onClick={() => onChange({ useGlobalKey: !profile.useGlobalKey })}
              className="text-xs text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
            >
              {profile.useGlobalKey ? '改为单独配置' : '改为继承全局'}
            </button>
          </div>
          <input
            type="password"
            value={profile.useGlobalKey ? effectiveApiKey : profile.apiKey}
            onChange={(event) => onChange({ apiKey: event.target.value })}
            disabled={profile.useGlobalKey}
            className="input mt-3"
            placeholder="sk-..."
          />
          <p className="mt-2 text-xs text-text-muted">
            {profile.useGlobalKey ? '当前继承厂商全局 Key。' : '当前使用卡片级 Key。'}
          </p>
        </div>
      </div>
    </div>
  );
}
