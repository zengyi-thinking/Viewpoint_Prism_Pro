'use client';

import { useEffect, useRef, useState } from 'react';
import { VideoSourcePanel } from './VideoSourcePanel';
import { PlayerCenter } from './PlayerCenter';
import { ChatDock } from './ChatDock';
import { PrismSwitcher } from './PrismSwitcher';
import { ThemeSelector } from '@/components/theme';
import Link from 'next/link';

const LEFT_MIN_WIDTH = 220;
const RIGHT_MIN_WIDTH = 260;
const CENTER_MIN_WIDTH = 400;
const COLLAPSED_WIDTH = 48;

type DragTarget = 'left' | 'right' | null;

export function WorkbenchShell({ projectName, projectId }: { projectName?: string; projectId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(320);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [dragging, setDragging] = useState<DragTarget>(null);

  useEffect(() => {
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

    const onMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();

      if (dragging === 'left') {
        const totalWidth = rect.width;
        const rawLeft = e.clientX - rect.left;
        const maxLeft = Math.max(LEFT_MIN_WIDTH, totalWidth - rightWidth - CENTER_MIN_WIDTH);
        setLeftWidth(clamp(rawLeft, LEFT_MIN_WIDTH, maxLeft));
        return;
      }

      if (dragging === 'right') {
        const totalWidth = rect.width;
        const rawRight = rect.right - e.clientX;
        const maxRight = Math.max(RIGHT_MIN_WIDTH, totalWidth - leftWidth - CENTER_MIN_WIDTH);
        setRightWidth(clamp(rawRight, RIGHT_MIN_WIDTH, maxRight));
        return;
      }
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        return;
      }

      // Ctrl/Cmd + B: Toggle left panel
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setLeftCollapsed(!leftCollapsed);
      }

      // Ctrl/Cmd + Shift + B: Toggle right panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        setRightCollapsed(!rightCollapsed);
      }

      // Ctrl/Cmd + K: Open command palette (placeholder)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        // TODO: Open command palette
        console.log('Command palette shortcut triggered');
      }

      // Escape: Reset panel collapses
      if (e.key === 'Escape') {
        if (leftCollapsed || rightCollapsed) {
          setLeftCollapsed(false);
          setRightCollapsed(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [leftCollapsed, rightCollapsed]);

  return (
    <div className="flex h-screen flex-col bg-bg-primary text-text-primary">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-bg-panel px-4">
        <div className="flex items-center gap-3">
          <Link href="/projects" className="flex items-center gap-2 text-text-secondary transition hover:text-text-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="h-4 w-px bg-border" />
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
          <span className="text-sm font-medium text-text-secondary">{projectName || '工作台'}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Engine status indicator */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-panel-secondary px-2.5 py-1">
            <span className="status-dot status-dot-warning" />
            <span className="text-[10px] text-text-tertiary">引擎待配置</span>
          </div>

          {/* Theme toggle (sun/moon icon) */}
          <ThemeSelector />
        </div>
      </header>

      {/* Main content area */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Left: Video Source Panel */}
        <div
          data-testid="left-panel"
          className={`flex h-full shrink-0 transition-all duration-200 ${
            leftCollapsed ? 'panel-collapsed' : ''
          }`}
          style={{ width: leftCollapsed ? `${COLLAPSED_WIDTH}px` : `${leftWidth}px` }}
        >
          <VideoSourcePanel projectId={projectId} collapsed={leftCollapsed} onToggle={() => setLeftCollapsed(!leftCollapsed)} />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          data-testid="resize-handle-left"
          onMouseDown={() => setDragging('left')}
          className={`panel-separator relative w-1.5 cursor-col-resize ${
            dragging === 'left' ? 'dragging' : ''
          }`}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-subtle" />
        </div>

        {/* Center: Player + Chat */}
        <div data-testid="center-panel" className="flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <PlayerCenter />

          {/* Separator between Player and Chat */}
          <div className="shrink-0 h-px bg-border-subtle" />

          <ChatDock />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          data-testid="resize-handle-right"
          onMouseDown={() => setDragging('right')}
          className={`panel-separator relative w-1.5 cursor-col-resize ${
            dragging === 'right' ? 'dragging' : ''
          }`}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-subtle" />
        </div>

        {/* Right: Prism Studio Panel (2x2 grid) */}
        <div
          data-testid="right-panel"
          className={`flex h-full shrink-0 border-l border-border bg-bg-panel transition-all duration-200 ${
            rightCollapsed ? 'panel-collapsed' : ''
          }`}
          style={{ width: rightCollapsed ? `${COLLAPSED_WIDTH}px` : `${rightWidth}px` }}
        >
          <PrismSwitcher collapsed={rightCollapsed} onToggle={() => setRightCollapsed(!rightCollapsed)} />
        </div>
      </div>
    </div>
  );
}
