'use client';

import React, { useState } from 'react';
import { creationApi } from '@/services/creation.api';
import { useCreationStore } from '@/stores/creation.store';
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
  const [adjustInstruction, setAdjustInstruction] = useState('');
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
        persist: false,
        adjustInstruction: adjustInstruction.trim() || undefined,
      }) as { segments: Array<{ segment?: string; prompt?: string; estimatedDuration?: number }> };

      const preview = (response.segments || []).map((seg) => ({
        segment: seg.segment || '',
        prompt: seg.prompt || seg.segment || '',
        estimatedDuration: seg.estimatedDuration,
      }));

      setSplitSegments(preview);
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
    setAdjustInstruction('');
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
      <div className="relative z-10 flex h-[80vh] w-[90vw] max-w-4xl flex-col rounded-2xl bg-[var(--creation-bg-surface)] border border-[var(--creation-border-strong)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--creation-border-strong)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--creation-accent)] to-[var(--creation-accent-hover)]">
              <Sparkles className="h-5 w-5 text-[var(--creation-text-primary)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--creation-text-primary)]">AI 文案拆分</h2>
              <p className="text-sm text-[var(--creation-text-secondary)]">将文案智能拆分为镜头片段</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-2 text-[var(--creation-text-secondary)] transition hover:bg-[var(--creation-bg-elevated)] hover:text-[var(--creation-text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Script Input */}
          <div className="flex w-1/2 flex-col border-r border-[var(--creation-border-strong)] p-6">
            <label className="mb-3 text-sm font-medium text-[var(--creation-text-primary)]">
              输入完整文案
            </label>
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="请输入需要拆分的完整文案...
例如：清晨的阳光透过窗户洒在桌面上，一杯咖啡冒着热气。镜头缓慢推进，展示咖啡杯的细节。画面切换到窗外的城市风景..."
              className="flex-1 resize-none rounded-xl bg-[var(--creation-bg-canvas)] border border-[var(--creation-border-strong)] p-4 text-sm text-[var(--creation-text-primary)] placeholder:text-[var(--creation-text-muted)] focus:border-[var(--creation-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--creation-accent)]"
            />
            <label className="mt-3 text-xs font-medium text-[var(--creation-text-secondary)]">
              调整要求（可选）
            </label>
            <textarea
              value={adjustInstruction}
              onChange={(e) => setAdjustInstruction(e.target.value)}
              rows={2}
              placeholder="例如：节奏更快、偏科技感、减少空镜头、强调产品卖点..."
              className="mt-1 resize-none rounded-xl bg-[var(--creation-bg-canvas)] border border-[var(--creation-border-strong)] p-3 text-xs text-[var(--creation-text-primary)] placeholder:text-[var(--creation-text-muted)] focus:border-[var(--creation-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--creation-accent)]"
            />
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-[var(--creation-text-muted)]">
                {scriptText.length} 字符
              </span>
              <button
                onClick={handleSplit}
                disabled={isSplitting || !scriptText.trim()}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--creation-accent)] to-[var(--creation-accent-hover)] px-5 py-2.5 text-sm font-medium text-[var(--creation-text-primary)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
              <label className="text-sm font-medium text-[var(--creation-text-primary)]">拆分预览</label>
              {splitSegments.length > 0 && (
                <span className="rounded-full bg-[var(--creation-accent)]/20 px-3 py-1 text-xs text-[var(--creation-accent)]">
                  {splitSegments.length} 个片段
                </span>
              )}
            </div>

            {splitSegments.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <GripVertical className="mx-auto mb-3 h-12 w-12 text-[#2D2D3A]" />
                  <p className="text-sm text-[var(--creation-text-muted)]">
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
                    className="rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] p-4"
                  >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--creation-accent)]/20 text-xs font-medium text-[var(--creation-accent)]">
                          {index + 1}
                        </span>
                        {seg.estimatedDuration && (
                          <span className="text-xs text-[var(--creation-text-muted)]">
                            预计 {seg.estimatedDuration}s
                          </span>
                        )}
                      </div>
                      <label className="mb-1 block text-[11px] text-[var(--creation-text-secondary)]">片段文案</label>
                      <textarea
                        value={seg.segment}
                        onChange={(e) => {
                          const next = [...splitSegments];
                          next[index] = { ...next[index], segment: e.target.value };
                          setSplitSegments(next);
                        }}
                        rows={2}
                        className="mb-2 w-full resize-y rounded-md border border-[var(--creation-border-strong)] bg-[var(--creation-bg-input)] px-2 py-1 text-xs text-[var(--creation-text-primary)] outline-none focus:border-[var(--creation-accent)]"
                      />
                      <label className="mb-1 block text-[11px] text-[var(--creation-text-secondary)]">画面 Prompt</label>
                      <textarea
                        value={seg.prompt}
                        onChange={(e) => {
                          const next = [...splitSegments];
                          next[index] = { ...next[index], prompt: e.target.value };
                          setSplitSegments(next);
                        }}
                        rows={2}
                        className="w-full resize-y rounded-md border border-[var(--creation-border-strong)] bg-[var(--creation-bg-input)] px-2 py-1 text-xs text-[var(--creation-text-primary)] outline-none focus:border-[var(--creation-accent)]"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleConfirm}
                    disabled={isConfirming}
                    className="flex items-center gap-2 rounded-xl bg-[var(--creation-accent)] px-6 py-2.5 text-sm font-medium text-[var(--creation-text-primary)] transition hover:bg-[var(--creation-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
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
