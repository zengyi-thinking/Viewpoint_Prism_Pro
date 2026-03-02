'use client';

import { useWorkbenchStore, PrismType } from '@/stores/workbench.store';
import { KnowledgeBoard } from '@/components/prisms/knowledge';

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
}

export function PrismSwitcher({ collapsed = false, onToggle, onTimeClick }: PrismSwitcherProps) {
  const { activePrism, setActivePrism } = useWorkbenchStore();

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
    <div className="flex h-full w-full flex-col">
      {/* Studio header */}
      <div className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
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
            <span className="text-xs font-semibold text-text-tertiary">Studio</span>
          </div>
          <button
            onClick={onToggle}
            className="rounded-lg p-1 text-text-tertiary transition hover:bg-bg-panel-secondary hover:text-text-secondary"
            title="收起面板"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* 2x2 Prism card grid */}
      <div className="grid grid-cols-2 gap-2.5 p-3">
        {prisms.map((p) => {
          const isActive = activePrism === p.type;
          return (
            <button
              key={p.type}
              onClick={() => setActivePrism(isActive ? null : p.type)}
              className="group relative flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition-all duration-200"
              style={{
                borderColor: isActive ? `${p.color}40` : 'var(--border-subtle)',
                background: isActive ? `${p.color}10` : 'var(--bg-panel-secondary)',
              }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors"
                style={{
                  background: `${p.color}15`,
                  color: isActive ? p.color : 'var(--text-tertiary)',
                }}
              >
                {p.icon}
              </div>
              <div>
                <div className="text-[11px] font-medium" style={{ color: isActive ? p.color : 'var(--text-secondary)' }}>
                  {p.label}
                </div>
                <div className="mt-0.5 text-[9px] text-text-tertiary">{p.subtitle}</div>
              </div>
              {isActive && (
                <span
                  className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full"
                  style={{ background: p.color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Active prism panel area */}
      <div className="flex-1 overflow-hidden">
        {activePrism ? (
          <PrismActivePanel onTimeClick={onTimeClick} />
        ) : (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-center text-[10px] text-text-tertiary">选择棱镜开始工作</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PrismActivePanel({ onTimeClick }: { onTimeClick?: (timestamp: number) => void }) {
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
        <div className="panel flex h-full flex-col rounded-none border-t border-l-0 border-r-0 border-b-0">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="status-dot" style={{ background: c.color }} />
              <span className="text-xs font-medium text-text-secondary">{c.title}</span>
            </div>
            <p className="mt-1 text-[10px] text-text-tertiary">{c.desc}</p>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-center text-[10px] text-text-tertiary">请先选择视频开始分析</p>
          </div>
        </div>
      );
    }

    return (
      <div className="panel flex h-full flex-col rounded-none border-t border-l-0 border-r-0 border-b-0">
        <KnowledgeBoard videoId={currentVideo.id} onTimeClick={onTimeClick} />
      </div>
    );
  }

  return (
    <div className="panel flex h-full flex-col rounded-none border-t border-l-0 border-r-0 border-b-0">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="status-dot" style={{ background: c.color }} />
          <span className="text-xs font-medium text-text-secondary">{c.title}</span>
        </div>
        <p className="mt-1 text-[10px] text-text-tertiary">{c.desc}</p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[10px] text-text-tertiary">请先选择视频开始分析</p>
      </div>
      <div className="border-t border-border-subtle px-4 py-2.5">
        <button
          className="input w-full py-1.5 text-[10px] font-medium text-text-tertiary"
          style={{ background: `${c.color}08` }}
          disabled
        >
          一键结算 / 导出
        </button>
      </div>
    </div>
  );
}
