'use client';

import React, { useState } from 'react';
import { creationApi, ScriptSegment } from '@/services/creation.api';
import { useCreationStore, FlowNode } from '@/stores/creation.store';
import { Loader2, Sparkles, X, Check, GripVertical } from 'lucide-react';

interface ScriptInputProps {
  videoId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface SplitSegment {
  segment: string;
  prompt: string;
  estimatedDuration?: number;
}

export function ScriptInput({ videoId, isOpen, onClose }: ScriptInputProps) {
  const [scriptText, setScriptText] = useState('');
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitSegments, setSplitSegments] = useState<SplitSegment[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const { createNodesFromSegments } = useCreationStore();

  const handleSplit = async () => {
    if (!scriptText.trim()) {
      alert('请输入文案内容');
      return;
    }

    setIsSplitting(true);
    try {
      const response = await creationApi.scriptSplit(videoId, {
        scriptText: scriptText,
      }) as { segments: SplitSegment[] };

      setSplitSegments(response.segments || []);
    } catch (error) {
      console.error('AI 拆分文案失败:', error);
      alert('AI 拆分文案失败，请重试');
    } finally {
      setIsSplitting(false);
    }
  };

  const handleConfirm = async () => {
    if (splitSegments.length === 0) return;

    setIsConfirming(true);
    try {
      await createNodesFromSegments(videoId, splitSegments);
      // Reset state and close
      setScriptText('');
      setSplitSegments([]);
      onClose();
    } catch (error) {
      console.error('生成节点失败:', error);
      alert('生成节点失败，请重试');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleClose = () => {
    setScriptText('');
    setSplitSegments([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex h-[80vh] w-[90vw] max-w-4xl flex-col rounded-2xl bg-[#1A1A24] border border-[#2D2D3A] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2D2D3A] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#E91E8C] to-[#9C27B0]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI 文案拆分</h2>
              <p className="text-sm text-[#9CA3AF]">将文案智能拆分为镜头片段</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-2 text-[#9CA3AF] transition hover:bg-[#2D2D3A] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Script Input */}
          <div className="flex w-1/2 flex-col border-r border-[#2D2D3A] p-6">
            <label className="mb-3 text-sm font-medium text-white">
              输入完整文案
            </label>
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="请输入需要拆分的完整文案...
例如：清晨的阳光透过窗户洒在桌面上，一杯咖啡冒着热气。镜头缓慢推进，展示咖啡杯的细节。画面切换到窗外的城市风景..."
              className="flex-1 resize-none rounded-xl bg-[#121218] border border-[#2D2D3A] p-4 text-sm text-white placeholder:text-[#6B7280] focus:border-[#E91E8C] focus:outline-none focus:ring-1 focus:ring-[#E91E8C]"
            />
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-[#6B7280]">
                {scriptText.length} 字符
              </span>
              <button
                onClick={handleSplit}
                disabled={isSplitting || !scriptText.trim()}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#E91E8C] to-[#9C27B0] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSplitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI 拆分中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    AI 拆分
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right: Preview */}
          <div className="flex w-1/2 flex-col p-6">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium text-white">拆分预览</label>
              {splitSegments.length > 0 && (
                <span className="rounded-full bg-[#E91E8C]/20 px-3 py-1 text-xs text-[#E91E8C]">
                  {splitSegments.length} 个片段
                </span>
              )}
            </div>

            {splitSegments.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <GripVertical className="mx-auto mb-3 h-12 w-12 text-[#2D2D3A]" />
                  <p className="text-sm text-[#6B7280]">
                    点击「AI 拆分」后<br />
                    将在此预览拆分结果
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {splitSegments.map((seg, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-[#2D2D3A] bg-[#121218] p-4"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E91E8C]/20 text-xs font-medium text-[#E91E8C]">
                          {index + 1}
                        </span>
                        {seg.estimatedDuration && (
                          <span className="text-xs text-[#6B7280]">
                            预计 {seg.estimatedDuration}s
                          </span>
                        )}
                      </div>
                      <p className="mb-2 text-sm text-white line-clamp-2">
                        {seg.segment}
                      </p>
                      <p className="text-xs text-[#9CA3AF]">
                        <span className="text-[#6B7280]">Prompt:</span>{' '}
                        {seg.prompt}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleConfirm}
                    disabled={isConfirming}
                    className="flex items-center gap-2 rounded-xl bg-[#E91E8C] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[#D11B7A] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isConfirming ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        生成节点中...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        确认并生成节点
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
