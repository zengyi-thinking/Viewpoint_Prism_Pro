'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeMouseHandler,
  NodeChange,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCreationStore, FlowNode, FlowEdge } from '@/stores/creation.store';
import { creationApi, IdeaPreviewResult } from '@/services/creation.api';
import { FlowNodeCard } from './FlowNodeCard';
import { ScriptInput } from './ScriptInput';
import { StitchPanel } from './StitchPanel';
import {
  Plus,
  Loader2,
  AlertTriangle,
  Sparkles,
  Film,
  Clapperboard,
  Wand2,
  Camera,
  ShieldAlert,
  Palette,
  CloudRain,
  Zap,
  Flame,
  Crosshair,
} from 'lucide-react';

// 定义自定义节点类型
const nodeTypes: any = {
  flowNodeCard: FlowNodeCard,
};

const settingPresets = [
  '赛博朋克九龙城寨',
  '荒废轨道站',
  '暴雨海港',
  '地下拳馆',
  '极寒雪原基地',
  '高空玻璃都市',
] as const;

const stylePresets = [
  '极度压抑',
  '霓虹高反差',
  '废土机甲风',
  '黑金史诗感',
  '冷白实验室',
  '高饱和漫画感',
] as const;

const spicePresets = [
  { label: '增加爆炸', icon: Flame, value: '增加爆炸与碎片冲击' },
  { label: '改变天气', icon: CloudRain, value: '加入极端天气变化' },
  { label: '慢动作强化', icon: Zap, value: '强化慢动作和速度反差' },
  { label: '压迫构图', icon: Crosshair, value: '提升压迫式构图和贴脸镜头' },
] as const;

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function composeIdeaFromBoard(input: {
  freeText: string;
  conflict: string;
  setting: string;
  style: string;
  cameraScale: number;
  spice: string[];
}) {
  const blocks = [
    input.freeText.trim(),
    input.conflict.trim() ? `核心冲突：${input.conflict.trim()}` : '',
    input.setting.trim() ? `场景设定：${input.setting.trim()}` : '',
    input.style.trim() ? `视觉风格：${input.style.trim()}` : '',
    `镜头尺度：${input.cameraScale <= 33 ? '宏大远景' : input.cameraScale <= 66 ? '中景推进' : '极近特写'}`,
    input.spice.length ? `强化元素：${input.spice.join('、')}` : '',
  ].filter(Boolean);
  return blocks.join('\n');
}

function buildPreviewAlias(index: number, preview: IdeaPreviewResult) {
  const prefixes = ['Take 1', 'Take 2', 'Take 3', 'Take 4'];
  const title = String(preview.title || '').trim();
  return `${prefixes[index] || `Take ${index + 1}`}: ${title || `方向 ${index + 1}`}`;
}

function extractPreviewChips(preview: IdeaPreviewResult) {
  const chips = [
    `🎥 ${preview.progressionBeat?.slice(0, 10) || '镜头推进'}`,
    `💡 ${preview.styleNotes?.slice(0, 10) || '风格控制'}`,
    `⏱️ ${preview.openingScene?.length > 20 ? '信息密度高' : '快速切入'}`,
  ];
  return chips.slice(0, 3);
}

interface CreationCanvasProps {
  videoId: string;
  onTimeClick?: (timestamp: number) => void;
}

export function CreationCanvas({ videoId, onTimeClick }: CreationCanvasProps) {
  const previewToneOptions = [
    { value: 'cinematic', label: '电影感' },
    { value: 'suspense', label: '悬疑' },
    { value: 'lyrical', label: '抒情' },
    { value: 'commercial', label: '商业化' },
    { value: 'fantasy', label: '奇幻' },
  ] as const;
  const [showScriptInput, setShowScriptInput] = useState(false);
  const [showStitchPanel, setShowStitchPanel] = useState(false);
  const [creationMode, setCreationMode] = useState<'quick' | 'prismflow'>('quick');
  const [quickAction, setQuickAction] = useState<'split' | 'simple'>('split');
  const [simpleIdea, setSimpleIdea] = useState('');
  const [ideaConflict, setIdeaConflict] = useState('');
  const [ideaSetting, setIdeaSetting] = useState('赛博朋克九龙城寨');
  const [ideaStyle, setIdeaStyle] = useState('霓虹高反差');
  const [ideaCameraScale, setIdeaCameraScale] = useState(58);
  const [ideaSpices, setIdeaSpices] = useState<string[]>([]);
  const [isGeneratingNext, setIsGeneratingNext] = useState(false);
  const [ideaPreviews, setIdeaPreviews] = useState<IdeaPreviewResult[]>([]);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState(0);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewTone, setPreviewTone] =
    useState<(typeof previewToneOptions)[number]['value']>('cinematic');

  const {
    nodes: storeNodes,
    edges: storeEdges,
    selectedNodeId,
    isLoading,
    error,
    loadNodes,
    createNode,
    generateNextNode,
    updateNode,
    deleteNode,
    selectNode,
    updateNodePosition,
    clear,
  } = useCreationStore();

  // 本地状态用于 React Flow
  const [nodes, setNodes, onNodesChangeStore] = useNodesState<FlowNode>(storeNodes as FlowNode[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(storeEdges as FlowEdge[]);

  // 当 store 中的节点变化时，同步到本地状态
  useEffect(() => {
    setNodes(storeNodes);
  }, [storeNodes, setNodes]);

  useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  // 加载节点数据
  useEffect(() => {
    if (videoId) {
      loadNodes(videoId);
    }

    return () => {
      clear();
    };
  }, [videoId, loadNodes, clear]);

  // 处理节点位置变化（拖拽）
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      // 应用本地变更
      setNodes((nds) => applyNodeChanges(changes, nds as any) as FlowNode[]);

      // 处理拖拽结束的位置更新
      changes.forEach((change) => {
        if (change.type === 'position' && 'position' in change && change.position && change.dragging === false) {
          updateNodePosition(change.id, change.position);
          // 异步保存到后端
          updateNode(change.id, { positionX: change.position.x, positionY: change.position.y });
        }
      });
    },
    [setNodes, updateNodePosition, updateNode]
  );

  // 处理连接
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: 'var(--creation-accent)' } }, eds));
    },
    [setEdges]
  );

  // 处理节点点击
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  // 处理节点双击（打开编辑器）
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      selectNode(node.id);
      // TODO: 打开节点编辑器面板
    },
    [selectNode]
  );

  // 处理背景点击（取消选择）
  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  // 添加新节点
  const handleAddNode = useCallback(() => {
    createNode({
      orderIndex: storeNodes.length,
      prompt: '',
      scriptSegment: '',
      positionX: 100 + Math.random() * 200,
      positionY: 100 + Math.random() * 200,
    });
  }, [createNode, storeNodes.length]);

  const handleGenerateNextNode = useCallback(async () => {
    const idea = composeIdeaFromBoard({
      freeText: simpleIdea,
      conflict: ideaConflict,
      setting: ideaSetting,
      style: ideaStyle,
      cameraScale: ideaCameraScale,
      spice: ideaSpices,
    }).trim();
    if (!idea) {
      window.alert('请输入 idea 后再生成下一节点');
      return;
    }

    const validSelectedNodeId =
      selectedNodeId && storeNodes.some((node) => node.id === selectedNodeId)
        ? selectedNodeId
        : undefined;

    const fallbackNodeId =
      validSelectedNodeId ||
      [...storeNodes]
        .sort((a, b) => Number(a.data.orderIndex || 0) - Number(b.data.orderIndex || 0))
        .at(-1)?.id;

    setIsGeneratingNext(true);
    try {
      await generateNextNode({
        currentNodeId: fallbackNodeId,
        idea,
      });
      setSimpleIdea('');
    } catch (error) {
      console.error('Failed to generate next node in simple mode:', error);
    } finally {
      setIsGeneratingNext(false);
    }
  }, [
    simpleIdea,
    ideaConflict,
    ideaSetting,
    ideaStyle,
    ideaCameraScale,
    ideaSpices,
    selectedNodeId,
    storeNodes,
    generateNextNode,
  ]);

  const handleGenerateIdeaPreview = useCallback(async () => {
    const idea = composeIdeaFromBoard({
      freeText: simpleIdea,
      conflict: ideaConflict,
      setting: ideaSetting,
      style: ideaStyle,
      cameraScale: ideaCameraScale,
      spice: ideaSpices,
    }).trim();
    if (!idea) {
      window.alert('请输入 idea 后再生成故事预览');
      return;
    }

    setIsGeneratingPreview(true);
    try {
      const response = await creationApi.generateIdeaPreview(videoId, {
        idea,
        count: 3,
        tone: previewTone,
      });
      setIdeaPreviews(response.previews || []);
      setSelectedPreviewIndex(0);
    } catch (error) {
      console.error('Failed to generate idea preview:', error);
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [previewTone, simpleIdea, ideaConflict, ideaSetting, ideaStyle, ideaCameraScale, ideaSpices, videoId]);

  const handleCreateFirstNodeFromPreview = useCallback(async () => {
    const idea = composeIdeaFromBoard({
      freeText: simpleIdea,
      conflict: ideaConflict,
      setting: ideaSetting,
      style: ideaStyle,
      cameraScale: ideaCameraScale,
      spice: ideaSpices,
    }).trim();
    const selectedPreview = ideaPreviews[selectedPreviewIndex];
    if (!idea || !selectedPreview) return;

    setIsGeneratingNext(true);
    try {
      await generateNextNode({
        idea,
        ...selectedPreview.promptBundle,
      });
      setSimpleIdea('');
      setIdeaConflict('');
      setIdeaPreviews([]);
      setSelectedPreviewIndex(0);
      setCreationMode('prismflow');
    } catch (error) {
      console.error('Failed to create first node from preview:', error);
    } finally {
      setIsGeneratingNext(false);
    }
  }, [
    generateNextNode,
    ideaPreviews,
    selectedPreviewIndex,
    simpleIdea,
    ideaConflict,
    ideaSetting,
    ideaStyle,
    ideaCameraScale,
    ideaSpices,
  ]);

  const toggleSpice = useCallback((value: string) => {
    setIdeaSpices((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }, []);

  const hasNodes = storeNodes.length > 0;
  const selectedPreview = ideaPreviews[selectedPreviewIndex] || null;
  const modeHint =
    creationMode === 'quick'
      ? quickAction === 'split'
        ? '快速模式：整段文案拆成节点草稿'
        : hasNodes
          ? '快速模式：基于当前节点续写下一镜头'
          : '快速模式：一句 idea 生成首节点'
      : 'PrismFlow 工程模式：节点编排 / 分支合并 / 串联导出';

  // 加载状态
  if (isLoading && storeNodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--creation-bg-canvas)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--creation-accent)]" />
          <span className="text-sm text-[var(--creation-text-secondary)]">加载节点中...</span>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error && storeNodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--creation-bg-canvas)]">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-[var(--color-error)]" />
          <span className="text-sm text-[var(--color-error)]">{error}</span>
          <button
            onClick={() => loadNodes(videoId)}
            className="mt-2 rounded-lg bg-[var(--creation-accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--creation-accent-hover)]"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* React Flow 画布 */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#E91E8C', strokeWidth: 2 },
        }}
        // 深色主题
        style={{ backgroundColor: 'var(--creation-bg-canvas)' }}
      >
        {/* 网格背景 */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          color="var(--creation-border-strong)"
        />

        {/* 缩放控件 */}
        <Controls
          className="bg-[var(--creation-bg-elevated)] border-[var(--creation-border-strong)] rounded-lg shadow-lg"
          showZoom
          showFitView
          showInteractive={false}
        />

        {/* 小地图 */}
        <MiniMap
          className="bg-[var(--creation-bg-elevated)] border-[var(--creation-border-strong)] rounded-lg"
          nodeColor="var(--creation-accent)"
          maskColor="rgba(0, 0, 0, 0.18)"
        />
      </ReactFlow>

      <div className="absolute top-4 left-4 bottom-4 z-10 flex w-[min(760px,calc(100%-2rem))] max-w-[760px] flex-col gap-3 overflow-y-auto pr-2">
        <div className="rounded-2xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-overlay)]/92 p-3 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--creation-text-muted)]">Creation Entry</div>
              <h3 className="mt-1 text-sm font-semibold text-white">创作棱镜双入口</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--creation-text-secondary)]">
                快速模式先产出第一版，PrismFlow 模式用于精修节点、分支与导出。
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-input-deep)] p-1">
              <button
                onClick={() => setCreationMode('quick')}
                className={[
                  'rounded-lg px-3 py-1.5 text-xs transition',
                  creationMode === 'quick'
                    ? 'bg-[var(--creation-accent)] text-white'
                    : 'text-[var(--creation-text-secondary)] hover:bg-[var(--creation-bg-input-deep)] hover:text-white',
                ].join(' ')}
              >
                快速模式
              </button>
              <button
                onClick={() => setCreationMode('prismflow')}
                className={[
                  'rounded-lg px-3 py-1.5 text-xs transition',
                  creationMode === 'prismflow'
                    ? 'bg-[var(--creation-accent)] text-white'
                    : 'text-[var(--creation-text-secondary)] hover:bg-[var(--creation-bg-input-deep)] hover:text-white',
                ].join(' ')}
              >
                PrismFlow
              </button>
            </div>
          </div>
        </div>

        {creationMode === 'quick' ? (
          <div className="rounded-2xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-overlay)]/92 p-3 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-[var(--creation-text-secondary)]">
                {!hasNodes
                  ? '当前没有节点：可先做 AI 文案拆分，或直接输入 idea 一键生成首节点。'
                  : selectedNodeId
                    ? '当前将基于选中节点续写；如未选中，默认接在最后一个节点后。'
                    : '当前未选中节点，默认接在最后一个节点后续写。'}
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-input-deep)] p-1">
                <button
                  onClick={() => setQuickAction('split')}
                  className={[
                    'rounded-lg px-3 py-1.5 text-xs transition',
                    quickAction === 'split'
                      ? 'bg-[var(--creation-accent)] text-white'
                      : 'text-[var(--creation-text-secondary)] hover:bg-[var(--creation-bg-input-deep)] hover:text-white',
                  ].join(' ')}
                >
                  文案拆分
                </button>
                <button
                  onClick={() => setQuickAction('simple')}
                  className={[
                    'rounded-lg px-3 py-1.5 text-xs transition',
                    quickAction === 'simple'
                      ? 'bg-[var(--creation-accent)] text-white'
                      : 'text-[var(--creation-text-secondary)] hover:bg-[var(--creation-bg-input-deep)] hover:text-white',
                  ].join(' ')}
                >
                  Idea 生成
                </button>
              </div>
            </div>

            <div className="mt-3">
              {quickAction === 'split' ? (
                <button
                  onClick={() => setShowScriptInput(true)}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--creation-accent)] to-[var(--creation-accent-hover)] px-4 py-2 text-sm font-medium text-white shadow-lg shadow-[var(--creation-accent)]/30 transition hover:opacity-90"
                >
                  <Sparkles className="h-4 w-4" />
                  AI 文案拆分
                </button>
              ) : (
                <div className="rounded-2xl border border-[var(--creation-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-3">
                  <div className="flex items-center gap-2 border-b border-[var(--creation-border-strong)] pb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--creation-accent)]/15 text-[var(--creation-accent)]">
                      <Clapperboard className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-[var(--creation-text-muted)]">Clapperboard Input</div>
                      <div className="text-sm font-semibold text-white">场记打板式灵感输入</div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_0.9fr]">
                    <div className="space-y-3">
                      <label className="block rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] px-3 py-3">
                        <div className="text-[11px] font-medium text-[var(--creation-text-muted)]">自由想法</div>
                        <textarea
                          value={simpleIdea}
                          onChange={(e) => {
                            setSimpleIdea(e.target.value);
                            if (!hasNodes && ideaPreviews.length > 0) {
                              setIdeaPreviews([]);
                              setSelectedPreviewIndex(0);
                            }
                          }}
                          rows={2}
                          placeholder={
                            hasNodes
                              ? '例如：让这场冲突升级，并把镜头推进到致命一击前...'
                              : '例如：我想拍一场中国功夫与西方剑术在赛博雨夜中的对决...'
                          }
                          className="mt-2 w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-[var(--creation-text-muted)]"
                        />
                      </label>

                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] px-3 py-3">
                          <div className="text-[11px] font-medium text-[var(--creation-text-muted)]">核心冲突</div>
                          <input
                            value={ideaConflict}
                            onChange={(e) => setIdeaConflict(e.target.value)}
                            placeholder="功夫与剑术的对决"
                            className="mt-2 w-full bg-transparent text-sm text-white outline-none placeholder:text-[var(--creation-text-muted)]"
                          />
                        </label>

                        <label className="rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] px-3 py-3">
                          <div className="text-[11px] font-medium text-[var(--creation-text-muted)]">场景设定</div>
                          <select
                            value={ideaSetting}
                            onChange={(e) => setIdeaSetting(e.target.value)}
                            className="mt-2 w-full bg-transparent text-sm text-white outline-none"
                          >
                            {settingPresets.map((item) => (
                              <option key={item} value={item} className="bg-[#111318] text-white">
                                {item}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] px-3 py-3">
                          <div className="text-[11px] font-medium text-[var(--creation-text-muted)]">视觉风格</div>
                          <select
                            value={ideaStyle}
                            onChange={(e) => setIdeaStyle(e.target.value)}
                            className="mt-2 w-full bg-transparent text-sm text-white outline-none"
                          >
                            {stylePresets.map((item) => (
                              <option key={item} value={item} className="bg-[#111318] text-white">
                                {item}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] px-3 py-3">
                      <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--creation-text-muted)]">
                        <Camera className="h-3.5 w-3.5" />
                        导演预设
                      </div>
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-[var(--creation-text-secondary)]">
                          <span>镜头尺度</span>
                          <span>{ideaCameraScale <= 33 ? '宏大远景' : ideaCameraScale <= 66 ? '中景推进' : '极近特写'}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={ideaCameraScale}
                          onChange={(e) => setIdeaCameraScale(Number(e.target.value))}
                          className="mt-2 w-full accent-[var(--creation-accent)]"
                        />
                      </div>
                      <div className="mt-4">
                        <div className="flex items-center gap-2 text-xs text-[var(--creation-text-secondary)]">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          加点料
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {spicePresets.map((item) => {
                            const active = ideaSpices.includes(item.value);
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.value}
                                onClick={() => toggleSpice(item.value)}
                                className={cn(
                                  'flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] transition',
                                  active
                                    ? 'border-[var(--creation-accent)] bg-[var(--creation-accent)]/15 text-white'
                                    : 'border-[var(--creation-border-strong)] text-[var(--creation-text-secondary)] hover:text-white',
                                )}
                              >
                                <Icon className="h-3 w-3" />
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={hasNodes ? handleGenerateNextNode : handleGenerateIdeaPreview}
                      disabled={(hasNodes ? isGeneratingNext : isGeneratingPreview) || !composeIdeaFromBoard({
                        freeText: simpleIdea,
                        conflict: ideaConflict,
                        setting: ideaSetting,
                        style: ideaStyle,
                        cameraScale: ideaCameraScale,
                        spice: ideaSpices,
                      }).trim()}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--creation-accent)] to-[var(--creation-accent-hover)] px-4 py-2 text-sm font-medium text-white shadow-lg shadow-[var(--creation-accent)]/25 transition hover:opacity-90 disabled:opacity-50"
                    >
                      {(hasNodes ? isGeneratingNext : isGeneratingPreview) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                      {hasNodes ? '推演下一镜' : '生成分镜墙'}
                    </button>
                    <div className="rounded-lg border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] px-3 py-2 text-[11px] leading-5 text-[var(--creation-text-secondary)]">
                      系统将自动组合冲突、场景、风格、镜头尺度与强化元素，再交给后端 StoryPlanner / ShotDesigner 生成预览。
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!hasNodes && quickAction === 'simple' ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-[var(--creation-text-muted)]">预览调性</span>
                {previewToneOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setPreviewTone(option.value)}
                    className={[
                      'rounded-full px-3 py-1 text-xs transition',
                      previewTone === option.value
                        ? 'bg-[var(--creation-accent)] text-white'
                        : 'border border-[var(--creation-border-strong)] text-[var(--creation-text-secondary)] hover:text-white',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}

            {!hasNodes && ideaPreviews.length > 0 && selectedPreview ? (
              <div className="mt-3 rounded-2xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-elevated)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-[var(--creation-text-muted)]">Storyboard View</div>
                    <h4 className="mt-1 text-base font-semibold text-white">分镜墙</h4>
                    <p className="mt-1 text-xs leading-5 text-[var(--creation-text-secondary)]">
                      先看不同开场方向，再确认第一镜。确认后会直接落到时间轴/画布里成为节点 1。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setIdeaPreviews([]);
                        setSelectedPreviewIndex(0);
                      }}
                      className="rounded-lg border border-[var(--creation-border-strong)] px-3 py-1.5 text-xs text-[var(--creation-text-secondary)] transition hover:text-white"
                    >
                      重新想想
                    </button>
                    <button
                      onClick={handleGenerateIdeaPreview}
                      disabled={isGeneratingPreview}
                      className="rounded-lg border border-[var(--creation-border-strong)] px-3 py-1.5 text-xs text-[var(--creation-text-secondary)] transition hover:text-white disabled:opacity-50"
                    >
                      {isGeneratingPreview ? '重想中...' : '再来 3 个方向'}
                    </button>
                    <button
                      onClick={handleCreateFirstNodeFromPreview}
                      disabled={isGeneratingNext}
                      className="rounded-lg bg-[var(--creation-accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--creation-accent-hover)] disabled:opacity-50"
                    >
                      {isGeneratingNext ? '创建中...' : '确认并创建首节点'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {ideaPreviews.map((preview, index) => {
                    const isActive = index === selectedPreviewIndex;
                    const chips = extractPreviewChips(preview);
                    return (
                      <button
                        key={`${preview.title}-${index}`}
                        onClick={() => setSelectedPreviewIndex(index)}
                        className={[
                          'rounded-2xl border p-4 text-left transition',
                          isActive
                            ? 'border-[var(--creation-accent)] bg-[linear-gradient(180deg,rgba(233,30,140,0.08),rgba(17,19,24,0.95))] shadow-lg shadow-[var(--creation-accent)]/10'
                            : 'border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)]/80 hover:border-[var(--creation-border-hover)]',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--creation-text-muted)]">
                            {buildPreviewAlias(index, preview)}
                          </div>
                          <div className={cn('h-3 w-3 rounded-full', isActive ? 'bg-[var(--creation-accent)]' : 'bg-[var(--creation-border-strong)]')} />
                        </div>
                        <blockquote className="mt-4 text-base font-semibold leading-7 text-white">
                          {preview.openingScene}
                        </blockquote>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {chips.map((chip) => (
                            <span
                              key={`${preview.title}-${chip}`}
                              className="rounded-full border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] px-2.5 py-1 text-[11px] text-[var(--creation-text-secondary)]"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] p-4">
                      <div className="text-xs font-medium text-[var(--creation-text-muted)]">核心视觉区</div>
                      <blockquote className="mt-2 text-lg font-semibold leading-8 text-white">
                        “{selectedPreview.openingScene}”
                      </blockquote>
                    </div>
                    <div className="rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] p-4">
                      <div className="text-xs font-medium text-[var(--creation-text-muted)]">导演笔记</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {extractPreviewChips(selectedPreview).map((chip) => (
                          <span
                            key={`selected-${chip}`}
                            className="rounded-full border border-[var(--creation-border-strong)] bg-[var(--creation-bg-elevated)] px-3 py-1.5 text-xs text-white"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--creation-text-secondary)]">
                        {selectedPreview.progressionBeat}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] p-4">
                      <div className="flex items-center gap-2 text-xs font-medium text-[var(--creation-text-muted)]">
                        <Palette className="h-3.5 w-3.5" />
                        导演控制台
                      </div>
                      <div className="mt-3 space-y-3">
                        <div>
                          <div className="text-[11px] text-[var(--creation-text-secondary)]">镜头推拉杆</div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={ideaCameraScale}
                            onChange={(e) => setIdeaCameraScale(Number(e.target.value))}
                            className="mt-2 w-full accent-[var(--creation-accent)]"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {stylePresets.slice(0, 4).map((item) => (
                            <button
                              key={`director-${item}`}
                              onClick={() => setIdeaStyle(item)}
                              className={cn(
                                'rounded-full border px-3 py-1.5 text-xs transition',
                                ideaStyle === item
                                  ? 'border-[var(--creation-accent)] bg-[var(--creation-accent)]/15 text-white'
                                  : 'border-[var(--creation-border-strong)] text-[var(--creation-text-secondary)] hover:text-white',
                              )}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {spicePresets.map((item) => {
                            const Icon = item.icon;
                            return (
                              <button
                                key={`director-spice-${item.value}`}
                                onClick={() => toggleSpice(item.value)}
                                className={cn(
                                  'flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition',
                                  ideaSpices.includes(item.value)
                                    ? 'border-[var(--creation-accent)] bg-[var(--creation-accent)]/15 text-white'
                                    : 'border-[var(--creation-border-strong)] text-[var(--creation-text-secondary)] hover:text-white',
                                )}
                              >
                                <Icon className="h-3 w-3" />
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={handleGenerateIdeaPreview}
                          disabled={isGeneratingPreview}
                          className="inline-flex items-center gap-2 rounded-lg border border-[var(--creation-border-strong)] px-3 py-2 text-xs text-[var(--creation-text-secondary)] transition hover:text-white disabled:opacity-50"
                        >
                          {isGeneratingPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          依据当前导演控制台重写预览
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] p-4">
                      <div className="text-xs font-medium text-[var(--creation-text-muted)]">首节点文案草稿</div>
                      <p className="mt-2 text-sm leading-6 text-white">{selectedPreview.promptBundle.scriptSegment}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] p-4">
                      <div className="text-xs font-medium text-[var(--creation-text-muted)]">确认清单</div>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-white">
                        {selectedPreview.confirmationChecklist.map((item, index) => (
                          <li key={`${item}-${index}`} className="flex gap-2">
                            <span className="text-[var(--creation-accent)]">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] p-4">
                      <div className="text-xs font-medium text-[var(--creation-text-muted)]">时间轴串联</div>
                      <p className="mt-2 text-sm leading-6 text-[var(--creation-text-secondary)]">
                        确认后，这张卡会自动吸附到 00:00，成为节点 1。随后右侧将出现“推演下一镜”，继续沿着当前世界观和镜头基调往下生成。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-overlay)]/92 p-3 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-[var(--creation-text-secondary)]">适合精细控制：节点编排、分支对比、质量评估、串联导出。</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddNode}
                  className="flex items-center gap-2 rounded-xl bg-[var(--creation-bg-elevated)] border border-[var(--creation-border-strong)] px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-[var(--creation-bg-input-deep)]"
                >
                  <Plus className="h-4 w-4" />
                  添加节点
                </button>
                <button
                  onClick={() => setShowStitchPanel(true)}
                  className="flex items-center gap-2 rounded-xl bg-[var(--creation-bg-elevated)] border border-[var(--creation-border-strong)] px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-[var(--creation-bg-input-deep)]"
                >
                  <Film className="h-4 w-4" />
                  串联导出
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-elevated)]/92 px-3 py-2 text-xs text-[var(--creation-text-secondary)] backdrop-blur-sm">
          {creationMode === 'quick' ? (
            <>
              <Wand2 className="h-3.5 w-3.5 text-[var(--creation-accent)]" />
              <span>{modeHint}</span>
            </>
          ) : (
            <>
              <Clapperboard className="h-3.5 w-3.5 text-[var(--creation-accent)]" />
              <span>{modeHint}</span>
            </>
          )}
        </div>
      </div>

      {/* Script Input Modal */}
      <ScriptInput
        videoId={videoId}
        isOpen={showScriptInput}
        onClose={() => setShowScriptInput(false)}
      />

      {/* Stitch Panel */}
      <StitchPanel
        videoId={videoId}
        isOpen={showStitchPanel}
        onClose={() => setShowStitchPanel(false)}
      />

      {/* 节点计数 */}
      <div className="absolute bottom-4 right-4 rounded-lg bg-[var(--creation-bg-elevated)]/80 px-3 py-1.5 text-xs text-[var(--creation-text-secondary)] backdrop-blur-sm">
        节点: {storeNodes.length}
      </div>

      {/* 快捷操作提示 */}
      <div className="absolute top-4 right-14 max-w-[320px] rounded-lg bg-[var(--creation-bg-elevated)]/80 px-3 py-1.5 text-[10px] text-[var(--creation-text-muted)] backdrop-blur-sm">
        双击节点编辑 | 拖拽调整位置 | 快速模式先产出第一版，PrismFlow 再做精修
      </div>
    </div>
  );
}
