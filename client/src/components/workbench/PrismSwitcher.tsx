'use client';

import { useWorkbenchStore, PrismType } from '@/stores/workbench.store';
import { KnowledgeBoard } from '@/components/prisms/knowledge';
import { CreationCanvas } from '@/components/prisms/creation/CreationCanvas';
import { TranslationPanel } from '@/components/prisms/translation/TranslationPanel';
import { DiffractionPanel } from '@/components/prisms/diffraction/DiffractionPanel';

const prisms: { type: PrismType; label: string; subtitle: string; color: string; icon: React.ReactNode }[] = [
  {
    type: 'knowledge',
    label: '知识棱镜',
    subtitle: '结构化笔记 · 闪卡',
    color: '#F59E0B',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    type: 'creation',
    label: '创作棱镜',
    subtitle: 'PrismFlow · 节点编辑',
    color: '#E91E8C',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8" /><path d="M12 8v8" />
      </svg>
    ),
  },
  {
    type: 'translation',
    label: '译制棱镜',
    subtitle: '多语种 · 音色克隆',
    color: '#06B6D4',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
        <path d="M22 22l-5-10-5 10" /><path d="M14 18h6" />
      </svg>
    ),
  },
  {
    type: 'diffraction',
    label: '衍射棱镜',
    subtitle: '多平台图文分发',
    color: '#4F46E5',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12h8" /><path d="M4 18V6" />
        <path d="M16 6l4 6-4 6" /><path d="M12 6l4 6-4 6" />
      </svg>
    ),
  },
];

interface PrismSwitcherProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onTimeClick?: (timestamp: number) => void;
  videoId?: string; // 添加 videoId prop
}

export function PrismSwitcher({ collapsed = false, onToggle, onTimeClick }: PrismSwitcherProps) {
  const { activePrism, setActivePrism } = useWorkbenchStore();
  const hasActivePrism = Boolean(activePrism);

  // 收起状态：只显示图标
  if (collapsed) {
    return (
      <div className="flex h-full w-full flex-col items-center py-4">
        <button
          onClick={onToggle}
          className="rounded-lg p-2 text-text-tertiary transition hover:bg-bg-panel-secondary hover:text-text-secondary"
          title="展开棱镜面板"
        >
          <svg width="18" height="18" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2L26 24H2L14 2Z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-[16px]">
      {/* Studio header */}
      <div className="border-b border-border-subtle px-[clamp(10px,1.2vw,16px)] py-[clamp(9px,1vw,12px)]">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-[clamp(6px,0.8vw,10px)]">
            <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
              <defs>
                <linearGradient id="psg" x1="0" y1="0" x2="28" y2="28">
                  <stop offset="0%" stopColor="#FF6B35" />
                  <stop offset="50%" stopColor="#E91E8C" />
                  <stop offset="100%" stopColor="#4F46E5" />
                </linearGradient>
              </defs>
              <path d="M14 2L26 24H2L14 2Z" stroke="url(#psg)" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="wb-section-title truncate">Studio</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 pr-1">
            {hasActivePrism ? (
              <button
                onClick={() => setActivePrism(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary transition-all duration-[var(--transition-base)] hover:bg-bg-panel-tertiary hover:text-text-primary active:scale-95"
                title="返回棱镜选择"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 2x2 Prism card grid */}
      <div
        className={[
          'overflow-hidden transition-all duration-[var(--transition-slow)] ease-out',
          hasActivePrism
            ? 'max-h-0 opacity-0 -translate-y-2 pointer-events-none'
            : 'max-h-[260px] opacity-100 translate-y-0',
        ].join(' ')}
      >
        <div className="grid grid-cols-2 gap-[clamp(8px,1vw,12px)] p-[clamp(10px,1.2vw,16px)]">
        {prisms.map((p) => {
          const isActive = activePrism === p.type;
          return (
            <button
              key={p.type}
              onClick={() => setActivePrism(isActive ? null : p.type)}
              className="group relative flex flex-col items-start gap-2 rounded-xl border p-[clamp(8px,1vw,12px)] text-left transition-all duration-[var(--transition-base)] hover:scale-[1.01] active:scale-[0.99] shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-sm)]"
              style={{
                borderColor: isActive ? `${p.color}40` : 'var(--border-subtle)',
                background: isActive ? `${p.color}10` : 'var(--bg-panel-secondary)',
              }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-[var(--transition-base)] group-hover:scale-105"
                style={{
                  background: `${p.color}12`,
                  color: isActive ? p.color : 'var(--text-tertiary)',
                }}
              >
                {p.icon}
              </div>
              <div>
                <div className="text-[12px] font-semibold leading-tight" style={{ color: isActive ? p.color : 'var(--text-primary)' }}>
                  {p.label}
                </div>
                <div className="mt-0.5 text-[10px] leading-tight text-text-tertiary">{p.subtitle}</div>
              </div>
              {isActive && (
                <span
                  className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{ background: p.color, boxShadow: `0 0 6px ${p.color}` }}
                />
              )}
            </button>
          );
        })}
        </div>
      </div>

      {/* Active prism panel area */}
      <div
        className={[
          'relative min-h-0 flex-1 overflow-hidden transition-all duration-300 ease-out',
          hasActivePrism
            ? 'opacity-100 translate-y-0'
            : 'opacity-100 translate-y-0',
        ].join(' ')}
      >
        {hasActivePrism ? (
          <button
            onClick={() => setActivePrism(null)}
            className="absolute left-3 top-3 z-30 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-panel/95 text-text-secondary shadow-sm transition hover:text-text-primary hover:border-border-focus"
            title="返回棱镜选择"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        ) : null}
        {hasActivePrism ? (
          <div className="h-full animate-[kb-card-fly-in_260ms_ease-out]">
            <PrismActivePanel onTimeClick={onTimeClick} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-4">
            <p className="wb-meta text-center">选择棱镜开始工作</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PrismActivePanel({ videoId, onTimeClick }: { videoId?: string; onTimeClick?: (timestamp: number) => void }) {
  const { activePrism, currentVideo } = useWorkbenchStore();

  const config: Record<string, { title: string; color: string; desc: string }> = {
    knowledge: { title: '知识棱镜', color: '#F59E0B', desc: '实时捕获关键帧，生成结构化大纲与学习笔记' },
    creation: { title: '创作棱镜 · PrismFlow', color: '#E91E8C', desc: '节点化视频工程，Branch / Merge 可控生成' },
    translation: { title: '译制棱镜', color: '#06B6D4', desc: '多语种字幕翻译、画面文字擦除、音色克隆配音' },
    diffraction: { title: '衍射棱镜', color: '#4F46E5', desc: '视频内容裂变为多平台图文资产' },
  };

  if (!activePrism) return null;
  const c = config[activePrism];

  if (activePrism === 'knowledge') {
    if (!currentVideo) {
      return (
        <div className="panel m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-bg-panel-secondary">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="status-dot" style={{ background: c.color }} />
              <span className="wb-section-title">{c.title}</span>
            </div>
            <p className="wb-meta mt-1">{c.desc}</p>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            <div className="w-full rounded-xl border border-border-subtle bg-bg-panel-secondary p-3">
              <p className="text-center text-sm font-medium text-text-primary">当前没有已绑定视频</p>
              <p className="wb-meta mt-1 text-center">
                请在左侧点击一个视频卡片，随后这里会显示知识看板按钮与同步操作。
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="panel m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-bg-panel-secondary">
        <KnowledgeBoard videoId={currentVideo.id} onTimeClick={onTimeClick} />
      </div>
    );
  }

  // 创作棱镜 - PrismFlow 画布
  if (activePrism === 'creation') {
    if (!currentVideo) {
      return (
        <div className="panel m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-bg-panel-secondary">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="status-dot" style={{ background: c.color }} />
              <span className="wb-section-title">{c.title}</span>
            </div>
            <p className="wb-meta mt-1">{c.desc}</p>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            <div className="w-full rounded-xl border border-border-subtle bg-bg-panel-secondary p-3">
              <p className="text-center text-sm font-medium text-text-primary">当前没有已绑定视频</p>
              <p className="wb-meta mt-1 text-center">
                请在左侧点击一个视频卡片，随后这里会显示 PrismFlow 节点画布。
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="panel m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-bg-panel-secondary">
        <CreationCanvas videoId={currentVideo.id} onTimeClick={onTimeClick} />
      </div>
    );
  }

  // 译制棱镜 - 翻译面板
  if (activePrism === 'translation') {
    if (!currentVideo) {
      return (
        <div className="panel m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-bg-panel-secondary">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="status-dot" style={{ background: c.color }} />
              <span className="wb-section-title">{c.title}</span>
            </div>
            <p className="wb-meta mt-1">{c.desc}</p>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            <div className="w-full rounded-xl border border-border-subtle bg-bg-panel-secondary p-3">
              <p className="text-center text-sm font-medium text-text-primary">当前没有已绑定视频</p>
              <p className="wb-meta mt-1 text-center">
                请在左侧点击一个视频卡片，随后这里会显示翻译控制台。
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="panel m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-bg-panel-secondary">
        <TranslationPanel videoId={currentVideo.id} onTimeClick={onTimeClick} />
      </div>
    );
  }

  // 衍射棱镜 - 多平台分发
  if (activePrism === 'diffraction') {
    if (!currentVideo) {
      return (
        <div className="panel m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-bg-panel-secondary">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="status-dot" style={{ background: c.color }} />
              <span className="wb-section-title">{c.title}</span>
            </div>
            <p className="wb-meta mt-1">{c.desc}</p>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            <div className="w-full rounded-xl border border-border-subtle bg-bg-panel-secondary p-3">
              <p className="text-center text-sm font-medium text-text-primary">当前没有已绑定视频</p>
              <p className="wb-meta mt-1 text-center">
                请在左侧点击一个视频卡片，随后这里会显示多平台分发控制台。
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="panel m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-bg-panel-secondary">
        <DiffractionPanel videoId={currentVideo.id} onTimeClick={onTimeClick} />
      </div>
    );
  }

  return (
    <div className="panel m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-bg-panel-secondary">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="status-dot" style={{ background: c.color }} />
          <span className="wb-section-title">{c.title}</span>
        </div>
        <p className="wb-meta mt-1">{c.desc}</p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <p className="wb-meta">请先选择视频开始分析</p>
      </div>
      <div className="border-t border-border-subtle px-4 py-2.5">
        <button
          className="input w-full py-1.5 text-[11px] font-medium text-text-tertiary"
          style={{ background: `${c.color}08` }}
          disabled
        >
          一键结算 / 导出
        </button>
      </div>
    </div>
  );
}
