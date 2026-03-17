'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { projectApi } from '@/services/project.api';
import { ThemeSelector } from '@/components/theme';
import { PrismSwitcher } from './PrismSwitcher';
import { VideoSourcePanel } from './VideoSourcePanel';
import { PlayerCenter } from './PlayerCenter';
import { ChatDock } from './ChatDock';
import { useWorkbenchStore } from '@/stores/workbench.store';

const LEFT_MIN_WIDTH = 220;
const RIGHT_MIN_WIDTH = 260;
const CENTER_MIN_WIDTH = 420;
const COLLAPSED_WIDTH = 48;

type DragTarget = 'left' | 'right' | null;

export function WorkbenchShell({ projectName, projectId }: { projectName?: string; projectId?: string }) {
  const requestSeekTo = useWorkbenchStore((state) => state.requestSeekTo);
  const activePrism = useWorkbenchStore((state) => state.activePrism);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(340);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(projectName || '工作台');
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  const isStudioMode = Boolean(activePrism);
  const effectiveLeftCollapsed = leftCollapsed || isStudioMode;
  const rightPanelWidth = `${rightWidth}px`;

  useEffect(() => {
    const applyResponsiveCollapse = () => {
      if (window.innerWidth < 1280) setLeftCollapsed(true);
      if (window.innerWidth < 1120) setRightCollapsed(true);
    };
    applyResponsiveCollapse();
    window.addEventListener('resize', applyResponsiveCollapse);
    return () => window.removeEventListener('resize', applyResponsiveCollapse);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const totalWidth = containerRef.current.getBoundingClientRect().width;
    setLeftWidth(Math.round(Math.min(330, Math.max(LEFT_MIN_WIDTH, totalWidth * 0.18))));
    setRightWidth(Math.round(Math.min(400, Math.max(RIGHT_MIN_WIDTH, totalWidth * 0.24))));
  }, []);

  useEffect(() => {
    setTitleDraft(projectName || '工作台');
  }, [projectName]);

  useEffect(() => {
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

    const onMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (dragging === 'left') {
        const rawLeft = event.clientX - rect.left;
        const maxLeft = Math.max(LEFT_MIN_WIDTH, rect.width - rightWidth - CENTER_MIN_WIDTH);
        setLeftWidth(clamp(rawLeft, LEFT_MIN_WIDTH, maxLeft));
      }

      if (dragging === 'right') {
        const rawRight = rect.right - event.clientX;
        const maxRight = Math.max(RIGHT_MIN_WIDTH, rect.width - leftWidth - CENTER_MIN_WIDTH);
        setRightWidth(clamp(rawRight, RIGHT_MIN_WIDTH, maxRight));
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
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.contentEditable === 'true') return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault();
        setLeftCollapsed((prev) => !prev);
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'B') {
        event.preventDefault();
        setRightCollapsed((prev) => !prev);
      }
      if (event.key === 'Escape' && (leftCollapsed || rightCollapsed)) {
        setLeftCollapsed(false);
        setRightCollapsed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [leftCollapsed, rightCollapsed]);

  const commitProjectTitle = async () => {
    const nextTitle = titleDraft.trim() || projectName || '工作台';
    setTitleDraft(nextTitle);
    setIsEditingTitle(false);
    if (!projectId || nextTitle === projectName) return;
    setIsSavingTitle(true);
    try {
      await projectApi.update(projectId, { name: nextTitle });
    } catch {
      setTitleDraft(projectName || '工作台');
    } finally {
      setIsSavingTitle(false);
    }
  };

  return (
    <div className="workbench-shell flex h-dvh min-h-0 flex-col bg-bg-primary text-text-primary">
      <header className="border-b border-stroke-default bg-[color:color-mix(in_srgb,var(--bg-surface)_88%,transparent)] backdrop-blur-xl">
        <div className="flex h-[72px] items-center justify-between gap-4 px-[clamp(14px,1.8vw,26px)]">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/projects" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stroke-default bg-bg-panel-secondary/70 text-text-secondary transition hover:text-text-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-stroke-default bg-bg-panel-secondary/70">
              <svg width="20" height="20" viewBox="0 0 28 28" fill="none"><path d="M14 2L26 24H2L14 2Z" stroke="url(#workbench-prism)" strokeWidth="1.6" /><defs><linearGradient id="workbench-prism" x1="2" y1="2" x2="26" y2="24"><stop offset="0%" stopColor="var(--prism-orange)" /><stop offset="50%" stopColor="var(--prism-pink)" /><stop offset="100%" stopColor="var(--prism-indigo)" /></linearGradient></defs></svg>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Current Workspace</div>
              {isEditingTitle ? (
                <input
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => void commitProjectTitle()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void commitProjectTitle();
                    if (event.key === 'Escape') {
                      setTitleDraft(projectName || '工作台');
                      setIsEditingTitle(false);
                    }
                  }}
                  autoFocus
                  className="mt-1 h-10 w-[clamp(220px,28vw,360px)] rounded-full border border-stroke-default bg-bg-panel-secondary/75 px-4 text-base font-semibold outline-none focus:border-[var(--accent-primary)]"
                />
              ) : (
                <button type="button" onClick={() => setIsEditingTitle(true)} className="wb-title mt-1 max-w-[30vw] truncate rounded-full border border-transparent px-1 py-1 text-left hover:border-stroke-default">
                  {titleDraft}
                </button>
              )}
            </div>
            {isSavingTitle ? <StatusMini text="保存中" /> : null}
          </div>

          <div className="flex items-center gap-3">
            <StatusMini text={activePrism ? `当前棱镜 · ${activePrism}` : 'Prism Studio 待命'} tone={activePrism ? 'info' : 'warning'} />
            <ThemeSelector />
          </div>
        </div>
      </header>

      <div className="wb-main-gap flex min-h-0 flex-1">
        <div ref={containerRef} className="flex min-h-0 flex-1 gap-0 overflow-hidden">
          {isStudioMode ? (
            <div className="flex min-w-0 flex-1 overflow-hidden rounded-[24px] border border-stroke-default bg-bg-panel shadow-[var(--shadow-card)]">
              <PrismSwitcher collapsed={false} onToggle={() => setRightCollapsed((prev) => !prev)} onTimeClick={requestSeekTo} projectId={projectId} />
            </div>
          ) : (
            <>
              <div
                className={`${effectiveLeftCollapsed ? 'panel-collapsed' : ''} flex h-full shrink-0 overflow-hidden rounded-[24px] border border-stroke-default bg-bg-panel shadow-[var(--shadow-card)] transition-all duration-[var(--transition-base)]`}
                style={{ width: effectiveLeftCollapsed ? `${COLLAPSED_WIDTH}px` : `${leftWidth}px` }}
              >
                <VideoSourcePanel projectId={projectId} collapsed={effectiveLeftCollapsed} onToggle={() => setLeftCollapsed((prev) => !prev)} />
              </div>

              <div role="separator" aria-orientation="vertical" onMouseDown={() => setDragging('left')} className={`panel-separator relative w-2 cursor-col-resize ${dragging === 'left' ? 'dragging' : ''}`}>
                <div className="absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-stroke-default" />
              </div>

              <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-stroke-default bg-bg-panel shadow-[var(--shadow-card)]">
                <div className="grid min-h-0 flex-1 grid-rows-[minmax(240px,43svh)_1px_minmax(0,1fr)] overflow-hidden">
                  <PlayerCenter videoRef={videoPlayerRef} />
                  <div className="bg-stroke-default" />
                  <ChatDock projectId={projectId} videoPlayerRef={videoPlayerRef} />
                </div>
              </div>

              <div role="separator" aria-orientation="vertical" onMouseDown={() => setDragging('right')} className={`panel-separator relative w-2 cursor-col-resize ${dragging === 'right' ? 'dragging' : ''}`}>
                <div className="absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-stroke-default" />
              </div>

              <div className={`${rightCollapsed ? 'panel-collapsed' : ''} flex h-full min-w-0 shrink-0 overflow-hidden rounded-[24px] border border-stroke-default bg-bg-panel shadow-[var(--shadow-card)] transition-all duration-[var(--transition-slow)]`} style={{ width: rightCollapsed ? `${COLLAPSED_WIDTH}px` : rightPanelWidth }}>
                <PrismSwitcher collapsed={rightCollapsed} onToggle={() => setRightCollapsed((prev) => !prev)} onTimeClick={requestSeekTo} projectId={projectId} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusMini({ text, tone = 'default' }: { text: string; tone?: 'default' | 'info' | 'warning'; }) {
  const dot = tone === 'info' ? 'var(--signal-info)' : tone === 'warning' ? 'var(--signal-warning)' : 'var(--signal-success)';
  return (
    <div className="hidden items-center gap-2 rounded-full border border-stroke-default bg-bg-panel-secondary/70 px-3 py-2 text-xs text-text-secondary lg:flex">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      <span>{text}</span>
    </div>
  );
}
