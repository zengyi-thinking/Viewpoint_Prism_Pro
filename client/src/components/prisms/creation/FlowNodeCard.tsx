'use client';

import React, { memo, useCallback, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  useCreationStore,
  FlowNodeData,
  RenderStatus,
  PromptBundleCandidate,
} from '@/stores/creation.store';
import {
  AlertCircle,
  GitBranch,
  GitMerge,
  ImagePlus,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  Trash2,
  Unlock,
  Wand2,
} from 'lucide-react';

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
  const {
    selectNode,
    generateFrame,
    lockFrame,
    renderNode,
    createBranch,
    mergeBranch,
    deleteNode,
    updateNode,
    updateNodeLocalData,
    refineNodeCopy,
    generateNodeCandidates,
    generateNextNode,
    precheckNode,
    assessNodeQuality,
    compareBranch,
  } = useCreationStore();

  const {
    orderIndex,
    prompt,
    scriptSegment,
    firstFrameUrl,
    lastFrameUrl,
    renderStatus,
    renderProgress = 0,
    firstFrameLocked,
    lastFrameLocked,
    isGeneratingFrame,
    isRendering,
    branchName,
    parentNodeId,
    isMerged,
    childBranchCount,
    firstFramePrompt,
    lastFramePrompt,
    sceneFramePrompt,
    renderedVideoUrl,
    precheckLevel,
    precheckIssues,
    qualityScore,
    qualityBreakdown,
  } = data;

  const isBranchNode = Boolean(parentNodeId || branchName);
  const isFirstMainNode = !isBranchNode && Boolean(data.isFirstScene);
  const sceneFrameUrl = firstFrameUrl || lastFrameUrl;

  const [isEditingCopy, setIsEditingCopy] = useState(false);
  const [copyRequirement, setCopyRequirement] = useState('');
  const [savingCopy, setSavingCopy] = useState(false);
  const [expandIdea, setExpandIdea] = useState('');
  const [expandCount, setExpandCount] = useState(3);
  const [expanding, setExpanding] = useState(false);
  const [candidateList, setCandidateList] = useState<PromptBundleCandidate[]>([]);
  const [adoptingIndex, setAdoptingIndex] = useState<number | null>(null);
  const [prechecking, setPrechecking] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<{
    recommendation: 'merge_branch' | 'keep_main' | 'manual_review';
    reasons: string[];
    delta: {
      overall: number;
      promptCompleteness: number;
      continuity: number;
      renderStability: number;
    };
  } | null>(null);

  const handleDoubleClick = useCallback(() => {
    selectNode(id);
    setIsEditingCopy((v) => !v);
  }, [id, selectNode]);

  const handleRender = useCallback(() => {
    renderNode(id);
  }, [id, renderNode]);

  const handleCreateBranch = useCallback(() => {
    const suggested = `branch-${orderIndex + 1}`;
    const input = window.prompt('请输入分支名称', suggested);
    const normalized = input?.trim();
    if (!normalized) return;
    createBranch(id, normalized);
  }, [id, orderIndex, createBranch]);

  const handleMergeBranch = useCallback(() => {
    if (!isBranchNode || isMerged) return;
    mergeBranch(id);
  }, [id, isBranchNode, isMerged, mergeBranch]);

  const handleDelete = useCallback(() => {
    const ok = window.confirm('确认删除该节点？删除后不可恢复。');
    if (!ok) return;
    deleteNode(id);
  }, [deleteNode, id]);

  const persistCopyEdit = useCallback(async () => {
    await updateNode(id, {
      scriptSegment: String(data.scriptSegment || '').trim(),
      prompt: String(data.prompt || '').trim(),
    });
  }, [id, data.scriptSegment, data.prompt, updateNode]);

  const handleAiRefineCopy = useCallback(async () => {
    const req = copyRequirement.trim();
    if (!req) return;
    setSavingCopy(true);
    try {
      await refineNodeCopy(id, req);
      setCopyRequirement('');
    } finally {
      setSavingCopy(false);
    }
  }, [copyRequirement, id, refineNodeCopy]);

  const handleGenerateCandidates = useCallback(async () => {
    const idea = expandIdea.trim();
    if (!idea) return;
    setExpanding(true);
    try {
      const candidates = await generateNodeCandidates(id, idea, expandCount);
      setCandidateList(candidates);
    } finally {
      setExpanding(false);
    }
  }, [expandCount, expandIdea, generateNodeCandidates, id]);

  const handleAdoptCandidate = useCallback(async (candidate: PromptBundleCandidate, index: number) => {
    setAdoptingIndex(index);
    try {
      await generateNextNode({
        currentNodeId: id,
        idea: expandIdea.trim() || candidate.scriptSegment,
        scriptSegment: candidate.scriptSegment,
        videoPrompt: candidate.videoPrompt,
        sceneFramePrompt: candidate.sceneFramePrompt,
        firstFramePrompt: candidate.firstFramePrompt,
        lastFramePrompt: candidate.lastFramePrompt,
      });
    } finally {
      setAdoptingIndex(null);
    }
  }, [expandIdea, generateNextNode, id]);

  const triggerFirstFrame = useCallback(() => {
    generateFrame(id, 'first', String(firstFramePrompt || sceneFramePrompt || prompt || ''));
  }, [firstFramePrompt, generateFrame, id, prompt, sceneFramePrompt]);

  const triggerLastFrame = useCallback(() => {
    generateFrame(id, 'last', String(lastFramePrompt || prompt || ''));
  }, [generateFrame, id, lastFramePrompt, prompt]);

  const toggleFirstLock = useCallback(() => {
    lockFrame(id, 'first', !firstFrameLocked);
  }, [firstFrameLocked, id, lockFrame]);

  const toggleLastLock = useCallback(() => {
    lockFrame(id, 'last', !lastFrameLocked);
  }, [id, lastFrameLocked, lockFrame]);

  const handlePrecheck = useCallback(async () => {
    setPrechecking(true);
    try {
      await precheckNode(id);
    } finally {
      setPrechecking(false);
    }
  }, [id, precheckNode]);

  const handleScore = useCallback(async () => {
    setScoring(true);
    try {
      await assessNodeQuality(id);
    } finally {
      setScoring(false);
    }
  }, [assessNodeQuality, id]);

  const handleCompareBranch = useCallback(async () => {
    if (!isBranchNode) return;
    setCompareLoading(true);
    try {
      const result = await compareBranch(id);
      if (!result) return;
      setCompareResult({
        recommendation: result.recommendation,
        reasons: result.reasons,
        delta: result.compare.delta,
      });
    } finally {
      setCompareLoading(false);
    }
  }, [compareBranch, id, isBranchNode]);

  const precheckTone =
    precheckLevel === 'ready'
      ? 'text-[#34D399] bg-[#10B981]/15 border-[#10B981]/40'
      : precheckLevel === 'high_risk'
        ? 'text-[#FCA5A5] bg-[#EF4444]/12 border-[#EF4444]/35'
        : precheckLevel === 'suggest_improve'
          ? 'text-[#FCD34D] bg-[#F59E0B]/12 border-[#F59E0B]/35'
          : 'text-[#9CA3AF] bg-[#2D2D3A] border-[#2D2D3A]';

  return (
    <div
      className={[
        'w-[360px] rounded-xl border-2 bg-[#1E1E24] transition-all duration-200',
        selected
          ? 'border-[#E91E8C] shadow-lg shadow-[#E91E8C]/20'
          : 'border-[#2D2D3A] hover:border-[#3D3D4A]',
      ].join(' ')}
      onDoubleClick={handleDoubleClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-[#1E1E24] !bg-[#E91E8C]"
      />

      <div className="flex items-center justify-between border-b border-[#2D2D3A] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#E91E8C]/20 text-xs font-bold text-[#E91E8C]">
            {orderIndex + 1}
          </span>
          <span className="text-xs font-medium text-[#E5E5E5]">
            {isBranchNode ? '分支节点' : '主干节点'}
          </span>
          {isBranchNode && branchName && (
            <span className="rounded-full bg-[#9C27B0]/20 px-2 py-0.5 text-[10px] text-[#C084FC]">
              {branchName}
            </span>
          )}
          {!isBranchNode && (childBranchCount || 0) > 0 && (
            <span className="rounded-full bg-[#2D2D3A] px-2 py-0.5 text-[10px] text-[#9CA3AF]">
              {childBranchCount} 分支
            </span>
          )}
          {isBranchNode && isMerged && (
            <span className="rounded-full bg-[#10B981]/20 px-2 py-0.5 text-[10px] text-[#34D399]">
              已合并
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: `${statusColors[renderStatus]}20`, color: statusColors[renderStatus] }}
          >
            {renderStatus === 'PROCESSING' && <RefreshCw className="h-3 w-3 animate-spin" />}
            {renderStatus === 'FAILED' && <AlertCircle className="h-3 w-3" />}
            {statusLabels[renderStatus]}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${precheckTone}`}>
            {precheckLevel === 'ready'
              ? '预检通过'
              : precheckLevel === 'high_risk'
                ? '高风险'
                : precheckLevel === 'suggest_improve'
                  ? '建议优化'
                  : '未预检'}
          </span>
          <span className="rounded-full bg-[#1A1A22] px-2 py-0.5 text-[10px] text-[#9CA3AF]">
            质量 {qualityScore != null ? Math.round(qualityScore) : '-'}
          </span>
          <button
            onClick={handleDelete}
            className="rounded p-1 text-[#9CA3AF] transition hover:bg-[#3B1F26] hover:text-[#F87171]"
            title="删除节点"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2 border-b border-[#2D2D3A] px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">叙事意图层</div>
        <div>
          <label className="text-[10px] text-[#6B7280]">节点文案</label>
          <textarea
            value={String(data.scriptSegment || '')}
            onChange={(e) => updateNodeLocalData(id, { scriptSegment: e.target.value })}
            rows={2}
            className="mt-1 w-full resize-y rounded-md border border-[#2D2D3A] bg-[#14141C] px-2 py-1 text-xs text-[#E5E7EB] outline-none focus:border-[#E91E8C]"
          />
        </div>
        <div>
          <label className="text-[10px] text-[#6B7280]">画面提示词</label>
          <textarea
            value={String(data.prompt || '')}
            onChange={(e) => {
              const value = e.target.value;
              updateNodeLocalData(id, {
                prompt: value,
                sceneFramePrompt: value,
              });
            }}
            rows={2}
            className="mt-1 w-full resize-y rounded-md border border-[#2D2D3A] bg-[#14141C] px-2 py-1 text-xs text-[#E5E7EB] outline-none focus:border-[#E91E8C]"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={persistCopyEdit}
            className="rounded-md bg-[#2D2D3A] px-2 py-1 text-[10px] text-[#E5E7EB] transition hover:bg-[#3A3A4C]"
          >
            保存文案
          </button>
          <button
            onClick={() => setIsEditingCopy((v) => !v)}
            className="rounded-md border border-[#2D2D3A] px-2 py-1 text-[10px] text-[#9CA3AF] transition hover:bg-[#2D2D3A] hover:text-white"
          >
            AI 调整
          </button>
        </div>
        {isEditingCopy && (
          <div className="space-y-2 rounded-md border border-[#2D2D3A] bg-[#14141C] p-2">
            <label className="text-[10px] text-[#9CA3AF]">输入新的调整要求</label>
            <textarea
              value={copyRequirement}
              onChange={(e) => setCopyRequirement(e.target.value)}
              rows={2}
              placeholder="例如：语气更热情，镜头更紧凑，强调产品卖点..."
              className="w-full resize-y rounded-md border border-[#2D2D3A] bg-[#101017] px-2 py-1 text-xs text-[#E5E7EB] outline-none focus:border-[#E91E8C]"
            />
            <button
              onClick={handleAiRefineCopy}
              disabled={savingCopy || !copyRequirement.trim()}
              className="rounded-md bg-[#E91E8C] px-2 py-1 text-[10px] text-white transition hover:bg-[#D11B7A] disabled:opacity-50"
            >
              {savingCopy ? <Loader2 className="inline h-3 w-3 animate-spin" /> : <Wand2 className="inline h-3 w-3" />}
              <span className="ml-1">AI 重调文案</span>
            </button>
          </div>
        )}

        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B7280] pt-1">提示词层</div>
        <div className="space-y-2 rounded-md border border-[#2D2D3A] bg-[#14141C] p-2">
          <label className="text-[10px] text-[#9CA3AF]">节点拓展（生成多个下一节点候选）</label>
          <textarea
            value={expandIdea}
            onChange={(e) => setExpandIdea(e.target.value)}
            rows={2}
            placeholder="输入你的意向，例如：转到冲突升级、节奏更快、情绪转折..."
            className="w-full resize-y rounded-md border border-[#2D2D3A] bg-[#101017] px-2 py-1 text-xs text-[#E5E7EB] outline-none focus:border-[#E91E8C]"
          />
          <div className="flex items-center gap-2">
            <select
              value={expandCount}
              onChange={(e) => setExpandCount(Number(e.target.value))}
              className="rounded-md border border-[#2D2D3A] bg-[#101017] px-2 py-1 text-[10px] text-[#E5E7EB]"
            >
              <option value={2}>2 个候选</option>
              <option value={3}>3 个候选</option>
              <option value={4}>4 个候选</option>
            </select>
            <button
              onClick={handleGenerateCandidates}
              disabled={expanding || !expandIdea.trim()}
              className="rounded-md bg-[#5B21B6] px-2 py-1 text-[10px] text-white transition hover:bg-[#6D28D9] disabled:opacity-50"
            >
              {expanding ? <Loader2 className="inline h-3 w-3 animate-spin" /> : <Wand2 className="inline h-3 w-3" />}
              <span className="ml-1">生成候选</span>
            </button>
          </div>

          {candidateList.length > 0 && (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {candidateList.map((candidate, index) => (
                <div
                  key={`${id}-candidate-${index}`}
                  className="rounded-md border border-[#2D2D3A] bg-[#0F1016] p-2"
                >
                  <div className="mb-1 text-[10px] font-medium text-[#D8B4FE]">候选 {index + 1}</div>
                  <div className="space-y-1 text-[10px] text-[#D1D5DB]">
                    <div><span className="text-[#9CA3AF]">内容：</span>{candidate.scriptSegment}</div>
                    <div><span className="text-[#9CA3AF]">视频提示词：</span>{candidate.videoPrompt}</div>
                    <div><span className="text-[#9CA3AF]">画面提示词：</span>{candidate.sceneFramePrompt}</div>
                    <div><span className="text-[#9CA3AF]">首帧提示词：</span>{candidate.firstFramePrompt}</div>
                    <div><span className="text-[#9CA3AF]">尾帧提示词：</span>{candidate.lastFramePrompt}</div>
                  </div>
                  <button
                    onClick={() => handleAdoptCandidate(candidate, index)}
                    disabled={adoptingIndex !== null}
                    className="mt-2 rounded-md bg-[#E91E8C] px-2 py-1 text-[10px] text-white transition hover:bg-[#D11B7A] disabled:opacity-50"
                  >
                    {adoptingIndex === index ? (
                      <>
                        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                        采用中...
                      </>
                    ) : (
                      '采用该候选为下一节点'
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">画面锚点层</div>
        {isFirstMainNode ? (
          <>
            <div>
              <label className="text-[10px] text-[#6B7280]">首帧提示词</label>
              <input
                value={String(data.firstFramePrompt || '')}
                onChange={(e) => updateNodeLocalData(id, { firstFramePrompt: e.target.value })}
                className="mt-1 w-full rounded-md border border-[#2D2D3A] bg-[#14141C] px-2 py-1 text-xs text-[#E5E7EB] outline-none focus:border-[#E91E8C]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#6B7280]">尾帧提示词</label>
              <input
                value={String(data.lastFramePrompt || '')}
                onChange={(e) => updateNodeLocalData(id, { lastFramePrompt: e.target.value })}
                className="mt-1 w-full rounded-md border border-[#2D2D3A] bg-[#14141C] px-2 py-1 text-xs text-[#E5E7EB] outline-none focus:border-[#E91E8C]"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="text-[10px] text-[#6B7280]">画面帧提示词（承接上一节点尾帧）</label>
            <input
              value={String(data.sceneFramePrompt || '')}
              onChange={(e) => updateNodeLocalData(id, { sceneFramePrompt: e.target.value })}
              className="mt-1 w-full rounded-md border border-[#2D2D3A] bg-[#14141C] px-2 py-1 text-xs text-[#E5E7EB] outline-none focus:border-[#E91E8C]"
            />
          </div>
        )}

        {isFirstMainNode ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <div className="aspect-video overflow-hidden rounded-lg bg-[#2D2D3A]">
                {firstFrameUrl ? (
                  <img src={firstFrameUrl} alt="首帧" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImagePlus className="h-4 w-4 text-[#6B7280]" />
                  </div>
                )}
              </div>
              <button
                onClick={toggleFirstLock}
                className="absolute right-1 top-1 rounded p-1 transition hover:bg-[#2D2D3A]"
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
            <div className="relative">
              <div className="aspect-video overflow-hidden rounded-lg bg-[#2D2D3A]">
                {lastFrameUrl ? (
                  <img src={lastFrameUrl} alt="尾帧" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImagePlus className="h-4 w-4 text-[#6B7280]" />
                  </div>
                )}
              </div>
              <button
                onClick={toggleLastLock}
                className="absolute right-1 top-1 rounded p-1 transition hover:bg-[#2D2D3A]"
                title={lastFrameLocked ? '解锁尾帧' : '锁定尾帧'}
              >
                {lastFrameLocked ? (
                  <Lock className="h-3 w-3 text-[#F59E0B]" />
                ) : (
                  <Unlock className="h-3 w-3 text-[#6B7280]" />
                )}
              </button>
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
                尾帧
              </span>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="aspect-video overflow-hidden rounded-lg bg-[#2D2D3A]">
              {sceneFrameUrl ? (
                <img src={sceneFrameUrl} alt="画面帧" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImagePlus className="h-4 w-4 text-[#6B7280]" />
                </div>
              )}
            </div>
            <button
              onClick={toggleFirstLock}
              className="absolute right-1 top-1 rounded p-1 transition hover:bg-[#2D2D3A]"
              title={firstFrameLocked ? '解锁画面帧' : '锁定画面帧'}
            >
              {firstFrameLocked ? (
                <Lock className="h-3 w-3 text-[#F59E0B]" />
              ) : (
                <Unlock className="h-3 w-3 text-[#6B7280]" />
              )}
            </button>
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
              画面帧
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-[#2D2D3A] px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">渲染状态层</div>
        <div className="flex gap-1">
          <button
            onClick={handlePrecheck}
            disabled={prechecking}
            className="flex-1 rounded-lg border border-[#2D2D3A] bg-[#1C1D26] py-1.5 text-[10px] text-[#E5E7EB] transition hover:bg-[#2A2C38] disabled:opacity-50"
          >
            {prechecking ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : <AlertCircle className="mr-1 inline h-3 w-3" />}
            预检
          </button>
          <button
            onClick={handleScore}
            disabled={scoring}
            className="flex-1 rounded-lg border border-[#2D2D3A] bg-[#1C1D26] py-1.5 text-[10px] text-[#E5E7EB] transition hover:bg-[#2A2C38] disabled:opacity-50"
          >
            {scoring ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 inline h-3 w-3" />}
            质量评分
          </button>
          {isBranchNode ? (
            <button
              onClick={handleCompareBranch}
              disabled={compareLoading}
              className="flex-1 rounded-lg border border-[#2D2D3A] bg-[#1C1D26] py-1.5 text-[10px] text-[#E5E7EB] transition hover:bg-[#2A2C38] disabled:opacity-50"
            >
              {compareLoading ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : <GitMerge className="mr-1 inline h-3 w-3" />}
              分支对比
            </button>
          ) : null}
        </div>

        {qualityBreakdown ? (
          <div className="rounded-lg border border-[#2D2D3A] bg-[#14141C] px-2 py-1.5 text-[10px] text-[#AEB4BF]">
            提示词完整度 {Math.round(qualityBreakdown.promptCompleteness)} · 连续性 {Math.round(qualityBreakdown.continuity)} · 渲染稳定性 {Math.round(qualityBreakdown.renderStability)}
          </div>
        ) : null}

        {precheckIssues && precheckIssues.length > 0 ? (
          <div className="rounded-lg border border-[#3D2A2A] bg-[#2B1E1E]/50 p-2 text-[10px] text-[#FCA5A5]">
            {precheckIssues[0].message}
          </div>
        ) : null}

        {compareResult ? (
          <div className="rounded-lg border border-[#2D2D3A] bg-[#14141C] p-2 text-[10px] text-[#CBD5E1]">
            <div className="font-medium text-[#E5E7EB]">
              合并建议：
              {compareResult.recommendation === 'merge_branch'
                ? '合并分支'
                : compareResult.recommendation === 'keep_main'
                  ? '保留主干'
                  : '人工复核'}
            </div>
            <div className="mt-1 text-[#9CA3AF]">
              综合差值 {compareResult.delta.overall > 0 ? '+' : ''}{compareResult.delta.overall.toFixed(1)}
            </div>
            <div className="mt-1 text-[#9CA3AF]">{compareResult.reasons[0]}</div>
          </div>
        ) : null}

        <div className="flex gap-1">
          {isFirstMainNode ? (
            <>
              <button
                onClick={triggerFirstFrame}
                disabled={isGeneratingFrame}
                className="flex-1 rounded-lg bg-[#2D2D3A] py-1.5 text-[10px] font-medium text-[#9CA3AF] transition hover:bg-[#3D3D4A] hover:text-white disabled:opacity-50"
              >
                {isGeneratingFrame ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : <ImagePlus className="mr-1 inline h-3 w-3" />}
                首帧
              </button>
              <button
                onClick={triggerLastFrame}
                disabled={isGeneratingFrame}
                className="flex-1 rounded-lg bg-[#2D2D3A] py-1.5 text-[10px] font-medium text-[#9CA3AF] transition hover:bg-[#3D3D4A] hover:text-white disabled:opacity-50"
              >
                {isGeneratingFrame ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : <ImagePlus className="mr-1 inline h-3 w-3" />}
                尾帧
              </button>
            </>
          ) : (
            <button
              onClick={triggerFirstFrame}
              disabled={isGeneratingFrame}
              className="flex-1 rounded-lg bg-[#2D2D3A] py-1.5 text-[10px] font-medium text-[#9CA3AF] transition hover:bg-[#3D3D4A] hover:text-white disabled:opacity-50"
            >
              {isGeneratingFrame ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : <ImagePlus className="mr-1 inline h-3 w-3" />}
              生成画面帧
            </button>
          )}
          <button
            onClick={handleRender}
            disabled={isRendering || renderStatus === 'PROCESSING'}
            className="flex-1 rounded-lg bg-[#E91E8C] py-1.5 text-[10px] font-medium text-white transition hover:bg-[#D11B7A] disabled:opacity-50"
          >
            {isRendering || renderStatus === 'PROCESSING' ? (
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
            ) : (
              <Play className="mr-1 inline h-3 w-3" />
            )}
            渲染
          </button>
        </div>

        {(isRendering || renderStatus === 'PROCESSING' || renderProgress > 0) && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] text-[#9CA3AF]">
              <span>渲染进度</span>
              <span>{Math.max(0, Math.min(100, Math.round(renderProgress)))}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-[#2D2D3A]">
              <div
                className="h-full bg-gradient-to-r from-[#E91E8C] to-[#9C27B0] transition-all"
                style={{ width: `${Math.max(0, Math.min(100, renderProgress))}%` }}
              />
            </div>
          </div>
        )}

        {renderedVideoUrl && (
          <div className="rounded-lg border border-[#2D2D3A] bg-[#14141C] p-2">
            <div className="mb-1 text-[10px] text-[#9CA3AF]">生成结果预览</div>
            <video src={renderedVideoUrl} controls className="w-full rounded bg-black" />
            <a
              href={renderedVideoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-[10px] text-[#60A5FA] hover:underline"
            >
              在新窗口查看视频
            </a>
          </div>
        )}
      </div>

      <div className="flex gap-1 px-3 pb-2">
        {!isBranchNode ? (
          <button
            onClick={handleCreateBranch}
            className="w-full rounded-lg border border-[#3D3D4A] bg-[#2A2230] py-1.5 text-[10px] font-medium text-[#D8B4FE] transition hover:bg-[#3A2A44]"
            title="基于当前节点新建分支"
          >
            <GitBranch className="mr-1 inline h-3 w-3" />
            新建分支
          </button>
        ) : (
          <button
            onClick={handleMergeBranch}
            disabled={Boolean(isMerged)}
            className="w-full rounded-lg border border-[#2D4A3D] bg-[#1F3028] py-1.5 text-[10px] font-medium text-[#86EFAC] transition hover:bg-[#2B4637] disabled:opacity-50"
            title="将分支合并回主干"
          >
            <GitMerge className="mr-1 inline h-3 w-3" />
            {isMerged ? '已合并' : '合并到主干'}
          </button>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-[#1E1E24] !bg-[#E91E8C]"
      />
    </div>
  );
}

export const FlowNodeCard = memo(FlowNodeCardComponent);
FlowNodeCard.displayName = 'FlowNodeCard';
