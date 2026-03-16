'use client';

import { DiffractionPanel } from '@/components/prisms/diffraction/DiffractionPanel';
import { CreationCanvas } from '@/components/prisms/creation';
import { KnowledgeBoard } from '@/components/prisms/knowledge';
import { TranslationPanel } from '@/components/prisms/translation/TranslationPanel';
import { EmptyState, StatusPill, SurfaceCard } from '@/components/system';
import { type PrismType, useWorkbenchStore } from '@/stores/workbench.store';

const prisms: { type: PrismType; label: string; subtitle: string; color: string; icon: React.ReactNode }[] = [
  {
    type: 'knowledge',
    label: '知识棱镜',
    subtitle: '实时看板、结构化大纲、学习卡片',
    color: 'var(--prism-amber)',
    icon: <path d="M4 4h6a4 4 0 0 1 4 4v12a2 2 0 0 0-2-2H4zM20 4h-6a4 4 0 0 0-4 4v12a2 2 0 0 1 2-2h8z" />,
  },
  {
    type: 'creation',
    label: '创作棱镜',
    subtitle: '导演对话、节点画布、任务导出',
    color: 'var(--prism-pink)',
    icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></>,
  },
  {
    type: 'translation',
    label: '翻译棱镜',
    subtitle: '字幕、音色、修复、导出',
    color: 'var(--prism-cyan)',
    icon: <><path d="M4 6h10" /><path d="M9 6c0 6-3 10-6 12" /><path d="M8 12c1.2 1.8 2.7 3.3 4.5 4.5" /><path d="M16 8l4 10" /><path d="M14.5 14h6" /></>,
  },
  {
    type: 'diffraction',
    label: '衍射棱镜',
    subtitle: '平台策略、素材篮、草稿预览',
    color: 'var(--prism-indigo)',
    icon: <><path d="M4 12h7" /><path d="M4 7v10" /><path d="M12 7l4 5-4 5" /><path d="M16 7l4 5-4 5" /></>,
  },
];

export function PrismSwitcher({ collapsed = false, onToggle, onTimeClick, projectId }: { collapsed?: boolean; onToggle?: () => void; onTimeClick?: (timestamp: number) => void; projectId?: string; }) {
  const activePrism = useWorkbenchStore((state) => state.activePrism);
  const setActivePrism = useWorkbenchStore((state) => state.setActivePrism);
  const hasActivePrism = Boolean(activePrism);

  if (collapsed) {
    return (
      <div className="flex h-full w-full flex-col items-center py-4">
        <button type="button" onClick={onToggle} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stroke-default bg-bg-panel-secondary/70 text-text-secondary transition hover:text-text-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-stroke-default px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Prism Studio</div>
            <div className="mt-1 text-lg font-semibold text-text-primary">切换当前产线</div>
          </div>
          <div className="flex items-center gap-2">
            {hasActivePrism ? <StatusPill tone="info">已进入 {prisms.find((item) => item.type === activePrism)?.label}</StatusPill> : null}
            {hasActivePrism ? (
              <button type="button" onClick={() => setActivePrism(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stroke-default bg-bg-panel-secondary/70 text-text-secondary transition hover:text-text-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {!hasActivePrism ? (
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {prisms.map((prism) => (
            <button
              key={prism.type}
              type="button"
              onClick={() => setActivePrism(prism.type)}
              className="rounded-[22px] border border-stroke-default bg-bg-panel-secondary/65 p-4 text-left transition hover:border-stroke-strong hover:bg-bg-panel-secondary"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-stroke-default bg-bg-panel" style={{ color: prism.color }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{prism.icon}</svg>
                </div>
                <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ background: prism.color }} />
              </div>
              <div className="mt-4 text-base font-semibold text-text-primary">{prism.label}</div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{prism.subtitle}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="min-h-0 flex-1 p-2">
          <PrismActivePanel projectId={projectId} onTimeClick={onTimeClick} />
        </div>
      )}
    </div>
  );
}

function PrismActivePanel({ projectId, onTimeClick }: { projectId?: string; onTimeClick?: (timestamp: number) => void; }) {
  const activePrism = useWorkbenchStore((state) => state.activePrism);
  const currentVideo = useWorkbenchStore((state) => state.currentVideo);
  if (!activePrism) return null;

  const currentPrism = prisms.find((item) => item.type === activePrism);
  const requiresVideo = activePrism !== 'creation';

  if (requiresVideo && !currentVideo) {
    return (
      <EmptyState
        title="当前还没有绑定视频"
        description="先在左侧视频源面板中选择一个视频，再进入对应棱镜的操作界面。"
        className="h-full"
        icon={<span className="text-lg" style={{ color: currentPrism?.color }}>△</span>}
      />
    );
  }

  if (activePrism === 'knowledge' && currentVideo) {
    return <SurfaceCard className="h-full overflow-hidden p-0"><KnowledgeBoard videoId={currentVideo.id} onTimeClick={onTimeClick} /></SurfaceCard>;
  }

  if (activePrism === 'creation') {
    return <div className="h-full overflow-hidden rounded-[22px] border border-stroke-default bg-bg-panel-secondary/50"><CreationCanvas projectId={projectId} /></div>;
  }

  if (activePrism === 'translation' && currentVideo) {
    return <SurfaceCard className="h-full overflow-hidden p-0"><TranslationPanel videoId={currentVideo.id} onTimeClick={onTimeClick} /></SurfaceCard>;
  }

  if (activePrism === 'diffraction' && currentVideo) {
    return <SurfaceCard className="h-full overflow-hidden p-0"><DiffractionPanel videoId={currentVideo.id} onTimeClick={onTimeClick} /></SurfaceCard>;
  }

  return null;
}
