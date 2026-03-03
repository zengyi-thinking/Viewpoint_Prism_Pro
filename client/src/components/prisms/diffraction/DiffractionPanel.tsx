'use client';

import { useState, useEffect } from 'react';
import { useWorkbenchStore } from '@/stores/workbench.store';
import { diffractionApi, DiffractionPlatform, FrameQuality } from '@/services/diffraction.api';
import { ImageSelector } from './ImageSelector';
import { ChatDock } from '@/components/workbench/ChatDock';

const PLATFORMS = [
  { code: 'xiaohongshu' as DiffractionPlatform, name: '小红书', icon: '📕', color: '#FF2442' },
  { code: 'twitter_x' as DiffractionPlatform, name: 'Twitter/X', icon: '🐦', color: '#000000' },
  { code: 'newsletter' as DiffractionPlatform, name: '公众号', icon: '📧', color: '#07C160' },
  { code: 'linkedin' as DiffractionPlatform, name: 'LinkedIn', icon: '💼', color: '#0077B5' },
  { code: 'instagram' as DiffractionPlatform, name: 'Instagram', icon: '📷', color: '#E4405F' },
];

export function DiffractionPanel({ videoId, onTimeClick }: { videoId?: string; onTimeClick?: (timestamp: number) => void }) {
  const { currentVideo } = useWorkbenchStore();

  // 状态
  const [selectedPlatform, setSelectedPlatform] = useState<DiffractionPlatform>('xiaohongshu');
  const [selectedFrames, setSelectedFrames] = useState<string[]>([]);
  const [allFrames, setAllFrames] = useState<FrameQuality[]>([]);
  const [storedDrafts, setStoredDrafts] = useState<Record<string, any>>({});
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 加载关键帧
  useEffect(() => {
    if (videoId) {
      loadKeyFrames(videoId);
      loadStoredDrafts(videoId);
    }
  }, [videoId]);

  const loadKeyFrames = async (vid: string) => {
    setIsExtracting(true);
    try {
      const response = await diffractionApi.extractKeyFrames(vid);
      setAllFrames((response as any)?.frames || []);
    } catch (error) {
      console.error('Failed to extract keyframes:', error);
    } finally {
      setIsExtracting(false);
    }
  };

  const loadStoredDrafts = async (vid: string) => {
    try {
      const response = await diffractionApi.getDrafts(vid);
      setStoredDrafts((response as any)?.drafts || {});
    } catch (error) {
      console.error('Failed to load drafts:', error);
    }
  };

  const handleToggleFrame = (url: string) => {
    if (selectedFrames.includes(url)) {
      setSelectedFrames(selectedFrames.filter(f => f !== url));
    } else {
      if (selectedFrames.length < 6) {
        setSelectedFrames([...selectedFrames, url]);
      }
    }
  };

  const handleGenerateCopywriting = async () => {
    if (!videoId || selectedFrames.length === 0) return;

    setIsLoading(true);
    try {
      const result = await diffractionApi.generateCopywriting(videoId, {
        platform: selectedPlatform,
        selectedFrames: selectedFrames.map(url => ({ imageUrl: url })),
      });

      setStoredDrafts(prev => ({ ...prev, [selectedPlatform]: result }));
    } catch (error) {
      console.error('Failed to generate copywriting:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchExport = async () => {
    if (!videoId) return;

    setIsLoading(true);
    try {
      const result = await diffractionApi.generateAssets(videoId, {
        platforms: PLATFORMS.map(p => p.code),
      });

      // 下载生成的资产包
      (result as any)?.forEach((pkg: any) => {
        if (pkg.assets?.jsonFileUrl) {
          window.open(pkg.assets.jsonFileUrl, '_blank');
        }
      });
    } catch (error) {
      console.error('Failed to export:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!videoId) {
    return (
      <div className="panel flex h-full flex-col">
        <div className="px-4 py-3">
          <p className="wb-meta">请先选择一个视频</p>
        </div>
      </div>
    );
  }

  const activeDraft = storedDrafts[selectedPlatform];

  return (
    <div className="panel flex h-full flex-col">
      {/* 顶部：平台选择区 */}
      <div className="flex gap-2 p-3 border-b border-border-subtle">
        {PLATFORMS.map(platform => (
          <button
            key={platform.code}
            onClick={() => setSelectedPlatform(platform.code)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
              selectedPlatform === platform.code
                ? 'bg-primary/10 border border-current'
                : 'bg-bg-panel-secondary hover:bg-border border border-border-subtle'
            }`}
            style={{ borderColor: selectedPlatform === platform.code ? platform.color : undefined }}
          >
            <span>{platform.icon}</span>
            <span className="font-medium">{platform.name}</span>
          </button>
        ))}
      </div>

      {/* 中部：素材精选区 + 对话窗口 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 素材精选区 */}
        <div className="w-3/5 h-full overflow-y-auto border-r border-border-subtle">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-primary">
                AI 精选素材 ({selectedFrames.length}/6)
              </h3>
              {isExtracting && (
                <span className="wb-meta text-xs animate-pulse">提取中...</span>
              )}
            </div>
            <p className="wb-meta text-xs mb-3">
              系统会从视频中挑选构图好、有数据图表、讲者表情饱满的帧
            </p>

            {/* 所有帧网格 */}
            {allFrames.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-text-tertiary mb-2">所有关键帧（点击选择）</p>
                <ImageSelector
                  frames={allFrames}
                  selectedFrameUrls={selectedFrames}
                  onToggleFrame={handleToggleFrame}
                  onFrameOrderChange={() => {}}
                />
              </div>
            )}

            {/* 存储的草稿预览 */}
            {Object.keys(storedDrafts).length > 0 && (
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <h4 className="text-xs font-medium text-text-tertiary mb-2">已生成草稿</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(storedDrafts).map(([platform, draft]) => {
                    const platformInfo = PLATFORMS.find(p => p.code === platform);
                    if (!platformInfo) return null;

                    return (
                      <div
                        key={platform}
                        className="p-2 rounded-lg border border-border-subtle bg-bg-panel-secondary"
                      >
                        <div className="flex items-center gap-2">
                          <span>{platformInfo.icon}</span>
                          <span className="text-xs text-text-tertiary">{platformInfo.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 对话窗口 */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-hidden">
            <ChatDock />
          </div>

          {/* 当前草稿预览 */}
          {activeDraft && (
            <div className="border-t border-border-subtle p-3 bg-bg-panel-secondary">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-tertiary">当前草稿</span>
                <button className="text-xs text-primary hover:opacity-80">编辑</button>
              </div>
              <div className="text-xs text-text-secondary max-h-24 overflow-y-auto">
                {typeof activeDraft === 'string' ? activeDraft : JSON.stringify(activeDraft, null, 2)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部：一键生成按钮 */}
      <div className="border-t border-border-subtle p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="wb-meta text-xs">
              已选择 {selectedFrames.length} 个素材
            </span>
            <button
              onClick={() => setSelectedFrames([])}
              disabled={selectedFrames.length === 0}
              className="px-2 py-1 rounded text-xs text-text-tertiary hover:bg-border disabled:opacity-50 transition-colors"
            >
              清空选择
            </button>
          </div>
          <button
            onClick={handleBatchExport}
            disabled={selectedFrames.length === 0 || isLoading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#4F46E5] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '生成中...' : '一键生成多端资产'}
          </button>
        </div>
      </div>
    </div>
  );
}
