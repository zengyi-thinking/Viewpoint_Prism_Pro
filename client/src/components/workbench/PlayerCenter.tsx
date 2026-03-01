'use client';

export function PlayerCenter() {
  return (
    <div className="panel flex flex-1 flex-col rounded-none border-x-0 border-t-0">
      {/* Video Player Area */}
      <div className="flex flex-1 items-center justify-center bg-bg-panel-tertiary">
        <div className="flex flex-col items-center gap-3">
          {/* Play button placeholder */}
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-bg-panel-secondary">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-text-tertiary opacity-30">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <p className="text-sm text-text-tertiary">选择左侧视频开始播放</p>
        </div>
      </div>

      {/* Timeline / Controls bar */}
      <div className="flex h-12 items-center gap-4 border-t border-border bg-bg-panel px-4">
        {/* Play/Pause */}
        <button className="text-text-tertiary transition hover:text-text-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        {/* Time */}
        <span className="text-xs font-mono text-text-tertiary">00:00 / 00:00</span>
        {/* Progress bar */}
        <div className="flex-1">
          <div className="h-1 rounded-full bg-bg-panel-tertiary">
            <div className="h-full w-0 rounded-full bg-gradient-to-r from-[#FF6B35] to-[#E91E8C]" />
          </div>
        </div>
        {/* Volume */}
        <button className="text-text-tertiary transition hover:text-text-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
          </svg>
        </button>
        {/* Fullscreen */}
        <button className="text-text-tertiary transition hover:text-text-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
