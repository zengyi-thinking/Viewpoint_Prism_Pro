'use client';

import { memo } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';

export interface FlowNodeData extends Record<string, unknown> {
  title: string;
  scriptSegment: string;
  displayPromptCn: string;
  imagePromptCn: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  renderStatus: string;
  onSelect: () => void;
}

function FlowNodeCardComponent({ data, selected }: NodeProps<any>) {
  return (
    <div
      className={`w-[280px] rounded-[24px] border bg-bg-panel px-4 py-4 shadow-sm transition ${
        selected ? 'border-[#E91E8C] shadow-[0_0_0_1px_rgba(233,30,140,0.26)]' : 'border-border-subtle'
      }`}
      onClick={data.onSelect}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-[#E91E8C]" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-text-tertiary">Storyboard Node</div>
          <div className="mt-1 text-base font-semibold text-text-primary">{data.title}</div>
        </div>
        <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[10px] text-text-secondary">
          {data.renderStatus}
        </span>
      </div>

      <p className="mt-3 line-clamp-4 text-xs leading-5 text-text-secondary">{data.scriptSegment}</p>
      <div className="mt-3 rounded-2xl border border-border-subtle bg-bg-panel-secondary px-3 py-2">
        <div className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary">分镜图片描述词</div>
        <p className="mt-1 line-clamp-4 text-[11px] leading-5 text-text-tertiary">
          {data.displayPromptCn || data.imagePromptCn || '等待提示词生成'}
        </p>
      </div>

      {data.imageUrl ? (
        <img src={data.imageUrl} alt={data.title} className="mt-3 h-32 w-full rounded-[18px] border border-border-subtle object-cover" />
      ) : (
        <div className="mt-3 flex h-32 w-full items-center justify-center rounded-[18px] border border-dashed border-border-subtle text-[11px] text-text-tertiary">
          暂无分镜图片
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="rounded-full border border-border-subtle px-2 py-1 text-[10px] text-text-tertiary">
          点击卡片进入导演台
        </span>
        {data.videoUrl ? <div className="text-[11px] text-[#22C55E]">已生成节点视频</div> : null}
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-0 !bg-[#E91E8C]" />
    </div>
  );
}

export const FlowNodeCard = memo(FlowNodeCardComponent);
