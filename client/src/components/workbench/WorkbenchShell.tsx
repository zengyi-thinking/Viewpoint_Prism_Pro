'use client';

import { useEffect, useRef, useState } from 'react';
import { VideoSourcePanel } from './VideoSourcePanel';
import { PlayerCenter } from './PlayerCenter';
import { ChatDock } from './ChatDock';
import { PrismSwitcher } from './PrismSwitcher';
import { ThemeSelector } from '@/components/theme';
import Link from 'next/link';
import { useWorkbenchStore } from '@/stores/workbench.store';
import { projectApi } from '@/services/project.api';

const LEFT_MIN_WIDTH = 220;
const RIGHT_MIN_WIDTH = 260;
const CENTER_MIN_WIDTH = 400;
const COLLAPSED_WIDTH = 48;

type DragTarget = 'left' | 'right' | null;

export function WorkbenchShell({ projectName, projectId }: { projectName?: string; projectId?: string }) {
  const requestSeekTo = useWorkbenchStore((s) => s.requestSeekTo);
  const activePrism = useWorkbenchStore((s) => s.activePrism);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null); // 共享的视频引用，用于画面分析
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(320);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(projectName || '工作台');
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // 创作棱镜模式：空间折叠
  const isCreationMode = activePrism === 'creation';
  const effectiveLeftCollapsed = leftCollapsed || isCreationMode;

  useEffect(() => {
    const applyResponsiveCollapse = () => {
      const width = window.innerWidth;
      if (width < 1280) setLeftCollapsed(true);
      if (width < 1100) setRightCollapsed(true);
    };
    applyResponsiveCollapse();
    window.addEventListener('resize', applyResponsiveCollapse);
    return () => window.removeEventListener('resize', applyResponsiveCollapse);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const totalWidth = containerRef.current.getBoundingClientRect().width;
    const suggestedLeft = Math.round(Math.min(320, Math.max(LEFT_MIN_WIDTH, totalWidth * 0.18)));
    const suggestedRight = Math.round(Math.min(380, Math.max(RIGHT_MIN_WIDTH, totalWidth * 0.22)));
    setLeftWidth(suggestedLeft);
    setRightWidth(suggestedRight);
  }, []);

  useEffect(() => {
    setTitleDraft(projectName || '工作台');
  }, [projectName]);

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
        setLeftCollapsed((prev) => !prev);
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

  const commitProjectTitle = async () => {
    const trimmed = titleDraft.trim();
    const fallback = projectName || '工作台';
    const nextTitle = trimmed || fallback;
    setTitleDraft(nextTitle);
    setIsEditingTitle(false);

    if (!projectId || !nextTitle || nextTitle === projectName) return;

    setIsSavingTitle(true);
    try {
      await projectApi.update(projectId, { name: nextTitle });
    } catch (error) {
      console.error('Failed to update project title:', error);
      setTitleDraft(fallback);
    } finally {
      setIsSavingTitle(false);
    }
  };

  return (
    <div className="workbench-shell flex h-dvh min-h-0 flex-col bg-bg-primary text-text-primary">
      {/* Top bar */}
      <header className="flex h-[clamp(56px,6.2vh,72px)] shrink-0 items-center justify-between border-b border-border bg-bg-panel px-[clamp(14px,1.8vw,26px)]">
        <div className="flex items-center gap-[clamp(8px,1vw,14px)]">
          <Link href="/projects" className="flex items-center gap-2 text-text-secondary transition-all duration-[var(--transition-base)] hover:text-text-primary hover:scale-105">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="h-5 w-px bg-border" />
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none" className="shrink-0">
            <defs>
              <linearGradient id="wlg" x1="0" y1="0" x2="28" y2="28">
                <stop offset="0%" stopColor="#FF6B35" />
                <stop offset="50%" stopColor="#E91E8C" />
                <stop offset="100%" stopColor="#4F46E5" />
              </linearGradient>
            </defs>
            <path d="M14 2L26 24H2L14 2Z" stroke="url(#wlg)" strokeWidth="1.5" fill="none" />
          </svg>
          {isEditingTitle ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitProjectTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void commitProjectTitle();
                }
                if (e.key === 'Escape') {
                  setTitleDraft(projectName || '工作台');
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
              className="h-9 w-[clamp(180px,28vw,360px)] rounded-lg border border-border bg-bg-panel-secondary px-3 text-[clamp(17px,1.15vw,22px)] font-semibold text-text-primary outline-none transition focus:border-[#E91E8C]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingTitle(true)}
              className="wb-title rounded-md px-1 py-0.5 text-left transition hover:bg-bg-panel-secondary"
              title="点击编辑工程标题"
            >
              {titleDraft}
            </button>
          )}
          {isSavingTitle ? <span className="wb-meta">保存中...</span> : null}
        </div>

        <div className="flex items-center gap-[clamp(6px,0.8vw,10px)]">
          {/* Engine status indicator */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-panel-secondary px-2.5 py-1 transition-all duration-[var(--transition-base)] hover:border-border">
            <span className="status-dot status-dot-warning" />
            <span className="wb-meta">引擎待配置</span>
          </div>

          {/* Theme toggle (sun/moon icon) */}
          <ThemeSelector />
        </div>
      </header>

      {/* Main content area */}
      <div className="wb-main-gap flex min-h-0 flex-1">
        <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden gap-0">
          {/* Left: Video Source Panel */}
          <div
            data-testid="left-panel"
            className={`flex h-full shrink-0 transition-all duration-[var(--transition-base)] ${
              effectiveLeftCollapsed ? 'panel-collapsed' : ''
            }`}
            style={{ width: effectiveLeftCollapsed ? `${COLLAPSED_WIDTH}px` : `${leftWidth}px` }}
          >
            <VideoSourcePanel projectId={projectId} collapsed={effectiveLeftCollapsed} onToggle={() => setLeftCollapsed((prev) => !prev)} />
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            data-testid="resize-handle-left"
            onMouseDown={() => setDragging('left')}
            className={`panel-separator relative w-1.5 cursor-col-resize transition-all duration-[var(--transition-slow)] ${
              dragging === 'left' ? 'dragging' : ''
            } ${isCreationMode ? 'opacity-0 pointer-events-none' : ''}`}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-subtle" />
          </div>

          {!isCreationMode ? (
            <div
              data-testid="center-panel"
              className="relative min-w-0 flex flex-1 flex-col overflow-hidden transition-all duration-[var(--transition-slower)]"
            >
              <div className="grid min-w-0 min-h-0 flex-1 grid-rows-[minmax(220px,42svh)_1px_minmax(0,1fr)] overflow-hidden">
                <PlayerCenter videoRef={videoPlayerRef} />

                {/* Separator between Player and Chat */}
                <div className="shrink-0 h-px bg-border-subtle" />

                <div className="min-h-0">
                  <ChatDock projectId={projectId} videoPlayerRef={videoPlayerRef} />
                </div>
              </div>
            </div>
          ) : null}

          <div
            role="separator"
            aria-orientation="vertical"
            data-testid="resize-handle-right"
            onMouseDown={() => setDragging('right')}
            className={`panel-separator relative w-1.5 cursor-col-resize transition-all duration-[var(--transition-slow)] ${
              dragging === 'right' ? 'dragging' : ''
            } ${isCreationMode ? 'opacity-0 pointer-events-none w-0' : ''}`}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-subtle" />
          </div>

          {/* Right: Prism Studio Panel (2x2 grid) - 创作模式时展开 */}
          <div
            data-testid="right-panel"
            className={`flex h-full min-w-0 overflow-hidden rounded-[16px] border border-border bg-bg-panel transition-all duration-[var(--transition-slower)] ${
              rightCollapsed ? 'panel-collapsed' : ''
            } ${isCreationMode ? 'flex-1 shrink min-w-0' : 'shrink-0'}`}
            style={isCreationMode ? {} : { width: rightCollapsed ? `${COLLAPSED_WIDTH}px` : `${rightWidth}px` }}
          >
            <PrismSwitcher
              collapsed={rightCollapsed}
              onToggle={() => setRightCollapsed(!rightCollapsed)}
              onTimeClick={requestSeekTo}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
