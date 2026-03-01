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

export function VideoSourcePanel() {
  const [search, setSearch] = useState('');
  const [videos] = useState<VideoItem[]>(mockVideos);

  const filtered = videos.filter((v) =>
    v.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <aside className="flex h-full w-full flex-col border-r border-white/5 bg-[#0c0c14]">
      {/* Header */}
      <div className="border-b border-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/70">视频源</h2>
          <button className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-white/40 transition hover:bg-white/10 hover:text-white/60">
            + 添加
          </button>
        </div>
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索视频..."
            className="w-full rounded-lg border border-white/5 bg-white/[0.03] py-2 pl-9 pr-3 text-xs text-white placeholder-white/20 outline-none transition focus:border-white/15"
          />
        </div>
      </div>

      {/* Video list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1" opacity="0.1" className="mb-3">
              <rect x="2" y="2" width="20" height="20" rx="2" />
              <path d="M10 8l6 4-6 4V8z" />
            </svg>
            <p className="text-xs text-white/20">暂无视频</p>
            <p className="mt-1 text-[10px] text-white/10">点击上方"添加"导入视频</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((v) => (
              <button
                key={v.id}
                className="flex items-center gap-3 rounded-lg p-2 text-left transition hover:bg-white/5"
              >
                <div className="flex h-10 w-16 flex-shrink-0 items-center justify-center rounded bg-white/5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white" opacity="0.2">
                    <path d="M10 8l6 4-6 4V8z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-white/60">{v.title}</p>
                  <p className="text-[10px] text-white/20">{v.duration}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
