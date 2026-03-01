'use client';

import { useWorkbenchStore } from '@/stores/workbench.store';

export function PrismPanelHost() {
  const { activePrism } = useWorkbenchStore();

  if (!activePrism) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-white/10">选择右侧棱镜</p>
      </div>
    );
  }

  const panelConfig: Record<string, { title: string; color: string; description: string }> = {
    knowledge: {
      title: '知识棱镜',
      color: '#F59E0B',
      description: '实时捕获关键帧，生成结构化大纲与学习笔记',
    },
    creation: {
      title: '创作棱镜 · PrismFlow',
      color: '#E91E8C',
      description: '节点化视频工程，Branch / Merge 可控生成',
    },
    translation: {
      title: '译制棱镜',
      color: '#06B6D4',
      description: '多语种字幕翻译、画面文字擦除、音色克隆配音',
    },
    diffraction: {
      title: '衍射棱镜',
      color: '#4F46E5',
      description: '视频内容裂变为多平台图文资产',
    },
  };

  const config = panelConfig[activePrism];

  return (
    <div className="flex h-full flex-col">
      {/* Panel header */}
      <div className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full" style={{ background: config.color }} />
          <h3 className="text-sm font-semibold text-white/80">{config.title}</h3>
        </div>
        <p className="mt-1 text-xs text-white/25">{config.description}</p>
      </div>

      {/* Panel body - placeholder for each prism */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: `${config.color}15` }}
        >
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <path d="M14 2L26 24H2L14 2Z" stroke={config.color} strokeWidth="1.5" fill="none" />
          </svg>
        </div>
        <p className="text-xs text-white/20">请先选择视频开始分析</p>
        <p className="text-[10px] text-white/10">功能开发中...</p>
      </div>

      {/* Panel footer actions */}
      <div className="border-t border-white/5 px-5 py-3">
        <button
          className="w-full rounded-lg py-2 text-xs font-medium text-white/30 transition"
          style={{ background: `${config.color}10` }}
          disabled
        >
          一键结算 / 导出
        </button>
      </div>
    </div>
  );
}
