'use client';

import { memo } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { CharacterAnchor } from '@/services/creation.api';

export interface FlowNodeData extends Record<string, unknown> {
  orderIndex: number;
  title: string;
  scriptSegment: string;
  displayPromptCn: string;
  imagePromptCn: string;
  continuityNotes: string;
  characterAnchor: CharacterAnchor;
  continuityLocked: boolean;
  parentTitle?: string | null;
  parentImageUrl?: string | null;
  firstFrameUrl?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  renderStatus: string;
  isGeneratingImage?: boolean;
  isRenderingVideo?: boolean;
  isGeneratingNext?: boolean;
  onSelect: () => void;
  onGenerateImage?: () => void;
  onRenderVideo?: () => void;
  onGenerateNext?: () => void;
  onDelete?: () => void;
}

function InlineSpinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

function FlowNodeCardComponent({ data, selected }: NodeProps<any>) {
  const isRootNode = data.orderIndex === 0 || !data.parentTitle;
  const characterSummary = [
    data.characterAnchor?.identity,
    data.characterAnchor?.hair,
    data.characterAnchor?.outfit,
    data.characterAnchor?.face,
    data.characterAnchor?.prop,
  ].filter(Boolean).join(' / ');

  return (
    <div
      className={`w-[308px] rounded-[28px] border bg-bg-panel px-4 py-4 shadow-sm transition ${
        selected ? 'border-[#E91E8C] shadow-[0_0_0_1px_rgba(233,30,140,0.26)]' : 'border-border-subtle'
      }`}
      onClick={data.onSelect}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-[#E91E8C]" />
      <div className="flex justify-center">
        <div className="relative min-w-[126px] rounded-[18px] border border-border-subtle bg-bg-panel-secondary px-4 py-2 text-center">
          {data.onDelete ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete?.();
              }}
              className="absolute right-2 top-2 rounded-md px-1 text-[11px] text-text-tertiary transition hover:text-[#EF4444]"
              title="删除节点"
            >
              ×
            </button>
          ) : null}
          <div className="text-[11px] uppercase tracking-[0.2em] text-text-tertiary">
            node{data.orderIndex + 1}
          </div>
          <div className="mt-1 text-sm font-semibold text-text-primary line-clamp-2">
            {data.title || `node${data.orderIndex + 1}`}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-[18px] border border-border-subtle bg-bg-panel-secondary px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary">分镜图片描述词</div>
        <p className="mt-1 line-clamp-5 text-[12px] leading-6 text-text-primary">
          {data.displayPromptCn || data.imagePromptCn || '等待 agent 生成当前节点的分镜图片描述词'}
        </p>
      </div>

      {!isRootNode ? (
        <div className="mt-3 rounded-[18px] border border-border-subtle bg-bg-panel-secondary px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary">前后镜头衔接提示</div>
          <p className="mt-1 text-[11px] leading-5 text-text-secondary">
            承接上一节点 {data.parentTitle || '上一镜'} 的尾帧作为当前镜头首帧，当前分镜图生成完成后，再将两帧串联生成视频。
          </p>
          <p className="mt-2 line-clamp-5 text-[11px] leading-5 text-text-tertiary">
            {data.continuityNotes || '保持人物身份、服装、发型、主体站位和环境光线连续，避免角色漂移。'}
          </p>
        </div>
      ) : null}

      <div className="mt-3 rounded-[18px] border border-border-subtle bg-bg-panel-secondary px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary">人物锚点</div>
          {data.continuityLocked ? (
            <span className="rounded-full border border-[#E91E8C]/30 bg-[rgba(233,30,140,0.10)] px-2 py-0.5 text-[10px] text-[#E91E8C]">
              连续性锁定
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-4 text-[11px] leading-5 text-text-secondary">
          {characterSummary || '当前节点暂未提取到稳定人物锚点。'}
        </p>
      </div>

      {isRootNode ? (
        data.imageUrl ? (
          <img
            src={data.imageUrl}
            alt={data.title}
            className="mt-3 h-36 w-full rounded-[18px] border border-border-subtle object-cover"
          />
        ) : (
          <div className="mt-3 flex h-36 w-full items-center justify-center rounded-[18px] border border-dashed border-border-subtle text-[11px] text-text-tertiary">
            分镜图片1
          </div>
        )
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-text-tertiary">承接首帧</div>
            {data.parentImageUrl ? (
              <img
                src={data.parentImageUrl}
                alt={`${data.parentTitle || '上一镜'} 尾帧`}
                className="h-24 w-full rounded-[16px] border border-border-subtle object-cover"
              />
            ) : (
              <div className="flex h-24 w-full items-center justify-center rounded-[16px] border border-dashed border-border-subtle text-[11px] text-text-tertiary">
                上一节点尾帧
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-text-tertiary">当前分镜图</div>
            {data.imageUrl ? (
              <img
                src={data.imageUrl}
                alt={data.title}
                className="h-32 w-full rounded-[16px] border border-border-subtle object-cover"
              />
            ) : (
              <div className="flex h-32 w-full items-center justify-center rounded-[16px] border border-dashed border-border-subtle text-[11px] text-text-tertiary">
                分镜图片{data.orderIndex + 1}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-text-tertiary">视频</div>
            {data.videoUrl ? (
              <video
                src={data.videoUrl}
                className="h-28 w-full rounded-[16px] border border-border-subtle object-cover"
                muted
                playsInline
              />
            ) : (
              <div className="flex h-28 w-full items-center justify-center rounded-[16px] border border-dashed border-border-subtle text-[11px] text-text-tertiary">
                视频
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onGenerateImage?.();
          }}
          disabled={data.isGeneratingImage}
          className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-border-subtle bg-bg-panel-secondary px-3 py-3 text-xs text-text-primary disabled:opacity-60"
        >
          {data.isGeneratingImage ? <InlineSpinner /> : null}
          {data.isGeneratingImage ? '生成中' : '生成图片'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onRenderVideo?.();
          }}
          disabled={data.isRenderingVideo}
          className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-border-subtle bg-bg-panel-secondary px-3 py-3 text-xs text-text-primary disabled:opacity-60"
        >
          {data.isRenderingVideo ? <InlineSpinner /> : null}
          {data.isRenderingVideo ? '生成中' : '生成视频'}
        </button>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          data.onGenerateNext?.();
        }}
        disabled={data.isGeneratingNext}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[16px] border border-border-subtle bg-bg-panel-secondary px-3 py-3 text-xs text-text-primary disabled:opacity-60"
      >
        {data.isGeneratingNext ? <InlineSpinner /> : null}
        {data.isGeneratingNext ? '推演中' : '生成下一节点'}
      </button>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="rounded-full border border-border-subtle px-2 py-1 text-[10px] text-text-tertiary">
          {isRootNode ? '起始节点' : '承接上一镜'}
        </span>
        <span className="rounded-full border border-border-subtle px-2 py-1 text-[10px] text-text-secondary">
          {data.renderStatus}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-0 !bg-[#E91E8C]" />
    </div>
  );
}

export const FlowNodeCard = memo(FlowNodeCardComponent);
