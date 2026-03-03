'use client';

import React, { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useCreationStore, FlowNodeData, RenderStatus } from '@/stores/creation.store';
import { Lock, Unlock, ImagePlus, Play, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';

// 状态颜色映射
const statusColors: Record<RenderStatus, string> = {
  PENDING: '#6B7280',
  PROCESSING: '#F59E0B',
  COMPLETED: '#10B981',
  FAILED: '#EF4444',
};

const statusLabels: Record<RenderStatus, string> = {
  PENDING: '待处理',
  PROCESSING: '处理中',
  COMPLETED: '已完成',
  FAILED: '失败',
};

interface FlowNodeCardProps {
  id: string;
  data: FlowNodeData;
  selected?: boolean;
}

function FlowNodeCardComponent({ id, data, selected }: FlowNodeCardProps) {
  const { selectNode, generateFrame, lockFrame, renderNode } = useCreationStore();
  const { orderIndex, prompt, scriptSegment, firstFrameUrl, lastFrameUrl, renderStatus, firstFrameLocked, lastFrameLocked, isGeneratingFrame, isRendering } = data;

  const handleDoubleClick = useCallback(() => {
    selectNode(id);
  }, [id, selectNode]);

  const handleGenerateFirstFrame = useCallback(() => {
    generateFrame(id, 'first');
  }, [id, generateFrame]);

  const handleGenerateLastFrame = useCallback(() => {
    generateFrame(id, 'last');
  }, [id, generateFrame]);

  const handleRender = useCallback(() => {
    renderNode(id);
  }, [id, renderNode]);

  const handleToggleFirstFrameLock = useCallback(() => {
    lockFrame(id, 'first', !firstFrameLocked);
  }, [id, firstFrameLocked, lockFrame]);

  const handleToggleLastFrameLock = useCallback(() => {
    lockFrame(id, 'last', !lastFrameLocked);
  }, [id, lastFrameLocked, lockFrame]);

  return (
    <div
      className={[
        'w-72 rounded-xl border-2 bg-[#1E1E24] transition-all duration-200',
        selected
          ? 'border-[#E91E8C] shadow-lg shadow-[#E91E8C]/20'
          : 'border-[#2D2D3A] hover:border-[#3D3D4A]',
      ].join(' ')}
      onDoubleClick={handleDoubleClick}
    >
      {/* 输入连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-[#E91E8C] !border-2 !border-[#1E1E24]"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2D2D3A]">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#E91E8C]/20 text-xs font-bold text-[#E91E8C]">
            {orderIndex + 1}
          </span>
          <span className="text-xs font-medium text-[#E5E5E5]">节点</span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: `${statusColors[renderStatus]}20`, color: statusColors[renderStatus] }}
          >
            {renderStatus === 'PROCESSING' && <RefreshCw className="h-3 w-3 animate-spin" />}
            {renderStatus === 'FAILED' && <AlertCircle className="h-3 w-3" />}
            {statusLabels[renderStatus]}
          </span>
        </div>
      </div>

      {/* 片段文案 */}
      <div className="px-3 py-2 border-b border-[#2D2D3A]">
        <p className="text-[11px] text-[#9CA3AF] line-clamp-2">
          {scriptSegment || prompt || '点击编辑文案...'}
        </p>
      </div>

      {/* 缩略图预览 */}
      <div className="flex gap-2 px-3 py-2">
        {/* 首帧 */}
        <div className="relative flex-1">
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-[#2D2D3A]">
            {firstFrameUrl ? (
              <img src={firstFrameUrl} alt="首帧" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImagePlus className="h-4 w-4 text-[#6B7280]" />
              </div>
            )}
          </div>
          <button
            onClick={handleToggleFirstFrameLock}
            className="absolute top-1 right-1 rounded p-1 transition hover:bg-[#2D2D3A]"
            title={firstFrameLocked ? '解锁首帧' : '锁定首帧'}
          >
            {firstFrameLocked ? (
              <Lock className="h-3 w-3 text-[#F59E0B]" />
            ) : (
              <Unlock className="h-3 w-3 text-[#6B7280]" />
            )}
          </button>
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
            首帧
          </span>
        </div>

        {/* 落幅 */}
        <div className="relative flex-1">
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-[#2D2D3A]">
            {lastFrameUrl ? (
              <img src={lastFrameUrl} alt="落幅" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImagePlus className="h-4 w-4 text-[#6B7280]" />
              </div>
            )}
          </div>
          <button
            onClick={handleToggleLastFrameLock}
            className="absolute top-1 right-1 rounded p-1 transition hover:bg-[#2D2D3A]"
            title={lastFrameLocked ? '解锁落幅' : '锁定落幅'}
          >
            {lastFrameLocked ? (
              <Lock className="h-3 w-3 text-[#F59E0B]" />
            ) : (
              <Unlock className="h-3 w-3 text-[#6B7280]" />
            )}
          </button>
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
            落幅
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-1 px-3 py-2 border-t border-[#2D2D3A]">
        <button
          onClick={handleGenerateFirstFrame}
          disabled={isGeneratingFrame}
          className="flex-1 rounded-lg bg-[#2D2D3A] py-1.5 text-[10px] font-medium text-[#9CA3AF] transition hover:bg-[#3D3D4A] hover:text-white disabled:opacity-50"
          title="生成首帧"
        >
          {isGeneratingFrame ? (
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          ) : (
            <ImagePlus className="mr-1 inline h-3 w-3" />
          )}
          首帧
        </button>
        <button
          onClick={handleGenerateLastFrame}
          disabled={isGeneratingFrame}
          className="flex-1 rounded-lg bg-[#2D2D3A] py-1.5 text-[10px] font-medium text-[#9CA3AF] transition hover:bg-[#3D3D4A] hover:text-white disabled:opacity-50"
          title="生成落幅"
        >
          {isGeneratingFrame ? (
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          ) : (
            <ImagePlus className="mr-1 inline h-3 w-3" />
          )}
          落幅
        </button>
        <button
          onClick={handleRender}
          disabled={isRendering || renderStatus === 'PROCESSING'}
          className="flex-1 rounded-lg bg-[#E91E8C] py-1.5 text-[10px] font-medium text-white transition hover:bg-[#D11B7A] disabled:opacity-50"
          title="渲染动态"
        >
          {isRendering || renderStatus === 'PROCESSING' ? (
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          ) : (
            <Play className="mr-1 inline h-3 w-3" />
          )}
          渲染
        </button>
      </div>

      {/* 输出连接点 */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-[#E91E8C] !border-2 !border-[#1E1E24]"
      />
    </div>
  );
}

// 使用 memo 优化渲染性能
export const FlowNodeCard = memo(FlowNodeCardComponent);
FlowNodeCard.displayName = 'FlowNodeCard';
