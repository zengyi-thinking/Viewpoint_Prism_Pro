'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChatDock } from '@/components/workbench/ChatDock';
import { SurfaceCard, StatusPill } from '@/components/system';
import { diffractionApi, type DiffractionPlatform, type FrameQuality } from '@/services/diffraction.api';
import { ImageSelector } from './ImageSelector';

type DraftRecord = Record<string, string | Record<string, unknown>>;
type KeyFrameResponse = { frames?: FrameQuality[] };
type DraftResponse = { drafts?: DraftRecord };
type ExportAssetPackage = { assets?: { jsonFileUrl?: string } };

const PLATFORMS: Array<{ code: DiffractionPlatform; name: string; color: string; tone: string }> = [
  { code: 'xiaohongshu', name: '小红书', color: '#FF2442', tone: '种草图文' },
  { code: 'twitter_x', name: 'Twitter / X', color: '#111827', tone: '短线程内容' },
  { code: 'newsletter', name: '公众号', color: '#07C160', tone: '长文排版' },
  { code: 'linkedin', name: 'LinkedIn', color: '#0077B5', tone: '专业分发' },
  { code: 'instagram', name: 'Instagram', color: '#E4405F', tone: '视觉摘要' },
];

export function DiffractionPanel({ videoId }: { videoId?: string; onTimeClick?: (timestamp: number) => void }) {
  const [selectedPlatform, setSelectedPlatform] = useState<DiffractionPlatform>('xiaohongshu');
  const [selectedFrames, setSelectedFrames] = useState<string[]>([]);
  const [allFrames, setAllFrames] = useState<FrameQuality[]>([]);
  const [storedDrafts, setStoredDrafts] = useState<DraftRecord>({});
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!videoId) return;
    void loadKeyFrames(videoId);
    void loadStoredDrafts(videoId);
  }, [videoId]);

  const loadKeyFrames = async (targetVideoId: string) => {
    setIsExtracting(true);
    try {
      const response = await diffractionApi.extractKeyFrames(targetVideoId) as KeyFrameResponse;
      setAllFrames(response.frames || []);
    } finally {
      setIsExtracting(false);
    }
  };

  const loadStoredDrafts = async (targetVideoId: string) => {
    try {
      const response = await diffractionApi.getDrafts(targetVideoId) as DraftResponse;
      setStoredDrafts(response.drafts || {});
    } catch {
      setStoredDrafts({});
    }
  };

  const handleToggleFrame = (url: string) => {
    setSelectedFrames((current) => current.includes(url) ? current.filter((item) => item !== url) : current.length < 6 ? [...current, url] : current);
  };

  const handleGenerateCopywriting = async () => {
    if (!videoId || selectedFrames.length === 0) return;
    setIsLoading(true);
    try {
      const result = await diffractionApi.generateCopywriting(videoId, {
        platform: selectedPlatform,
        selectedFrames: selectedFrames.map((imageUrl) => ({ imageUrl })),
      }) as string | Record<string, unknown>;
      setStoredDrafts((current) => ({ ...current, [selectedPlatform]: result }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchExport = async () => {
    if (!videoId) return;
    setIsLoading(true);
    try {
      const result = await diffractionApi.generateAssets(videoId, { platforms: PLATFORMS.map((platform) => platform.code) }) as ExportAssetPackage[];
      result.forEach((pkg) => {
        if (pkg.assets?.jsonFileUrl) {
          window.open(pkg.assets.jsonFileUrl, '_blank');
        }
      });
    } finally {
      setIsLoading(false);
    }
  };

  const activePlatform = useMemo(() => PLATFORMS.find((platform) => platform.code === selectedPlatform), [selectedPlatform]);
  const activeDraft = storedDrafts[selectedPlatform];

  if (!videoId) {
    return <div className="flex h-full items-center justify-center text-sm text-text-secondary">请先选择一个视频。</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3">
      <div className="grid gap-3 xl:grid-cols-[0.38fr_0.62fr]">
        <SurfaceCard className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Platform Strategy</div>
              <div className="mt-1 text-lg font-semibold text-text-primary">选择分发平台</div>
            </div>
            <StatusPill tone={isExtracting ? 'warning' : 'info'}>{isExtracting ? '提取关键帧中' : '已就绪'}</StatusPill>
          </div>
          <div className="mt-4 space-y-2">
            {PLATFORMS.map((platform) => {
              const active = platform.code === selectedPlatform;
              return (
                <button
                  key={platform.code}
                  type="button"
                  onClick={() => setSelectedPlatform(platform.code)}
                  className={`w-full rounded-[18px] border px-4 py-3 text-left transition ${active ? 'border-stroke-strong bg-bg-panel' : 'border-stroke-default bg-bg-panel-secondary/65 hover:border-stroke-strong'}`}
                  style={active ? { boxShadow: `inset 0 0 0 1px ${platform.color}40` } : undefined}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{platform.name}</div>
                      <div className="mt-1 text-xs text-text-secondary">{platform.tone}</div>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: platform.color }} />
                  </div>
                </button>
              );
            })}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Generation Flow</div>
              <div className="mt-1 text-lg font-semibold text-text-primary">素材篮与草稿生成</div>
            </div>
            <div className="flex gap-2">
              <StatusPill>{selectedFrames.length}/6 素材</StatusPill>
              <StatusPill>{activePlatform?.name}</StatusPill>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-[18px] border border-stroke-default bg-bg-panel-secondary/65 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">01</div>
              <div className="mt-2 text-sm font-medium text-text-primary">挑选画面</div>
            </div>
            <div className="rounded-[18px] border border-stroke-default bg-bg-panel-secondary/65 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">02</div>
              <div className="mt-2 text-sm font-medium text-text-primary">生成平台草稿</div>
            </div>
            <div className="rounded-[18px] border border-stroke-default bg-bg-panel-secondary/65 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">03</div>
              <div className="mt-2 text-sm font-medium text-text-primary">导出多端资产</div>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[0.58fr_0.42fr]">
        <SurfaceCard className="min-h-0 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-stroke-default px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">素材篮</div>
              <div className="mt-1 text-xs text-text-secondary">系统会从视频中提取适合图文表达的关键帧，最多选择 6 张。</div>
            </div>
            <button type="button" onClick={() => setSelectedFrames([])} disabled={selectedFrames.length === 0} className="rounded-full border border-stroke-default px-3 py-1.5 text-xs text-text-secondary transition hover:text-text-primary disabled:opacity-50">清空</button>
          </div>
          <div className="min-h-0 overflow-y-auto">
            {allFrames.length > 0 ? <ImageSelector frames={allFrames} selectedFrameUrls={selectedFrames} onToggleFrame={handleToggleFrame} onFrameOrderChange={() => {}} /> : <div className="p-6 text-sm text-text-secondary">关键帧正在准备中。</div>}
          </div>
        </SurfaceCard>

        <div className="grid min-h-0 gap-3 grid-rows-[minmax(0,1fr)_minmax(220px,0.65fr)]">
          <SurfaceCard className="min-h-0 overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-stroke-default px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-text-primary">当前草稿预览</div>
                <div className="mt-1 text-xs text-text-secondary">先生成单平台草稿，再统一导出多平台资产。</div>
              </div>
              <button type="button" onClick={() => void handleGenerateCopywriting()} disabled={selectedFrames.length === 0 || isLoading} className="prism-btn-primary px-4 py-2 text-xs">{isLoading ? '生成中...' : '生成当前平台草稿'}</button>
            </div>
            <div className="min-h-0 overflow-y-auto p-4 text-sm leading-7 text-text-secondary">
              {activeDraft ? <pre className="whitespace-pre-wrap break-words font-sans text-sm text-text-secondary">{typeof activeDraft === 'string' ? activeDraft : JSON.stringify(activeDraft, null, 2)}</pre> : '还没有生成当前平台的草稿。先从素材篮选择图片，再生成草稿。'}
            </div>
          </SurfaceCard>

          <SurfaceCard className="min-h-0 overflow-hidden p-0">
            <div className="border-b border-stroke-default px-4 py-3">
              <div className="text-sm font-semibold text-text-primary">对话辅助</div>
              <div className="mt-1 text-xs text-text-secondary">用对话区继续细化平台语气、标题和结构。</div>
            </div>
            <div className="min-h-0 overflow-hidden">
              <ChatDock />
            </div>
          </SurfaceCard>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-[22px] border border-stroke-default bg-bg-panel-secondary/55 px-4 py-3">
        <div className="text-sm text-text-secondary">已选择 {selectedFrames.length} 个素材，当前平台为 {activePlatform?.name}。</div>
        <button type="button" onClick={() => void handleBatchExport()} disabled={selectedFrames.length === 0 || isLoading} className="prism-btn-primary px-5 py-2 text-sm">{isLoading ? '导出中...' : '一键生成多端资产'}</button>
      </div>
    </div>
  );
}
