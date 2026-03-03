'use client';

import React, { useState } from 'react';
import { useCreationStore } from '@/stores/creation.store';
import { Button } from '@/components/ui/button';
import {
  X,
  Film,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  Volume2,
  Music,
  Settings,
} from 'lucide-react';

interface StitchPanelProps {
  videoId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function StitchPanel({ videoId, isOpen, onClose }: StitchPanelProps) {
  const {
    nodes,
    stitchTask,
    exportTask,
    isStitching,
    isExporting,
    stitch,
    exportProject,
  } = useCreationStore();

  // 本地状态
  const [includeNarration, setIncludeNarration] = useState(true);
  const [includeBgm, setIncludeBgm] = useState(true);
  const [bgmVolume, setBgmVolume] = useState(50);
  const [exportFormat, setExportFormat] = useState<'mp4' | 'webm' | 'json'>('mp4');

  // 统计已完成渲染的节点
  const completedNodes = nodes.filter((n) => n.data.renderStatus === 'COMPLETED');
  const totalNodes = nodes.length;

  // 处理串联
  const handleStitch = async () => {
    await stitch(videoId, {
      includeNarration,
      includeBgm,
      bgmVolume,
    });
  };

  // 处理导出
  const handleExport = async () => {
    await exportProject(videoId, {
      format: exportFormat,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#1E1E24] border border-[#2D2D3A] shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2D2D3A]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#E91E8C] to-[#9C27B0]">
              <Film className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">串联导出</h2>
              <p className="text-sm text-[#9CA3AF]">
                {completedNodes.length}/{totalNodes} 节点已完成渲染
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-white"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 space-y-6">
          {/* 节点预览 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-[#9CA3AF]">节点预览</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {nodes.length === 0 ? (
                <div className="flex items-center justify-center w-full h-20 rounded-xl bg-[#121218] text-[#6B7280]">
                  暂无节点，请先添加节点
                </div>
              ) : (
                nodes
                  .sort((a, b) => a.data.orderIndex - b.data.orderIndex)
                  .map((node, index) => (
                    <div
                      key={node.id}
                      className="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 bg-[#121218]"
                    >
                      {/* 缩略图 */}
                      {node.data.firstFrameUrl ? (
                        <img
                          src={node.data.firstFrameUrl}
                          alt={`节点 ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full bg-[#2D2D3A]">
                          <Play className="h-6 w-6 text-[#6B7280]" />
                        </div>
                      )}

                      {/* 状态指示器 */}
                      <div className="absolute top-1 right-1">
                        {node.data.renderStatus === 'COMPLETED' ? (
                          <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                        ) : node.data.renderStatus === 'PROCESSING' ? (
                          <Loader2 className="h-4 w-4 text-[#E91E8C] animate-spin" />
                        ) : node.data.renderStatus === 'FAILED' ? (
                          <AlertCircle className="h-4 w-4 text-[#EF4444]" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-[#6B7280]" />
                        )}
                      </div>

                      {/* 序号 */}
                      <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {index + 1}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* 串联设置 */}
          <div className="space-y-4 rounded-xl bg-[#121218] p-4">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-[#E91E8C]" />
              <h3 className="text-sm font-medium text-white">串联设置</h3>
            </div>

            <div className="space-y-3">
              {/* 配音开关 */}
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <Volume2 className="h-4 w-4 text-[#9CA3AF]" />
                  <span className="text-sm text-white">包含配音</span>
                </div>
                <button
                  onClick={() => setIncludeNarration(!includeNarration)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    includeNarration ? 'bg-[#E91E8C]' : 'bg-[#2D2D3A]'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                      includeNarration ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </label>

              {/* BGM 开关 */}
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <Music className="h-4 w-4 text-[#9CA3AF]" />
                  <span className="text-sm text-white">包含背景音乐</span>
                </div>
                <button
                  onClick={() => setIncludeBgm(!includeBgm)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    includeBgm ? 'bg-[#E91E8C]' : 'bg-[#2D2D3A]'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                      includeBgm ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </label>

              {/* BGM 音量 */}
              {includeBgm && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#9CA3AF]">BGM 音量</span>
                    <span className="text-sm text-white">{bgmVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={bgmVolume}
                    onChange={(e) => setBgmVolume(Number(e.target.value))}
                    className="w-full h-2 bg-[#2D2D3A] rounded-lg appearance-none cursor-pointer accent-[#E91E8C]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 导出格式选择 */}
          <div className="space-y-4 rounded-xl bg-[#121218] p-4">
            <h3 className="text-sm font-medium text-white">导出格式</h3>
            <div className="flex gap-2">
              {(['mp4', 'webm', 'json'] as const).map((format) => (
                <button
                  key={format}
                  onClick={() => setExportFormat(format)}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    exportFormat === format
                      ? 'bg-[#E91E8C] text-white'
                      : 'bg-[#2D2D3A] text-[#9CA3AF] hover:bg-[#3D3D4A]'
                  }`}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* 任务状态 */}
          {(stitchTask || exportTask) && (
            <div className="space-y-3">
              {/* 串联任务状态 */}
              {stitchTask && (
                <div className="flex items-center gap-3 rounded-xl bg-[#121218] p-4">
                  {stitchTask.status === 'PROCESSING' ? (
                    <Loader2 className="h-5 w-5 animate-spin text-[#E91E8C]" />
                  ) : stitchTask.status === 'COMPLETED' ? (
                    <CheckCircle2 className="h-5 w-5 text-[#10B981]" />
                  ) : stitchTask.status === 'FAILED' ? (
                    <AlertCircle className="h-5 w-5 text-[#EF4444]" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-[#6B7280]" />
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">串联进度</div>
                    <div className="text-xs text-[#9CA3AF]">
                      {stitchTask.status === 'PROCESSING'
                        ? '正在拼接视频...'
                        : stitchTask.status === 'COMPLETED'
                        ? '串联完成'
                        : stitchTask.status === 'FAILED'
                        ? `串联失败: ${stitchTask.error}`
                        : '等待中...'}
                    </div>
                  </div>
                  {stitchTask.status === 'COMPLETED' && stitchTask.downloadUrl && (
                    <Button
                      size="sm"
                      onClick={() => window.open(stitchTask.downloadUrl, '_blank')}
                      className="bg-[#10B981] hover:bg-[#10B981]/90"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      下载
                    </Button>
                  )}
                </div>
              )}

              {/* 导出任务状态 */}
              {exportTask && (
                <div className="flex items-center gap-3 rounded-xl bg-[#121218] p-4">
                  {exportTask.status === 'PROCESSING' ? (
                    <Loader2 className="h-5 w-5 animate-spin text-[#E91E8C]" />
                  ) : exportTask.status === 'COMPLETED' ? (
                    <CheckCircle2 className="h-5 w-5 text-[#10B981]" />
                  ) : exportTask.status === 'FAILED' ? (
                    <AlertCircle className="h-5 w-5 text-[#EF4444]" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-[#6B7280]" />
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">
                      导出进度 ({exportTask.format?.toUpperCase()})
                    </div>
                    <div className="text-xs text-[#9CA3AF]">
                      {exportTask.status === 'PROCESSING'
                        ? '正在导出...'
                        : exportTask.status === 'COMPLETED'
                        ? '导出完成'
                        : exportTask.status === 'FAILED'
                        ? `导出失败: ${exportTask.error}`
                        : '等待中...'}
                    </div>
                  </div>
                  {exportTask.status === 'COMPLETED' && exportTask.downloadUrl && (
                    <Button
                      size="sm"
                      onClick={() => window.open(exportTask.downloadUrl, '_blank')}
                      className="bg-[#10B981] hover:bg-[#10B981]/90"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      下载
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-[#2D2D3A] bg-[#1E1E24]">
          <Button
            onClick={handleStitch}
            disabled={isStitching || completedNodes.length === 0}
            className="flex-1 bg-gradient-to-r from-[#E91E8C] to-[#9C27B0] hover:opacity-90"
          >
            {isStitching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                串联中...
              </>
            ) : (
              <>
                <Film className="h-4 w-4 mr-2" />
                一键串联
              </>
            )}
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || completedNodes.length === 0}
            variant="outline"
            className="flex-1 border-[#2D2D3A] hover:bg-[#2D2D3A]"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                导出中...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                导出项目
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
