'use client';

import '@xyflow/react/dist/style.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Background, Controls, Edge, MiniMap, Node, ReactFlow } from '@xyflow/react';
import { useWorkbenchStore } from '@/stores/workbench.store';
import { useWebSocket } from '@/hooks/use-websocket';
import {
  CharacterAnchor,
  CreationGraphNode,
  CreationGraphResponse,
  CreationNextCandidate,
  IdeaPreviewOption,
  ScriptPlanChapter,
  creationApi,
} from '@/services/creation.api';
import { FlowNodeCard, FlowNodeData } from './FlowNodeCard';

const nodeTypes: any = { storyboard: FlowNodeCard };

function createEmptyCharacterAnchor(): CharacterAnchor {
  return {
    identity: '',
    hair: '',
    outfit: '',
    face: '',
    prop: '',
  };
}

function normalizeGraph(graph: CreationGraphResponse): CreationGraphResponse {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      characterAnchor: node.characterAnchor || createEmptyCharacterAnchor(),
      continuityLocked: Boolean(node.continuityLocked),
    })),
  };
}

function toFlowNodes(
  nodes: CreationGraphNode[],
  loadingState: {
    imageLoadingNodeId: string | null;
    videoLoadingNodeId: string | null;
    nextLoadingNodeId: string | null;
  },
  handlers: {
    onSelect: (nodeId: string) => void;
    onGenerateImage: (nodeId: string) => void;
    onRenderVideo: (nodeId: string) => void;
    onGenerateNext: (nodeId: string) => void;
    onDelete: (nodeId: string) => void;
  },
): Node<FlowNodeData>[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => ({
    id: node.id,
    type: 'storyboard',
    position: {
      x: node.positionX || 120 + node.orderIndex * 340,
      y: node.positionY || 160,
    },
    data: {
      orderIndex: node.orderIndex,
      title: node.title,
      scriptSegment: node.scriptSegment,
      displayPromptCn: node.displayPromptCn,
      imagePromptCn: node.imagePromptCn,
      continuityNotes: node.continuityNotes,
      characterAnchor: node.characterAnchor,
      continuityLocked: node.continuityLocked,
      parentTitle: node.parentNodeId ? nodeMap.get(node.parentNodeId)?.title || null : null,
      parentImageUrl: node.parentNodeId
        ? nodeMap.get(node.parentNodeId)?.lastFrameUrl || nodeMap.get(node.parentNodeId)?.firstFrameUrl || null
        : null,
      firstFrameUrl: node.firstFrameUrl,
      imageUrl: node.lastFrameUrl || node.firstFrameUrl,
      videoUrl: node.renderedVideoUrl,
      renderStatus: node.renderStatus,
      isGeneratingImage: loadingState.imageLoadingNodeId === node.id,
      isRenderingVideo: loadingState.videoLoadingNodeId === node.id,
      isGeneratingNext: loadingState.nextLoadingNodeId === node.id,
      onSelect: () => handlers.onSelect(node.id),
      onGenerateImage: () => handlers.onGenerateImage(node.id),
      onRenderVideo: () => handlers.onRenderVideo(node.id),
      onGenerateNext: () => handlers.onGenerateNext(node.id),
      onDelete: () => handlers.onDelete(node.id),
    },
  }));
}

function toFlowEdges(nodes: CreationGraphNode[]): Edge[] {
  return nodes
    .filter((node) => node.parentNodeId)
    .map((node) => ({
      id: `${node.parentNodeId}-${node.id}`,
      source: node.parentNodeId!,
      target: node.id,
      animated: node.renderStatus === 'PROCESSING',
      style: { stroke: '#E91E8C', strokeWidth: 2.5 },
    }));
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-border-subtle bg-bg-panel px-4 py-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-text-tertiary">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function CreationCanvas({ projectId }: { projectId?: string }) {
  const currentVideo = useWorkbenchStore((s) => s.currentVideo);
  const [graph, setGraph] = useState<CreationGraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'idea' | 'script'>('idea');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [ideaForm, setIdeaForm] = useState({
    idea: '',
    conflict: '',
    setting: '',
    visualGoal: '',
    constraints: '',
  });
  const [scriptText, setScriptText] = useState('');
  const [nextIntent, setNextIntent] = useState('');
  const [nextCandidates, setNextCandidates] = useState<CreationNextCandidate[]>([]);
  const [busyText, setBusyText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [imageLoadingNodeId, setImageLoadingNodeId] = useState<string | null>(null);
  const [videoLoadingNodeId, setVideoLoadingNodeId] = useState<string | null>(null);
  const [nextLoadingNodeId, setNextLoadingNodeId] = useState<string | null>(null);

  const loadGraph = useCallback(
    async (flowProjectId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await creationApi.getGraph(flowProjectId);
        setGraph(normalizeGraph(result));
        setMode(result.project.mode || 'idea');
        setSelectedNodeId((prev) => prev || result.nodes[0]?.id || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载创作工程失败');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const bootstrap = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await creationApi.bootstrap(projectId, currentVideo?.id);
      setGraph(normalizeGraph(result));
      setMode(result.project.mode || 'idea');
      setSelectedNodeId(result.nodes[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化创作工程失败');
    } finally {
      setLoading(false);
    }
  }, [currentVideo?.id, projectId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useWebSocket({
    projectId,
    onTaskComplete: (event) => {
      if (!graph?.project.id) return;
      if (['render', 'export', 'creation_image'].includes(event.task)) {
        const completedNodeId = event?.result?.nodeId as string | undefined;
        if (event.task === 'render' && completedNodeId) {
          setVideoLoadingNodeId((prev) => (prev === completedNodeId ? null : prev));
        }
        void loadGraph(graph.project.id);
      }
    },
    onTaskError: (event) => {
      if (['render', 'export', 'creation_image'].includes(event.task)) {
        if (event.task === 'render' && event.nodeId) {
          setVideoLoadingNodeId((prev) => (prev === event.nodeId ? null : prev));
        }
        setError(event.error);
      }
    },
  });

  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) || null,
    [graph?.nodes, selectedNodeId],
  );

  const flowNodes = useMemo(
    () =>
      toFlowNodes(graph?.nodes || [], {
        imageLoadingNodeId,
        videoLoadingNodeId,
        nextLoadingNodeId,
      }, {
        onSelect: setSelectedNodeId,
        onGenerateImage: (nodeId) => {
          setSelectedNodeId(nodeId);
          setImageLoadingNodeId(nodeId);
          void creationApi.generateNodeImage(nodeId).then(async () => {
            if (graph?.project.id) await loadGraph(graph.project.id);
          }).catch((err) => {
            setError(err instanceof Error ? err.message : '生成节点图片失败');
          }).finally(() => {
            setImageLoadingNodeId((prev) => (prev === nodeId ? null : prev));
          });
        },
        onRenderVideo: (nodeId) => {
          setSelectedNodeId(nodeId);
          setVideoLoadingNodeId(nodeId);
          void creationApi.renderNodeVideo(nodeId).then(async () => {
            if (graph?.project.id) await loadGraph(graph.project.id);
          }).catch((err) => {
            setError(err instanceof Error ? err.message : '提交渲染失败');
            setVideoLoadingNodeId((prev) => (prev === nodeId ? null : prev));
          });
        },
        onGenerateNext: (nodeId) => {
          setSelectedNodeId(nodeId);
          setNextCandidates([]);
          void handleGenerateNextCandidates(nodeId);
        },
        onDelete: (nodeId) => {
          void handleDeleteNode(nodeId);
        },
      }),
    [graph?.nodes, graph?.project.id, imageLoadingNodeId, videoLoadingNodeId, nextLoadingNodeId, loadGraph],
  );
  const flowEdges = useMemo(() => toFlowEdges(graph?.nodes || []), [graph?.nodes]);

  const patchSelectedNode = (patch: Partial<CreationGraphNode>) => {
    setGraph((prev) => {
      if (!prev || !selectedNodeId) return prev;
      return {
        ...prev,
        nodes: prev.nodes.map((node) => (node.id === selectedNodeId ? { ...node, ...patch } : node)),
      };
    });
  };

  const handleDeleteNode = async (nodeId: string) => {
    const targetNode = graph?.nodes.find((node) => node.id === nodeId);
    if (!targetNode) return;
    const confirmed = window.confirm(`确认删除节点「${targetNode.title || `node${targetNode.orderIndex + 1}`}」吗？`);
    if (!confirmed) return;

    setBusyText('正在删除节点');
    setError(null);
    try {
      const result = await creationApi.deleteNode(nodeId);
      const normalized = normalizeGraph(result);
      setGraph(normalized);
      setSelectedNodeId((prev) => {
        if (prev && prev !== nodeId && normalized.nodes.some((node) => node.id === prev)) {
          return prev;
        }
        return normalized.nodes[0]?.id || null;
      });
      setNextCandidates([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除节点失败');
    } finally {
      setBusyText('');
    }
  };

  const handleNodeDragStop = useCallback(
    async (_event: unknown, node: Node<FlowNodeData>) => {
      setGraph((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          nodes: prev.nodes.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  positionX: node.position.x,
                  positionY: node.position.y,
                }
              : item,
          ),
        };
      });

      try {
        await creationApi.updateNode(node.id, {
          positionX: node.position.x,
          positionY: node.position.y,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : '保存节点位置失败');
      }
    },
    [],
  );

  const handleGenerateIdeaPreviews = async () => {
    if (!projectId || !ideaForm.idea.trim()) return;
    setBusyText('正在生成故事方向');
    setError(null);
    try {
      const result = await creationApi.generateIdeaPreviews(projectId, {
        ...ideaForm,
        count: 3,
        backgroundVideoId: currentVideo?.id,
      });
      await loadGraph(result.flowProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成故事方向失败');
    } finally {
      setBusyText('');
    }
  };

  const handleResetIdeaStory = async () => {
    if (!graph?.project.id) return;
    const confirmed = window.confirm('确认开始一个新的故事吗？当前创作棱镜中的节点、预览和章节规划会被清空。');
    if (!confirmed) return;

    setBusyText('正在清空当前故事');
    setError(null);
    try {
      const result = await creationApi.resetProject(graph.project.id);
      const normalized = normalizeGraph(result);
      setGraph(normalized);
      setMode('idea');
      setSelectedNodeId(null);
      setNextCandidates([]);
      setNextIntent('');
      setScriptText('');
      setIdeaForm({
        idea: '',
        conflict: '',
        setting: '',
        visualGoal: '',
        constraints: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置创作工程失败');
    } finally {
      setBusyText('');
    }
  };

  const handleSelectPreview = async (previewId: string) => {
    if (!graph?.project.id) return;
    setBusyText('正在创建首节点');
    setError(null);
    try {
      const result = await creationApi.selectIdeaPreview(graph.project.id, previewId);
      setGraph(normalizeGraph(result));
      setSelectedNodeId(result.nodes[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建首节点失败');
    } finally {
      setBusyText('');
    }
  };

  const handleGenerateScriptPlan = async () => {
    if (!projectId || !scriptText.trim()) return;
    setBusyText('正在解析章节结构');
    setError(null);
    try {
      const result = await creationApi.generateScriptPlan(projectId, {
        scriptText,
        chaptersHint: 4,
        backgroundVideoId: currentVideo?.id,
      });
      await loadGraph(result.flowProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析剧本失败');
    } finally {
      setBusyText('');
    }
  };

  const handleCreateChapterNodes = async (chapterIndex: number) => {
    if (!graph?.project.id) return;
    setBusyText(`正在创建第 ${chapterIndex} 章节点`);
    setError(null);
    try {
      const result = await creationApi.createChapterNodes(graph.project.id, chapterIndex);
      setGraph(normalizeGraph(result));
      setSelectedNodeId((prev) => prev || result.nodes[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建章节节点失败');
    } finally {
      setBusyText('');
    }
  };

  const handleSaveNode = async () => {
    if (!selectedNode) return;
    setBusyText('正在保存节点');
    setError(null);
    try {
      const result = await creationApi.updateNode(selectedNode.id, {
        title: selectedNode.title,
        scriptSegment: selectedNode.scriptSegment,
        displayPromptCn: selectedNode.displayPromptCn,
        imagePromptCn: selectedNode.imagePromptCn,
        modelPrompt: selectedNode.imagePromptModel,
        videoPrompt: selectedNode.videoPrompt,
        characterIdentity: selectedNode.characterAnchor.identity,
        characterHair: selectedNode.characterAnchor.hair,
        characterOutfit: selectedNode.characterAnchor.outfit,
        characterFace: selectedNode.characterAnchor.face,
        characterProp: selectedNode.characterAnchor.prop,
        continuityLocked: selectedNode.continuityLocked,
      });
      setGraph(normalizeGraph(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存节点失败');
    } finally {
      setBusyText('');
    }
  };

  const handleReextractCharacterAnchor = async () => {
    if (!selectedNode) return;
    setBusyText('正在重新抽取人物锚点');
    setError(null);
    try {
      const result = await creationApi.reextractCharacterAnchor(selectedNode.id);
      setGraph(normalizeGraph(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新抽取人物锚点失败');
    } finally {
      setBusyText('');
    }
  };

  const handleGenerateImage = async () => {
    if (!selectedNode) return;
    setBusyText('正在生成节点图片');
    setError(null);
    setImageLoadingNodeId(selectedNode.id);
    try {
      await creationApi.generateNodeImage(selectedNode.id);
      if (graph?.project.id) await loadGraph(graph.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成节点图片失败');
    } finally {
      setImageLoadingNodeId((prev) => (prev === selectedNode.id ? null : prev));
      setBusyText('');
    }
  };

  const handleRenderVideo = async () => {
    if (!selectedNode) return;
    setBusyText('视频渲染任务已提交');
    setError(null);
    setVideoLoadingNodeId(selectedNode.id);
    try {
      await creationApi.renderNodeVideo(selectedNode.id);
      if (graph?.project.id) await loadGraph(graph.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交渲染失败');
      setVideoLoadingNodeId((prev) => (prev === selectedNode.id ? null : prev));
    } finally {
      setTimeout(() => setBusyText(''), 1200);
    }
  };

  const handleGenerateNextCandidates = async (targetNodeId?: string) => {
    const activeNode = targetNodeId
      ? graph?.nodes.find((node) => node.id === targetNodeId) || null
      : selectedNode;
    if (!activeNode) return;
    setBusyText('正在推演下一镜');
    setError(null);
    setNextLoadingNodeId(activeNode.id);
    try {
      const result = await creationApi.generateNextCandidates(activeNode.id, {
        intent: nextIntent,
        count: 3,
      });
      setNextCandidates(result.candidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : '推演失败');
    } finally {
      setNextLoadingNodeId((prev) => (prev === activeNode.id ? null : prev));
      setBusyText('');
    }
  };

  const handleSelectNextCandidate = async (candidateId: string) => {
    if (!selectedNode) return;
    setBusyText('正在创建下一节点');
    setError(null);
    try {
      const result = await creationApi.selectNextCandidate(selectedNode.id, candidateId);
      setGraph(normalizeGraph(result));
      setNextCandidates([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建下一节点失败');
    } finally {
      setBusyText('');
    }
  };

  const handleStitch = async () => {
    if (!graph?.project.id) return;
    setBusyText('成片串联任务已提交');
    setError(null);
    try {
      await creationApi.stitchProject(graph.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交串联失败');
    } finally {
      setTimeout(() => setBusyText(''), 1200);
    }
  };

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-secondary">
        当前工程缺少 projectId，无法初始化创作棱镜。
      </div>
    );
  }

  return (
    <div className="isolate flex h-full min-h-0 w-full overflow-hidden rounded-[16px] bg-bg-panel-secondary">
      <aside className="relative z-20 flex w-[430px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel pointer-events-auto" onPointerDownCapture={(e) => e.stopPropagation()} onMouseDownCapture={(e) => e.stopPropagation()}> 
        <div className="border-b border-border-subtle px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-text-tertiary">Creation Prism</div>
              <h2 className="mt-1 text-[22px] font-semibold text-text-primary">创作棱镜</h2>
            </div>
            <div className="inline-flex rounded-[14px] border border-border-subtle bg-bg-panel-secondary p-1">
              <button
                className={`rounded-xl px-4 py-2 text-sm ${mode === 'idea' ? 'bg-[#E91E8C] text-white' : 'text-text-secondary'}`}
                onClick={() => setMode('idea')}
              >
                idea 模式
              </button>
              <button
                className={`rounded-xl px-4 py-2 text-sm ${mode === 'script' ? 'bg-[#E91E8C] text-white' : 'text-text-secondary'}`}
                onClick={() => setMode('script')}
              >
                编剧模式
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs leading-6 text-text-tertiary">
            左侧负责输入、章节规划和节点导演台；右侧是无限可拖拽画布。创作棱镜可独立运行，当前选中视频只会作为可选背景素材参与生成，不再是前置条件。
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {mode === 'idea' ? (
            <div className="space-y-4">
              <SectionCard
                title="Idea 输入"
                description="输入一个核心想法，Agent 会生成多个故事走向与首节点预览，确认后直接落到画布。"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-[14px] border border-border-subtle bg-bg-panel-secondary px-3 py-2">
                    <div className="text-[11px] leading-5 text-text-tertiary">
                      如果要开始一个全新的故事，不需要手动刷新页面，直接重置当前创作工程。
                    </div>
                    <button
                      onClick={() => void handleResetIdeaStory()}
                      className="rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary"
                    >
                      新建故事
                    </button>
                  </div>
                  <textarea
                    value={ideaForm.idea}
                    onChange={(e) => setIdeaForm((prev) => ({ ...prev, idea: e.target.value }))}
                    rows={5}
                    className="input w-full resize-none"
                    placeholder="输入你的核心故事想法，例如：一个普通维修员被困在失控的自动化工厂，必须在整座工厂坍塌前重写主控系统。"
                  />
                  <input
                    value={ideaForm.conflict}
                    onChange={(e) => setIdeaForm((prev) => ({ ...prev, conflict: e.target.value }))}
                    className="input w-full"
                    placeholder="核心冲突"
                  />
                  <input
                    value={ideaForm.setting}
                    onChange={(e) => setIdeaForm((prev) => ({ ...prev, setting: e.target.value }))}
                    className="input w-full"
                    placeholder="故事空间 / 世界设定"
                  />
                  <input
                    value={ideaForm.visualGoal}
                    onChange={(e) => setIdeaForm((prev) => ({ ...prev, visualGoal: e.target.value }))}
                    className="input w-full"
                    placeholder="画面目标 / 影像要求"
                  />
                  <textarea
                    value={ideaForm.constraints}
                    onChange={(e) => setIdeaForm((prev) => ({ ...prev, constraints: e.target.value }))}
                    rows={3}
                    className="input w-full resize-none"
                    placeholder="约束条件，例如：避免玄幻、时长 90 秒内、人物数量控制在 2 人。"
                  />
                  <button
                    onClick={() => void handleGenerateIdeaPreviews()}
                    className="rounded-xl bg-[#E91E8C] px-4 py-2 text-sm font-medium text-white"
                  >
                    生成故事方向
                  </button>
                </div>
              </SectionCard>

              {graph?.project.meta.previews?.length ? (
                <SectionCard
                  title="首节点方向预览"
                  description="先选择故事方向，再进入第一镜。确认后会直接创建节点 1，并把后续推进放到右侧画布。"
                >
                  <div className="space-y-3">
                    {graph.project.meta.previews.map((preview: IdeaPreviewOption, index) => {
                      const isSelected = graph.project.meta.selectedPreviewId === preview.id;
                      return (
                        <div
                          key={preview.id}
                          className={`rounded-[18px] border p-4 transition ${
                            isSelected
                              ? 'border-[#E91E8C] bg-[rgba(233,30,140,0.08)]'
                              : 'border-border-subtle bg-bg-panel-secondary'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.22em] text-text-tertiary">
                                Take {index + 1}
                              </div>
                              <div className="mt-1 text-sm font-semibold text-text-primary">{preview.title}</div>
                            </div>
                            <button
                              onClick={() => void handleSelectPreview(preview.id)}
                              className="rounded-lg bg-[#E91E8C] px-3 py-1.5 text-xs text-white"
                            >
                              确认方向
                            </button>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-text-primary">{preview.openingScene}</p>
                          <p className="mt-3 text-xs leading-5 text-text-secondary">冲突：{preview.conflict}</p>
                          <p className="mt-1 text-xs leading-5 text-text-tertiary">推进：{preview.progression}</p>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <SectionCard
                title="编剧模式"
                description="导入剧本或小说文本后，Agent 会切章、总结每章任务，再把某一章拆成分镜节点。"
              >
                <div className="space-y-3">
                  <textarea
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    rows={14}
                    className="input w-full resize-none"
                    placeholder="粘贴完整剧本、小说节选或章节文本。系统会生成整体章节结构和推进关系。"
                  />
                  <button
                    onClick={() => void handleGenerateScriptPlan()}
                    className="rounded-xl bg-[#E91E8C] px-4 py-2 text-sm font-medium text-white"
                  >
                    解析章节结构
                  </button>
                </div>
              </SectionCard>

              {graph?.project.meta.scriptPlan?.chapters?.length ? (
                <SectionCard
                  title="章节结构"
                  description="先生成章节规划，再选择一章落成节点。每章会按照推荐分镜颗粒度拆分。"
                >
                  <div className="space-y-3">
                    {graph.project.meta.scriptPlan.chapters.map((chapter: ScriptPlanChapter) => (
                      <div key={chapter.index} className="rounded-[18px] border border-border-subtle bg-bg-panel-secondary p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-text-primary">{chapter.title}</div>
                            <div className="mt-1 text-[11px] text-text-tertiary">
                              建议分镜数：{chapter.storyboardCount}
                            </div>
                          </div>
                          <button
                            onClick={() => void handleCreateChapterNodes(chapter.index)}
                            className="rounded-lg bg-[#E91E8C] px-3 py-1.5 text-xs text-white"
                          >
                            创建本章节点
                          </button>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-text-secondary">{chapter.summary}</p>
                        <p className="mt-1 text-[11px] leading-5 text-text-tertiary">目标：{chapter.goal}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : null}
            </div>
          )}

          <SectionCard
            title="节点导演台"
            description="当前选中的节点会在这里做细化。你可以改文案、改中文分镜说明、改模型提示词，再出图或出视频。"
          >
            {selectedNode ? (
              <div className="space-y-3">
                <input
                  value={selectedNode.title}
                  onChange={(e) => patchSelectedNode({ title: e.target.value })}
                  className="input w-full"
                />
                <textarea
                  value={selectedNode.scriptSegment}
                  onChange={(e) => patchSelectedNode({ scriptSegment: e.target.value })}
                  rows={4}
                  className="input w-full resize-none"
                  placeholder="节点剧情"
                />
                <textarea
                  value={selectedNode.displayPromptCn}
                  onChange={(e) => patchSelectedNode({ displayPromptCn: e.target.value })}
                  rows={4}
                  className="input w-full resize-none"
                  placeholder="给用户看的中文分镜提示词"
                />
                <textarea
                  value={selectedNode.imagePromptModel}
                  onChange={(e) => patchSelectedNode({ imagePromptModel: e.target.value })}
                  rows={4}
                  className="input w-full resize-none"
                  placeholder="给图像模型的提示词"
                />
                <textarea
                  value={selectedNode.videoPrompt}
                  onChange={(e) => patchSelectedNode({ videoPrompt: e.target.value })}
                  rows={4}
                  className="input w-full resize-none"
                  placeholder="给视频模型的提示词"
                />
                <div className="rounded-[16px] border border-border-subtle bg-bg-panel-secondary p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-text-primary">人物锚点</div>
                      <div className="mt-1 text-[11px] leading-5 text-text-tertiary">
                        结构化锁定人物身份与外观，后续节点可强继承。
                      </div>
                    </div>
                    <button
                      onClick={() => void handleReextractCharacterAnchor()}
                      className="rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary"
                    >
                      重新抽取人物锚点
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <input
                      value={selectedNode.characterAnchor.identity}
                      onChange={(e) =>
                        patchSelectedNode({
                          characterAnchor: { ...selectedNode.characterAnchor, identity: e.target.value },
                        })
                      }
                      className="input w-full"
                      placeholder="identity / 角色身份"
                    />
                    <input
                      value={selectedNode.characterAnchor.hair}
                      onChange={(e) =>
                        patchSelectedNode({
                          characterAnchor: { ...selectedNode.characterAnchor, hair: e.target.value },
                        })
                      }
                      className="input w-full"
                      placeholder="hair / 发型"
                    />
                    <input
                      value={selectedNode.characterAnchor.outfit}
                      onChange={(e) =>
                        patchSelectedNode({
                          characterAnchor: { ...selectedNode.characterAnchor, outfit: e.target.value },
                        })
                      }
                      className="input w-full"
                      placeholder="outfit / 服装"
                    />
                    <input
                      value={selectedNode.characterAnchor.face}
                      onChange={(e) =>
                        patchSelectedNode({
                          characterAnchor: { ...selectedNode.characterAnchor, face: e.target.value },
                        })
                      }
                      className="input w-full"
                      placeholder="face / 面部气质"
                    />
                    <input
                      value={selectedNode.characterAnchor.prop}
                      onChange={(e) =>
                        patchSelectedNode({
                          characterAnchor: { ...selectedNode.characterAnchor, prop: e.target.value },
                        })
                      }
                      className="input col-span-2 w-full"
                      placeholder="prop / 关键道具"
                    />
                  </div>

                  <label className="mt-3 flex items-center justify-between gap-3 rounded-[12px] border border-border-subtle px-3 py-2">
                    <div>
                      <div className="text-xs font-medium text-text-primary">连续性锁定</div>
                      <div className="mt-1 text-[11px] leading-5 text-text-tertiary">
                        锁定后，后续节点默认强继承当前人物锚点。
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => patchSelectedNode({ continuityLocked: !selectedNode.continuityLocked })}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        selectedNode.continuityLocked ? 'bg-[#E91E8C]' : 'bg-bg-panel'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                          selectedNode.continuityLocked ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void handleGenerateImage()}
                    disabled={imageLoadingNodeId === selectedNode.id}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-bg-panel-secondary px-3 py-2 text-xs text-text-primary disabled:opacity-60"
                  >
                    {imageLoadingNodeId === selectedNode.id ? (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : null}
                    {imageLoadingNodeId === selectedNode.id ? '生成中' : '生成图片'}
                  </button>
                  <button
                    onClick={() => void handleRenderVideo()}
                    disabled={videoLoadingNodeId === selectedNode.id}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E91E8C] px-3 py-2 text-xs text-white disabled:opacity-60"
                  >
                    {videoLoadingNodeId === selectedNode.id ? (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : null}
                    {videoLoadingNodeId === selectedNode.id ? '渲染中' : '生成视频'}
                  </button>
                </div>

                <button
                  onClick={() => void handleSaveNode()}
                  className="rounded-xl border border-border-subtle px-3 py-2 text-xs text-text-secondary"
                >
                  保存当前节点
                </button>
                <button
                  onClick={() => void handleDeleteNode(selectedNode.id)}
                  className="rounded-xl border border-[#EF4444]/30 bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs text-[#EF4444]"
                >
                  删除当前节点
                </button>

                <textarea
                  value={nextIntent}
                  onChange={(e) => setNextIntent(e.target.value)}
                  rows={3}
                  className="input w-full resize-none"
                  placeholder="描述下一镜如何推进，例如：主角被迫进入核心控制区，冲突升级，光线突然切到红色警报。"
                />
                <button
                  onClick={() => void handleGenerateNextCandidates()}
                  disabled={nextLoadingNodeId === selectedNode.id}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle px-3 py-2 text-xs text-text-secondary disabled:opacity-60"
                >
                  {nextLoadingNodeId === selectedNode.id ? (
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : null}
                  {nextLoadingNodeId === selectedNode.id ? '推演中' : '生成下一节点'}
                </button>

                {nextCandidates.length ? (
                  <div className="space-y-2">
                    {nextCandidates.map((candidate) => (
                      <div key={candidate.id} className="rounded-[16px] border border-border-subtle bg-bg-panel-secondary p-3">
                        <div className="text-sm font-medium text-text-primary">{candidate.title}</div>
                        <p className="mt-1 text-xs leading-5 text-text-secondary">{candidate.scriptSegment}</p>
                        <p className="mt-1 text-[11px] leading-5 text-text-tertiary">{candidate.visualDescription}</p>
                        <button
                          onClick={() => void handleSelectNextCandidate(candidate.id)}
                          className="mt-2 rounded-lg bg-[#E91E8C] px-3 py-1.5 text-xs text-white"
                        >
                          创建这个节点
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-border-subtle px-4 py-6 text-center text-sm text-text-tertiary">
                先在右侧画布中选中一个节点，导演台才会展开。
              </div>
            )}
          </SectionCard>
        </div>
      </aside>

      <main className="relative z-0 flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-text-tertiary">Infinite Canvas</div>
            <h2 className="mt-1 text-[20px] font-semibold text-text-primary">无限可拖拽画布</h2>
            <p className="mt-1 text-xs leading-5 text-text-tertiary">
              每个节点都对应一个分镜单元。后续节点会承接前一个节点的状态，最终可串联导出。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void bootstrap()}
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-secondary"
            >
              刷新
            </button>
            <button
              onClick={() => void handleStitch()}
              disabled={!graph?.nodes.some((node) => node.renderedVideoUrl)}
              className="rounded-lg bg-[#E91E8C] px-4 py-1.5 text-xs text-white disabled:opacity-40"
            >
              导出按钮
            </button>
          </div>
        </div>

        {busyText || error ? (
          <div className="border-b border-border-subtle px-5 py-2 text-xs">
            {busyText ? <span className="text-text-secondary">{busyText}</span> : null}
            {error ? <span className="text-[#EF4444]">{error}</span> : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-text-secondary">
              加载创作画布中...
            </div>
          ) : (
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              fitView
              defaultViewport={{ x: 0, y: 0, zoom: 0.78 }}
              onNodeDragStop={handleNodeDragStop}
            >
              <MiniMap pannable zoomable nodeColor="#E91E8C" />
              <Controls />
              <Background gap={22} color="rgba(148, 163, 184, 0.14)" />
            </ReactFlow>
          )}
        </div>

        <div className="border-t border-border-subtle px-5 py-3">
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-text-tertiary">
            <span>节点 1 可直接出图与出视频</span>
            <span>后续节点会承接前序镜头状态</span>
            <span>点击节点后在左侧导演台调整文案与提示词</span>
          </div>
        </div>
      </main>
    </div>
  );
}

