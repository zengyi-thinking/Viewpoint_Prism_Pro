'use client';

import { useState } from 'react';

interface VideoItem {
  id: string;
  title: string;
  duration: string;
  thumbnail?: string;
}

// Mock data for UI skeleton
const mockVideos: VideoItem[] = [];

interface VideoSourcePanelProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function VideoSourcePanel({ collapsed = false, onToggle }: VideoSourcePanelProps) {
  const [search, setSearch] = useState('');
  const [videos] = useState<VideoItem[]>(mockVideos);

  const filtered = videos.filter((v) =>
    v.title.toLowerCase().includes(search.toLowerCase()),
  );

  // 收起状态：只显示图标
  if (collapsed) {
    return (
      <aside className="flex h-full w-full flex-col items-center py-4">
        <button
          onClick={onToggle}
          className="rounded-lg p-2 text-text-tertiary transition hover:bg-bg-panel-secondary hover:text-text-secondary"
          title="展开视频源"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="2" />
            <path d="M10 8l6 4-6 4V8z" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="panel flex h-full w-full flex-col">
      {/* Header */}
      <div className="border-b border-border-subtle p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary">视频源</h2>
          <div className="flex items-center gap-2">
            <button className="badge badge-accent">
              + 添加
            </button>
            <button
              onClick={onToggle}
              className="rounded-lg p-1 text-text-tertiary transition hover:bg-bg-panel-secondary hover:text-text-secondary"
              title="收起面板"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索视频..."
            className="input w-full py-2 pl-9 pr-3 text-xs"
          />
        </div>
      </div>

      {/* Video list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-3 text-text-tertiary opacity-30">
              <rect x="2" y="2" width="20" height="20" rx="2" />
              <path d="M10 8l6 4-6 4V8z" />
            </svg>
            <p className="text-xs text-text-tertiary">暂无视频</p>
            <p className="mt-1 text-[10px] text-text-tertiary opacity-60">点击"添加"导入视频</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((v) => (
              <button
                key={v.id}
                className="flex items-center gap-3 rounded-xl p-2 text-left transition hover:bg-bg-panel-secondary"
              >
                <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg bg-bg-panel-tertiary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-text-tertiary opacity-30">
                    <path d="M10 8l6 4-6 4V8z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-text-secondary">{v.title}</p>
                  <p className="text-[10px] text-text-tertiary">{v.duration}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
