'use client';

import { useEffect, useRef, useState } from 'react';
import { VideoSourcePanel } from './VideoSourcePanel';
import { PlayerCenter } from './PlayerCenter';
import { ChatDock } from './ChatDock';
import { PrismSwitcher } from './PrismSwitcher';
import Link from 'next/link';

const LEFT_MIN_WIDTH = 220;
const RIGHT_MIN_WIDTH = 260;
const CENTER_MIN_WIDTH = 520;

type DragTarget = 'left' | 'right' | null;

export function WorkbenchShell({ projectName }: { projectName?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(320);
  const [dragging, setDragging] = useState<DragTarget>(null);

  useEffect(() => {
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const totalWidth = rect.width;

      if (dragging === 'left') {
        const rawLeft = e.clientX - rect.left;
        const maxLeft = Math.max(LEFT_MIN_WIDTH, totalWidth - rightWidth - CENTER_MIN_WIDTH);
        setLeftWidth(clamp(rawLeft, LEFT_MIN_WIDTH, maxLeft));
        return;
      }

      const rawRight = rect.right - e.clientX;
      const maxRight = Math.max(RIGHT_MIN_WIDTH, totalWidth - leftWidth - CENTER_MIN_WIDTH);
      setRightWidth(clamp(rawRight, RIGHT_MIN_WIDTH, maxRight));
    };

    const onMouseUp = () => setDragging(null);

    if (dragging) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, leftWidth, rightWidth]);

  useEffect(() => {
    const keepLayoutValid = () => {
      if (!containerRef.current) return;
      const totalWidth = containerRef.current.getBoundingClientRect().width;

      const leftMax = Math.max(LEFT_MIN_WIDTH, totalWidth - rightWidth - CENTER_MIN_WIDTH);
      if (leftWidth > leftMax) {
        setLeftWidth(leftMax);
      }

      const rightMax = Math.max(RIGHT_MIN_WIDTH, totalWidth - leftWidth - CENTER_MIN_WIDTH);
      if (rightWidth > rightMax) {
        setRightWidth(rightMax);
      }
    };

    keepLayoutValid();
    window.addEventListener('resize', keepLayoutValid);
    return () => window.removeEventListener('resize', keepLayoutValid);
  }, [leftWidth, rightWidth]);

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0f] text-white">
      {/* Top bar */}
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-white/5 bg-[#0c0c14] px-4">
        <div className="flex items-center gap-3">
          <Link href="/projects" className="flex items-center gap-2 text-white/40 transition hover:text-white/70">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
            <defs>
              <linearGradient id="wlg" x1="0" y1="0" x2="28" y2="28">
                <stop offset="0%" stopColor="#FF6B35" />
                <stop offset="50%" stopColor="#E91E8C" />
                <stop offset="100%" stopColor="#4F46E5" />
              </linearGradient>
            </defs>
            <path d="M14 2L26 24H2L14 2Z" stroke="url(#wlg)" strokeWidth="1.5" fill="none" />
          </svg>
          <span className="text-sm font-medium text-white/60">{projectName || '工作台'}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Engine status indicator */}
          <div className="flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
            <span className="text-[10px] text-white/30">引擎待配置</span>
          </div>
          <Link href="/settings" className="rounded-md p-1.5 text-white/30 transition hover:bg-white/5 hover:text-white/60">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </Link>
        </div>
      </header>

      {/* Main content area */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Left: Video Source Panel */}
        <div
          data-testid="left-panel"
          className="flex h-full flex-shrink-0"
          style={{ width: `${leftWidth}px` }}
        >
          <VideoSourcePanel />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          data-testid="resize-handle-left"
          onMouseDown={() => setDragging('left')}
          className="group relative w-1.5 cursor-col-resize bg-white/[0.03] transition hover:bg-white/[0.08]"
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10 group-hover:bg-white/30" />
        </div>

        {/* Center: Player + Chat */}
        <div data-testid="center-panel" className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <PlayerCenter />
          <ChatDock />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          data-testid="resize-handle-right"
          onMouseDown={() => setDragging('right')}
          className="group relative w-1.5 cursor-col-resize bg-white/[0.03] transition hover:bg-white/[0.08]"
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10 group-hover:bg-white/30" />
        </div>

        {/* Right: Prism Studio Panel (2x2 grid) */}
        <div
          data-testid="right-panel"
          className="flex h-full flex-shrink-0 border-l border-white/5 bg-[#0c0c14]"
          style={{ width: `${rightWidth}px` }}
        >
          <PrismSwitcher />
        </div>
      </div>
    </div>
  );
}
