'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type KnowledgeBoardSnapshotResponse,
  type KnowledgeTimelineItem,
  type KnowledgeBoardState,
  type KnowledgeTimelineItemType,
  knowledgeApi,
} from '@/services/knowledge.api';
import { useWebSocket } from '@/hooks/use-websocket';

interface RealtimeKnowledgeBoardProps {
  projectId?: string;
  videoId: string;
  onTimeClick?: (timestamp: number) => void;
  onAnalyzeCurrent?: () => Promise<void>;
  isAnalyzingCurrent?: boolean;
}

const TYPE_LABEL: Record<KnowledgeTimelineItemType, string> = {
  KEYFRAME_CARD: '关键帧',
  OUTLINE_BLOCK: '大纲',
  QA_CARD: '专属 Q&A',
  FLASHCARD: '闪卡',
  REVIEW_PLAN: '复习计划',
};

const TYPE_CLASS: Record<KnowledgeTimelineItemType, string> = {
  KEYFRAME_CARD: 'border-amber-500/30 bg-amber-500/5',
  OUTLINE_BLOCK: 'border-cyan-500/30 bg-cyan-500/5',
  QA_CARD: 'border-fuchsia-500/40 bg-fuchsia-500/10 ring-1 ring-fuchsia-500/20',
  FLASHCARD: 'border-emerald-500/30 bg-emerald-500/5',
  REVIEW_PLAN: 'border-indigo-500/30 bg-indigo-500/5',
};

function formatTimestamp(seconds?: number) {
  if (!Number.isFinite(seconds)) return '';
  const safe = Math.max(0, Math.floor(seconds as number));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TypewriterText({
  text,
  animate,
}: {
  text: string;
  animate: boolean;
}) {
  const [value, setValue] = useState(animate ? '' : text);
  const [isTyping, setIsTyping] = useState(animate);

  useEffect(() => {
    if (!animate) {
      setValue(text);
      setIsTyping(false);
      return;
    }

    let idx = 0;
    setValue('');
    setIsTyping(true);
    const timer = window.setInterval(() => {
      idx += 2;
      setValue(text.slice(0, idx));
      if (idx >= text.length) {
        window.clearInterval(timer);
        setIsTyping(false);
      }
    }, 14);

    return () => window.clearInterval(timer);
  }, [text, animate]);

  return (
    <p className="text-xs leading-5 text-text-secondary whitespace-pre-wrap">
      {value}
      {isTyping ? <span className="vp-kb-caret" /> : null}
    </p>
  );
}

function sortTimeline(items: KnowledgeTimelineItem[]) {
  return [...items].sort((a, b) => {
    const ta = Number.isFinite(a.timestampSec) ? (a.timestampSec as number) : Number.MAX_SAFE_INTEGER;
    const tb = Number.isFinite(b.timestampSec) ? (b.timestampSec as number) : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function RealtimeKnowledgeBoard({
  projectId,
  videoId,
  onTimeClick,
  onAnalyzeCurrent,
  isAnalyzingCurrent = false,
}: RealtimeKnowledgeBoardProps) {
  const [snapshot, setSnapshot] = useState<KnowledgeBoardSnapshotResponse | null>(null);
  const [state, setState] = useState<KnowledgeBoardState>('idle');
  const [timeline, setTimeline] = useState<KnowledgeTimelineItem[]>([]);
  const [liveItems, setLiveItems] = useState<Record<string, true>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string>('');

  const refreshSnapshot = useCallback(async () => {
    setIsLoading(true);
    setErrorText('');
    try {
      const data = await knowledgeApi.getBoardSnapshot(videoId);
      setSnapshot(data);
      setState(data.state);
      setTimeline(sortTimeline(data.timeline || []));
      setLiveItems({});
    } catch (error: any) {
      console.error('获取知识看板快照失败:', error);
      setErrorText(error?.message || '知识看板加载失败，请检查后端连接。');
    } finally {
      setIsLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const onKnowledgeState = useCallback(
    (event: {
      videoId: string;
      state: KnowledgeBoardState;
      stats?: Record<string, unknown>;
    }) => {
      if (event.videoId !== videoId) return;
      setState(event.state);
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              state: event.state,
              stats: {
                ...prev.stats,
                ...(event.stats ?? {}),
              },
              updatedAt: new Date().toISOString(),
            }
          : prev,
      );
    },
    [videoId],
  );

  const onKnowledgeTimeline = useCallback(
    (event: {
      videoId: string;
      item: {
        id: string;
        type: KnowledgeTimelineItemType;
        timestampSec?: number;
        title: string;
        summary?: string;
        content?: string;
        imageUrl?: string;
        metadata?: Record<string, unknown>;
        createdAt: string;
      };
    }) => {
      if (event.videoId !== videoId) return;
      const incoming: KnowledgeTimelineItem = {
        videoId: event.videoId,
        ...event.item,
      };
      setTimeline((prev) => {
        const idx = prev.findIndex((item) => item.id === incoming.id);
        if (idx >= 0) {
          const clone = [...prev];
          clone[idx] = incoming;
          return sortTimeline(clone);
        }
        return sortTimeline([...prev, incoming]);
      });
      setLiveItems((prev) => ({ ...prev, [incoming.id]: true }));
      window.setTimeout(() => {
        setLiveItems((prev) => {
          const clone = { ...prev };
          delete clone[incoming.id];
          return clone;
        });
      }, 3500);
    },
    [videoId],
  );

  const { isConnected, joinProject } = useWebSocket({
    projectId,
    onKnowledgeState,
    onKnowledgeTimeline,
  });

  useEffect(() => {
    if (projectId && isConnected) {
      joinProject(projectId);
    }
  }, [projectId, isConnected, joinProject]);

  const stats = snapshot?.stats ?? {
    transcriptSegments: 0,
    keyframes: 0,
    flashcards: 0,
    qaCards: 0,
    outlineBlocks: 0,
  };

  const stateClass = useMemo(() => {
    switch (state) {
      case 'ready':
      case 'synced':
        return 'text-emerald-400';
      case 'failed':
        return 'text-red-400';
      case 'analyzing':
      case 'streaming':
      case 'syncing':
        return 'text-amber-400';
      default:
        return 'text-text-tertiary';
    }
  }, [state]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border-subtle px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-medium ${stateClass}`}>状态：{state}</span>
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
          </div>
          <button
            onClick={() => void refreshSnapshot()}
            className="text-[10px] text-text-tertiary transition hover:text-text-secondary"
          >
            刷新
          </button>
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-text-tertiary">
          <span>转写 {stats.transcriptSegments}</span>
          <span>关键帧 {stats.keyframes}</span>
          <span>大纲 {stats.outlineBlocks}</span>
          <span>Q&A {stats.qaCards}</span>
          <span>闪卡 {stats.flashcards}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <p className="text-xs text-text-tertiary">正在加载看板...</p>
        ) : errorText ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-xs text-red-300">{errorText}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => void refreshSnapshot()}
                className="rounded-md border border-border-subtle px-2 py-1 text-[10px] text-text-tertiary transition hover:text-text-secondary"
              >
                重试连接
              </button>
              {onAnalyzeCurrent ? (
                <button
                  onClick={() => void onAnalyzeCurrent()}
                  disabled={isAnalyzingCurrent}
                  className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {isAnalyzingCurrent ? '分析中...' : '分析当前视频'}
                </button>
              ) : null}
            </div>
          </div>
        ) : timeline.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-bg-panel-secondary p-3">
            <p className="text-xs text-text-tertiary">暂无实时条目，开始分析后会自动出现关键帧与大纲。</p>
            {onAnalyzeCurrent ? (
              <button
                onClick={() => void onAnalyzeCurrent()}
                disabled={isAnalyzingCurrent}
                className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
              >
                {isAnalyzingCurrent ? '分析中...' : '分析当前视频'}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="relative space-y-2.5 pl-4">
            <div className="pointer-events-none absolute bottom-0 left-1.5 top-0 w-px bg-border-subtle" />
            {timeline.map((item) => {
              const ts = formatTimestamp(item.timestampSec);
              const isLive = Boolean(liveItems[item.id]);
              const isQa = item.type === 'QA_CARD';
              return (
                <article
                  key={item.id}
                  className={[
                    'vp-kb-card relative rounded-xl border px-3 py-2',
                    TYPE_CLASS[item.type],
                    isLive ? 'vp-kb-card-live' : '',
                    isQa ? 'vp-kb-card-qa' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div
                    className={`absolute -left-4 top-3 h-2.5 w-2.5 rounded-full border ${
                      isQa
                        ? 'border-fuchsia-400 bg-fuchsia-300'
                        : 'border-cyan-400 bg-cyan-300'
                    }`}
                  />
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-text-secondary">
                        {TYPE_LABEL[item.type]}
                      </span>
                      {isLive ? (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                          NEW
                        </span>
                      ) : null}
                      <h4 className="text-xs font-semibold text-text-secondary">{item.title}</h4>
                    </div>
                    {ts && (
                      <button
                        onClick={() => item.timestampSec != null && onTimeClick?.(item.timestampSec)}
                        className="rounded bg-bg-panel-secondary px-1.5 py-0.5 text-[10px] text-text-tertiary transition hover:text-text-secondary"
                        title="跳转到播放器时间点"
                      >
                        {ts}
                      </button>
                    )}
                  </div>

                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="mb-2 max-h-44 w-full rounded-lg object-cover"
                    />
                  ) : null}

                  {item.summary ? (
                    item.type === 'KEYFRAME_CARD' ? (
                      <TypewriterText text={item.summary} animate={isLive} />
                    ) : (
                      <p className="text-xs leading-5 text-text-secondary whitespace-pre-wrap">{item.summary}</p>
                    )
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
