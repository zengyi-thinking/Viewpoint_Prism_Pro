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
import { FlowNodeCard } from './FlowNodeCard';
import { ScriptInput } from './ScriptInput';
import { StitchPanel } from './StitchPanel';
import { Plus, Loader2, AlertTriangle, Sparkles, Film, Clapperboard, Wand2 } from 'lucide-react';

// 定义自定义节点类型
const nodeTypes: any = {
  flowNodeCard: FlowNodeCard,
};

interface CreationCanvasProps {
  videoId: string;
  onTimeClick?: (timestamp: number) => void;
}

export function CreationCanvas({ videoId, onTimeClick }: CreationCanvasProps) {
  const [showScriptInput, setShowScriptInput] = useState(false);
  const [showStitchPanel, setShowStitchPanel] = useState(false);
  const [creationMode, setCreationMode] = useState<'quick' | 'prismflow'>('quick');
  const [quickAction, setQuickAction] = useState<'split' | 'simple'>('split');
  const [simpleIdea, setSimpleIdea] = useState('');
  const [isGeneratingNext, setIsGeneratingNext] = useState(false);

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
    const idea = simpleIdea.trim();
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
      const isFirstNode = storeNodes.length === 0;
      await generateNextNode({
        currentNodeId: fallbackNodeId,
        idea,
        ...(isFirstNode
          ? {
              scriptSegment: `故事开场：${idea}`,
              videoPrompt: `${idea}，电影感镜头，16:9，主体清晰，光线明确`,
              sceneFramePrompt: `${idea}，关键画面帧，构图稳定，16:9`,
              firstFramePrompt: `${idea}，开场首帧，电影感构图，16:9`,
              lastFramePrompt: `${idea}，结尾尾帧，情绪收束，16:9`,
            }
          : {}),
      });
      setSimpleIdea('');
    } catch (error) {
      console.error('Failed to generate next node in simple mode:', error);
    } finally {
      setIsGeneratingNext(false);
    }
  }, [simpleIdea, selectedNodeId, storeNodes, generateNextNode]);

  const hasNodes = storeNodes.length > 0;
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

      <div className="absolute top-4 left-4 z-10 flex max-w-[760px] flex-col gap-3">
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
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--creation-border-strong)] bg-[var(--creation-bg-elevated)] px-2 py-1.5">
                  <input
                    value={simpleIdea}
                    onChange={(e) => setSimpleIdea(e.target.value)}
                    placeholder={
                      hasNodes
                        ? selectedNodeId
                          ? '基于当前选中节点，输入续写 idea...'
                          : '输入 idea（将接在最后一个节点后）...'
                        : '输入故事开场 idea（将生成第一张完整节点卡）...'
                    }
                    className="w-[340px] rounded-md border border-[var(--creation-border-strong)] bg-[var(--creation-bg-canvas)] px-2 py-1.5 text-xs text-white outline-none focus:border-[#E91E8C]"
                  />
                  <button
                    onClick={handleGenerateNextNode}
                    disabled={isGeneratingNext || !simpleIdea.trim()}
                    className="flex items-center gap-1 rounded-lg bg-[var(--creation-accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--creation-accent-hover)] disabled:opacity-50"
                  >
                    {isGeneratingNext ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    {hasNodes ? 'AI 续写下一节点' : 'AI 生成首节点'}
                  </button>
                </div>
              )}
            </div>
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
