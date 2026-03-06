'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';
import {
  knowledgeApi,
  type KnowledgeBoardSnapshotResponse,
  type KnowledgeTimelineItem,
} from '@/services/knowledge.api';

interface RealtimeKnowledgeBoardProps {
  projectId?: string;
  videoId: string;
  onTimeClick?: (timestamp: number) => void;
  onAnalyzeCurrent?: () => void | Promise<void>;
  isAnalyzingCurrent?: boolean;
}

function formatTimestamp(seconds?: number) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '--:--';
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function extractHighlights(item: KnowledgeTimelineItem) {
  const text = [item.summary, item.content]
    .filter(Boolean)
    .join('\n')
    .replace(/\*\*/g, '')
    .split(/\n|。|；|;/)
    .map((line) => line.trim())
    .filter((line) => line.length > 8);

  return Array.from(new Set(text)).slice(0, 3);
}

export function RealtimeKnowledgeBoard({
  videoId,
  onTimeClick,
  onAnalyzeCurrent,
  isAnalyzingCurrent = false,
}: RealtimeKnowledgeBoardProps) {
  const [snapshot, setSnapshot] = useState<KnowledgeBoardSnapshotResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSnapshot = async (silent = false) => {
    if (!videoId) return;
    try {
      if (!silent) setIsLoading(true);
      const response = await knowledgeApi.getBoardSnapshot(videoId);
      setSnapshot(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (
        message.includes('视频不存在或无访问权限') ||
        message.includes('未授权')
      ) {
        setSnapshot(null);
      } else {
        console.error('加载实时知识看板失败:', error);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, [videoId]);

  useEffect(() => {
    if (!videoId) return;
    const interval = window.setInterval(() => {
      void loadSnapshot(true);
    }, isAnalyzingCurrent ? 4000 : 12000);
    return () => window.clearInterval(interval);
  }, [videoId, isAnalyzingCurrent]);

  const deepSummary = useMemo(
    () =>
      snapshot?.timeline.find(
        (item) => item.type === 'OUTLINE_BLOCK' && item.metadata?.source === 'deep_analysis',
      ) ?? null,
    [snapshot],
  );

  const keyframeHighlights = useMemo(
    () =>
      (snapshot?.timeline ?? [])
        .filter((item) => item.type === 'KEYFRAME_CARD')
        .sort((a, b) => (a.timestampSec ?? 0) - (b.timestampSec ?? 0))
        .slice(0, 10),
    [snapshot],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <Sparkles className="h-8 w-8 text-amber-300/70" />
        <p className="mt-3 text-sm font-medium text-text-primary">实时看板等待视频分析</p>
        <p className="mt-1 text-xs text-text-tertiary">
          完成知识分析后，这里会展示视频的深度加工摘要、关键帧亮点和可跳转时间锚点。
        </p>
        {onAnalyzeCurrent ? (
          <button
            type="button"
            onClick={() => void onAnalyzeCurrent()}
            disabled={isAnalyzingCurrent}
            className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
          >
            {isAnalyzingCurrent ? '分析中...' : '开始分析当前视频'}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">实时知识看板</p>
          <p className="text-[11px] text-text-tertiary">
            以深度理解为主线，持续沉淀关键帧亮点与时间锚点
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSnapshot()}
          className="rounded-md border border-border-subtle px-2 py-1 text-[11px] text-text-tertiary transition hover:text-text-secondary"
        >
          <RefreshCw className="mr-1 inline h-3.5 w-3.5" />
          刷新
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="space-y-4">
          <section className="rounded-2xl border border-amber-500/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(245,158,11,0.04))] p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
                深度加工总结
              </span>
              <span className="text-[10px] text-text-tertiary">
                Board · {snapshot.state}
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-text-primary">
              {deepSummary?.title || '视频重点总览'}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-text-secondary">
              {deepSummary?.summary || deepSummary?.content || '当前还没有深度摘要，请先执行分析。'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-text-tertiary">
              <span className="rounded-full border border-border-subtle px-2 py-0.5">
                关键帧 {snapshot.stats.keyframes}
              </span>
              <span className="rounded-full border border-border-subtle px-2 py-0.5">
                洞察 {snapshot.stats.frameInsights ?? 0}
              </span>
              <span className="rounded-full border border-border-subtle px-2 py-0.5">
                深度分析 v{snapshot.stats.deepAnalysisVersion ?? 0}
              </span>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">关键帧亮点流</p>
                <p className="text-[11px] text-text-tertiary">
                  仅展示高价值画面与对应亮点，不再堆叠低价值大纲/闪卡
                </p>
              </div>
            </div>

            {keyframeHighlights.length === 0 ? (
              <div className="rounded-xl border border-border-subtle bg-bg-panel-secondary px-4 py-6 text-center text-sm text-text-tertiary">
                暂无关键帧亮点，请先完成视频分析。
              </div>
            ) : (
              <div className="space-y-3">
                {keyframeHighlights.map((item) => {
                  const highlights = extractHighlights(item);
                  return (
                    <article
                      key={item.id}
                      className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-panel-secondary"
                    >
                      <div className="grid gap-0 md:grid-cols-[200px_minmax(0,1fr)]">
                        <div className="relative h-40 overflow-hidden bg-black/30 md:h-full">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-text-tertiary">
                              暂无关键帧图片
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              typeof item.timestampSec === 'number' && onTimeClick?.(item.timestampSec)
                            }
                            className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur"
                          >
                            {formatTimestamp(item.timestampSec)}
                          </button>
                        </div>

                        <div className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                              关键帧亮点
                            </span>
                            {typeof item.metadata?.frameType === 'string' ? (
                              <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[10px] text-text-tertiary">
                                {String(item.metadata.frameType)}
                              </span>
                            ) : null}
                          </div>

                          <h4 className="mt-3 text-sm font-semibold text-text-primary">
                            {item.title}
                          </h4>
                          <p className="mt-2 text-[13px] leading-6 text-text-secondary">
                            {item.summary || '该关键帧已被提炼，但还没有生成可显示摘要。'}
                          </p>

                          {highlights.length > 0 ? (
                            <ul className="mt-3 space-y-1.5 text-[12px] text-text-secondary">
                              {highlights.map((line, index) => (
                                <li key={`${item.id}-${index}`} className="flex gap-2">
                                  <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-amber-300" />
                                  <span>{line}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
