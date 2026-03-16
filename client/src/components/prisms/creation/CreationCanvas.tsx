'use client';

import '@xyflow/react/dist/style.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Background, Controls, Edge, MiniMap, Node, ReactFlow } from '@xyflow/react';
import { useWorkbenchStore } from '@/stores/workbench.store';
import { useWebSocket } from '@/hooks/use-websocket';
import {
  CharacterAnchor,
  CreationConversationMessage,
  CreationGraphNode,
  CreationGraphResponse,
  CreationNextCandidate,
  CreationSessionSummary,
  creationApi,
} from '@/services/creation.api';
import { FlowNodeCard, FlowNodeData } from './FlowNodeCard';
import { CreationChatPanel } from './CreationChatPanel';

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
      isMerged: node.isMerged,
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
  collapsible = false,
  collapsed = false,
  onToggle,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <section className="rounded-[20px] border border-border-subtle bg-bg-panel px-4 py-4">
      <div className={collapsed ? 'mb-0' : 'mb-3'}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            {description ? <p className="mt-1 text-xs leading-5 text-text-tertiary">{description}</p> : null}
          </div>
          {collapsible ? (
            <button
              type="button"
              onClick={onToggle}
              className="rounded-lg border border-border-subtle px-2 py-1 text-[11px] text-text-secondary"
            >
              {collapsed ? '展开' : '收起'}
            </button>
          ) : null}
        </div>
      </div>
      {collapsed ? null : children}
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
  const [conversationInput, setConversationInput] = useState('');
  const [editorMode, setEditorMode] = useState<'director' | 'advanced'>('director');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [mergeTitle, setMergeTitle] = useState('');
  const [mergeInstructions, setMergeInstructions] = useState('');
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(430);
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [sessions, setSessions] = useState<CreationSessionSummary[]>([]);
  const [currentFlowProjectId, setCurrentFlowProjectId] = useState<string | null>(null);
  const [sessionActionLoading, setSessionActionLoading] = useState<'creating' | string | null>(null);
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({
    sessions: false,
    advanced: false,
    nodeDirector: false,
    stage: false,
    tasks: false,
  });

  const togglePanel = useCallback((key: string) => {
    setCollapsedPanels((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const loadGraph = useCallback(
    async (flowProjectId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await creationApi.getGraph(flowProjectId);
        setGraph(normalizeGraph(result));
        setCurrentFlowProjectId(result.project.id);
        setMode(result.project.mode || 'idea');
        setSelectedNodeId(result.nodes[0]?.id || null);
        setSelectedNodeIds(result.nodes[0]?.id ? [result.nodes[0].id] : []);
        setNextCandidates([]);
        setNextIntent('');
        setConversationInput('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载创作工程失败');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const refreshSessions = useCallback(async () => {
    if (!projectId) return [];
    const result = await creationApi.listSessions(projectId);
    setSessions(result);
    return result;
  }, [projectId]);

  const createNewSession = useCallback(async () => {
    if (!projectId) return null;
    const result = await creationApi.createSession(projectId, {
      backgroundVideoId: currentVideo?.id,
    });
    const normalized = normalizeGraph(result);
    setGraph(normalized);
    setCurrentFlowProjectId(result.project.id);
    setMode(result.project.mode || 'idea');
    setSelectedNodeId(result.nodes[0]?.id || null);
    setSelectedNodeIds(result.nodes[0]?.id ? [result.nodes[0].id] : []);
    setNextCandidates([]);
    setNextIntent('');
    setConversationInput('');
    setScriptText('');
    setIdeaForm({
      idea: '',
      conflict: '',
      setting: '',
      visualGoal: '',
      constraints: '',
    });
    const listed = await refreshSessions();
    return listed.find((item) => item.id === result.project.id) || null;
  }, [currentVideo?.id, projectId, refreshSessions]);

  const bootstrap = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const listed = await creationApi.listSessions(projectId);
      setSessions(listed);
      if (listed.length > 0) {
        const latest = listed[0];
        const result = await creationApi.bootstrap(projectId, currentVideo?.id, latest.id);
        const normalized = normalizeGraph(result);
        setGraph(normalized);
        setCurrentFlowProjectId(result.project.id);
        setMode(result.project.mode || 'idea');
        setSelectedNodeId(result.nodes[0]?.id || null);
        setSelectedNodeIds(result.nodes[0]?.id ? [result.nodes[0].id] : []);
      } else {
        await createNewSession();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化创作工程失败');
    } finally {
      setLoading(false);
    }
  }, [createNewSession, currentVideo?.id, projectId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!isResizingPanels) return;

    const handleMove = (event: MouseEvent) => {
      const next = Math.min(720, Math.max(360, event.clientX - 20));
      setLeftPanelWidth(next);
    };

    const handleUp = () => setIsResizingPanels(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizingPanels]);

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
  const selectedNodes = useMemo(
    () => (graph?.nodes || []).filter((node) => selectedNodeIds.includes(node.id)),
    [graph?.nodes, selectedNodeIds],
  );
  const failedTasks = useMemo(
    () => (graph?.project.meta.renderTasks || []).filter((task) => task.status === 'FAILED'),
    [graph?.project.meta.renderTasks],
  );

  const flowNodes = useMemo(
    () =>
      toFlowNodes(graph?.nodes || [], {
        imageLoadingNodeId,
        videoLoadingNodeId,
        nextLoadingNodeId,
      }, {
        onSelect: (nodeId) => {
          setSelectedNodeId(nodeId);
          setSelectedNodeIds([nodeId]);
        },
        onGenerateImage: (nodeId) => {
          setSelectedNodeId(nodeId);
          setSelectedNodeIds([nodeId]);
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
          setSelectedNodeIds([nodeId]);
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
          setSelectedNodeIds([nodeId]);
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
  const conversationState = graph?.project.meta.conversationState;
  const hasProductionNodes = Boolean(graph?.nodes.length);
  const conversationSummary = useMemo(() => {
    const combined = (conversationState?.messages || [])
      .map((message) => message.content.trim())
      .filter(Boolean)
      .join('\n');

    return {
      storyIntent:
        conversationState?.summary.storyIntent ||
        ideaForm.idea ||
        combined ||
        '等待用户描述故事核心、角色关系和戏剧冲突。',
      visualStyle:
        conversationState?.summary.visualStyle ||
        ideaForm.visualGoal ||
        '如果对话里没有明确提到风格，默认按“电影化、可连续分镜、适合视频生成”理解。',
      splitPreference:
        conversationState?.summary.splitPreference ||
        scriptText ||
        ideaForm.constraints ||
        '等待用户说明章节数量、镜头颗粒度、单章时长、文戏/武戏比例等拆分偏好。',
    };
  }, [conversationState, ideaForm.idea, ideaForm.visualGoal, ideaForm.constraints, scriptText]);

  const patchSelectedNode = (patch: Partial<CreationGraphNode>) => {
    setGraph((prev) => {
      if (!prev || !selectedNodeId) return prev;
      return {
        ...prev,
        nodes: prev.nodes.map((node) => (node.id === selectedNodeId ? { ...node, ...patch } : node)),
      };
    });
  };

  useEffect(() => {
    if (!selectedNodeId) return;
    setSelectedNodeIds((prev) => (prev.length <= 1 ? [selectedNodeId] : prev));
  }, [selectedNodeId]);

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

  const handleSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    const ids = nodes.map((item) => item.id);
    setSelectedNodeIds((prev) => {
      // 只有当选中的节点 ID 列表真的变化时才更新
      if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) {
        return prev;
      }
      return ids;
    });
    if (ids.length === 1) {
      setSelectedNodeId(ids[0]);
    }
  }, []);

  const handleGenerateIdeaPreviews = async () => {
    if (!projectId || !ideaForm.idea.trim()) return;
    setBusyText('正在生成故事方向');
    setError(null);
    try {
      const result = await creationApi.generateIdeaPreviews(projectId, {
        flowProjectId: currentFlowProjectId || undefined,
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
    const confirmed = window.confirm('确认清空当前创作会话吗？这不会删除历史会话，只会清空当前会话中的节点、预览和章节规划。');
    if (!confirmed) return;

    setBusyText('正在清空当前创作会话');
    setError(null);
    try {
      const result = await creationApi.resetProject(graph.project.id);
      const normalized = normalizeGraph(result);
      setGraph(normalized);
      setCurrentFlowProjectId(result.project.id);
      setMode('idea');
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
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
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置创作工程失败');
    } finally {
      setBusyText('');
    }
  };

  const handleCreateSession = async () => {
    setSessionActionLoading('creating');
    setBusyText('正在创建新的创作工程');
    setError(null);
    try {
      await createNewSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建创作工程失败');
    } finally {
      setSessionActionLoading(null);
      setBusyText('');
    }
  };

  const handleSwitchSession = async (flowProjectId: string) => {
    if (flowProjectId === currentFlowProjectId) return;
    setSessionActionLoading(flowProjectId);
    setBusyText('正在切换创作工程');
    setError(null);
    try {
      await loadGraph(flowProjectId);
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换创作工程失败');
    } finally {
      setSessionActionLoading(null);
      setBusyText('');
    }
  };

  const handleRenameSession = async (session: CreationSessionSummary) => {
    const nextName = window.prompt('请输入新的创作工程名称', session.name);
    if (!nextName || nextName.trim() === session.name) return;
    setSessionActionLoading(session.id);
    setBusyText('正在重命名创作工程');
    setError(null);
    try {
      const result = await creationApi.renameSession(session.id, { name: nextName.trim() });
      setGraph((prev) => (prev?.project.id === result.project.id ? normalizeGraph(result) : prev));
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名创作工程失败');
    } finally {
      setSessionActionLoading(null);
      setBusyText('');
    }
  };

  const handleDeleteSession = async (session: CreationSessionSummary) => {
    const confirmed = window.confirm(`确认删除“${session.name}”吗？该会话下的节点和渲染记录会一起移除。`);
    if (!confirmed) return;
    setSessionActionLoading(session.id);
    setBusyText('正在删除创作工程');
    setError(null);
    try {
      const result = await creationApi.deleteSession(session.id);
      setSessions(result.sessions);
      if (currentFlowProjectId === session.id) {
        if (result.sessions[0]) {
          await loadGraph(result.sessions[0].id);
        } else {
          await createNewSession();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除创作工程失败');
    } finally {
      setSessionActionLoading(null);
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
        flowProjectId: currentFlowProjectId || undefined,
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

  const handleUpdateChapter = async (
    chapterIndex: number,
    payload: Partial<{
      title: string;
      summary: string;
      goal: string;
      storyboardCount: number;
    }>,
  ) => {
    if (!graph?.project.id) return;
    setBusyText(`正在保存第 ${chapterIndex} 章`);
    setError(null);
    try {
      const result = await creationApi.updateScriptPlanChapter(graph.project.id, chapterIndex, payload);
      setGraph(normalizeGraph(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存章节失败');
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

  const handleRetryTask = async (taskId: string) => {
    if (!graph?.project.id) return;
    setRetryingTaskId(taskId);
    setBusyText('正在重试失败任务');
    setError(null);
    try {
      await creationApi.retryTask(taskId);
      await loadGraph(graph.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重试任务失败');
    } finally {
      setRetryingTaskId(null);
      setBusyText('');
    }
  };

  const handleMergeNodes = async () => {
    if (!graph?.project.id || selectedNodeIds.length < 2) return;
    setBusyText('正在合并多个节点');
    setError(null);
    try {
      const result = await creationApi.mergeNodes(graph.project.id, {
        sourceNodeIds: selectedNodeIds,
        title: mergeTitle.trim() || undefined,
        instructions: mergeInstructions.trim() || undefined,
      });
      const normalized = normalizeGraph(result);
      setGraph(normalized);
      const mergedNode = normalized.nodes[normalized.nodes.length - 1];
      setSelectedNodeId(mergedNode?.id || null);
      setSelectedNodeIds(mergedNode?.id ? [mergedNode.id] : []);
      setMergeTitle('');
      setMergeInstructions('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '合并节点失败');
    } finally {
      setBusyText('');
    }
  };

  const handleSendConversation = () => {
    const trimmed = conversationInput.trim();
    if (!trimmed) return;
    setBusyText('正在归纳导演对话');
    setError(null);
    void creationApi
      .appendConversationMessage(projectId!, {
        content: trimmed,
        backgroundVideoId: currentVideo?.id,
        flowProjectId: currentFlowProjectId || undefined,
      })
      .then((result) => {
        setGraph(normalizeGraph(result));
        setConversationInput('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '归纳对话失败');
      })
      .finally(() => {
        setBusyText('');
      });
  };

  const handleGenerateFromConversation = async () => {
    const combined = (conversationState?.messages || [])
      .filter((message) => message.role === 'user')
      .map((message) => message.content.trim())
      .filter(Boolean)
      .join('\n');
    const storyIntent = conversationState?.summary.storyIntent || combined;
    const visualStyle = conversationState?.summary.visualStyle || ideaForm.visualGoal || combined;
    const splitPreference =
      conversationState?.summary.splitPreference ||
      ideaForm.constraints ||
      '按对话内容自动归纳章节、风格和分镜颗粒度。';

    if (!projectId || !storyIntent) return;

    setIdeaForm((prev) => ({
      ...prev,
      idea: storyIntent,
      visualGoal: visualStyle,
      constraints: splitPreference,
    }));

    setBusyText('正在根据对话生成故事方向');
    setError(null);
    try {
      const result = await creationApi.generateIdeaPreviews(projectId, {
        flowProjectId: currentFlowProjectId || undefined,
        ...ideaForm,
        idea: storyIntent,
        visualGoal: visualStyle,
        constraints: splitPreference,
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

  const handleGenerateScriptFromConversation = async () => {
    const combined =
      conversationState?.scriptDraft ||
      (conversationState?.messages || [])
        .filter((message) => message.role === 'user')
        .map((message) => message.content.trim())
        .filter(Boolean)
        .join('\n\n');

    if (!projectId || !combined) return;

    setScriptText(combined);
    setIdeaForm((prev) => ({
      ...prev,
      constraints: prev.constraints || '按对话内容生成分章节剧本与对应分镜任务。',
    }));

    setBusyText('正在归纳对话为章节结构');
    setError(null);
    try {
      const result = await creationApi.generateScriptPlan(projectId, {
        flowProjectId: currentFlowProjectId || undefined,
        scriptText: combined,
        chaptersHint: conversationState?.chaptersHint || 4,
        backgroundVideoId: currentVideo?.id,
      });
      await loadGraph(result.flowProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析对话章节失败');
    } finally {
      setBusyText('');
    }
  };

  const handleGenerateProductionPackage = async () => {
    if (!graph?.project.id) return null;
    setBusyText('正在生成场景、角色、分镜与音色生产包');
    setError(null);
    try {
      const result = await creationApi.generateProductionPackage(graph.project.id, {
        artStyle: conversationState?.summary.visualStyle || ideaForm.visualGoal || undefined,
      });
      const normalized = normalizeGraph(result);
      setGraph(normalized);
      return normalized;
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成生产包失败');
    } finally {
      setBusyText('');
    }
    return null;
  };

  const handleConfirmWorkflow = async () => {
    if (!graph?.project.id) return;
    setBusyText('正在按导演对话生成故事方向、章节与九宫格预览');
    setError(null);
    try {
      const result = await creationApi.confirmConversationWorkflow(graph.project.id, {
        previewImageCount: 9,
      });
      setGraph(normalizeGraph(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : '确认工作流失败');
    } finally {
      setBusyText('');
    }
  };

  const handleEnterProduction = async () => {
    const latestGraph =
      !graph?.project.meta.storyboardSegments?.length && graph?.project.meta.scriptPlan?.chapters?.length
        ? await handleGenerateProductionPackage()
        : graph;
    const firstChapter = latestGraph?.project.meta.scriptPlan?.chapters?.[0];
    if (!firstChapter) return;
    await handleCreateChapterNodes(firstChapter.index);
  };

  const handleConfirmSegmentPreview = async (segmentId: string) => {
    if (!graph?.project.id) return;
    setBusyText('正在生成下一片段并接入短剧链路');
    setError(null);
    try {
      const result = await creationApi.confirmSegmentPreview(graph.project.id, segmentId);
      setGraph(normalizeGraph(result.graph));
      if (result.nodeId) {
        setSelectedNodeId(result.nodeId);
        setSelectedNodeIds([result.nodeId]);
        setVideoLoadingNodeId(result.nodeId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成下一片段失败');
    } finally {
      setTimeout(() => setBusyText(''), 1200);
    }
  };

  const handleAdjustDraft = async (payload: {
    targetType: 'preview' | 'chapter';
    targetId: string;
    instruction: string;
  }) => {
    if (!graph?.project.id) return;
    setBusyText('导演正在调整方案');
    setError(null);
    try {
      const result = await creationApi.adjustDraft(graph.project.id, payload);
      setGraph(normalizeGraph(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 调整失败');
    } finally {
      setBusyText('');
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
      <aside
        style={{ width: leftPanelWidth }}
        className="relative z-20 flex shrink-0 flex-col border-r border-border-subtle bg-bg-panel pointer-events-auto"
        onPointerDownCapture={(e) => e.stopPropagation()}
        onMouseDownCapture={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-subtle px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-text-tertiary">Creation Prism</div>
              <h2 className="mt-1 text-[22px] font-semibold text-text-primary">创作棱镜</h2>
            </div>
            <button
              onClick={() => setEditorMode((prev) => (prev === 'director' ? 'advanced' : 'director'))}
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary"
            >
              {editorMode === 'advanced' ? '退出高级编辑' : '进入高级编辑'}
            </button>
          </div>
          <p className="mt-3 text-xs leading-6 text-text-tertiary">
            左侧现在支持多个创作会话。你可以保留历史短剧工程，再新建一个全新的会话继续创作新的视频。
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <SectionCard
            title="创作工程"
            description="同一项目下可保留多次创作记录。新建后会进入一个全新的导演对话与节点画布。"
            collapsible
            collapsed={collapsedPanels.sessions}
            onToggle={() => togglePanel('sessions')}
          >
            <div className="space-y-3">
              <button
                onClick={() => void handleCreateSession()}
                disabled={sessionActionLoading === 'creating'}
                className="flex w-full items-center justify-center rounded-[14px] bg-[#E91E8C] px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sessionActionLoading === 'creating' ? '正在创建...' : '新建创作工程'}
              </button>
              <div className="space-y-2">
                {sessions.length ? (
                  sessions.map((session) => {
                    const active = session.id === currentFlowProjectId;
                    const loadingThis = sessionActionLoading === session.id;
                    return (
                      <div
                        key={session.id}
                        className={`rounded-[16px] border px-3 py-3 transition ${
                          active
                            ? 'border-[#E91E8C]/60 bg-[#E91E8C]/8'
                            : 'border-border-subtle bg-bg-panel-secondary'
                        }`}
                      >
                        <button
                          onClick={() => void handleSwitchSession(session.id)}
                          disabled={loadingThis}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-text-primary">{session.name}</div>
                              <div className="mt-1 text-[11px] text-text-tertiary">
                                {session.hasNodes ? '已有节点' : '空白会话'} · {new Date(session.updatedAt).toLocaleString('zh-CN')}
                              </div>
                              {session.lastSummary ? (
                                <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary">{session.lastSummary}</p>
                              ) : null}
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-1 text-[10px] ${
                                active ? 'bg-[#E91E8C] text-white' : 'bg-bg-panel text-text-tertiary'
                              }`}
                            >
                              {active ? '当前' : '切换'}
                            </span>
                          </div>
                        </button>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => void handleRenameSession(session)}
                            disabled={loadingThis}
                            className="rounded-lg border border-border-subtle px-2.5 py-1 text-[11px] text-text-secondary disabled:opacity-60"
                          >
                            重命名
                          </button>
                          <button
                            onClick={() => void handleDeleteSession(session)}
                            disabled={loadingThis}
                            className="rounded-lg border border-border-subtle px-2.5 py-1 text-[11px] text-[#ff8ca8] disabled:opacity-60"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[14px] border border-dashed border-border-subtle px-3 py-4 text-xs leading-6 text-text-tertiary">
                    当前还没有创作会话，首次进入会自动创建一条新的创作工程。
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <div className="h-4" />

          <CreationChatPanel
            messages={conversationState?.messages || []}
            input={conversationInput}
            summary={conversationSummary}
            scriptDraft={conversationState?.scriptDraft || graph?.project.scriptText || ''}
            previews={graph?.project.meta.previews || []}
            selectedPreviewId={graph?.project.meta.selectedPreviewId}
            chapters={graph?.project.meta.scriptPlan?.chapters || []}
            scenes={graph?.project.meta.scenePlan?.scenes || []}
            characterAssets={graph?.project.meta.characterAssets || []}
            sceneAssets={graph?.project.meta.sceneAssets || []}
            storyboardSegments={graph?.project.meta.storyboardSegments || []}
            voiceCasting={graph?.project.meta.voiceCasting || []}
            confirmedSegmentIds={(graph?.nodes || []).map((node) => node.sourceSegmentId).filter(Boolean) as string[]}
            busyText={busyText}
            onInputChange={setConversationInput}
            onSend={handleSendConversation}
            onReset={() => void handleResetIdeaStory()}
            onConfirmWorkflow={() => void handleConfirmWorkflow()}
            onConfirmSegmentPreview={(segmentId) => void handleConfirmSegmentPreview(segmentId)}
            onAdjustDraft={handleAdjustDraft}
          />

          {editorMode === 'advanced' ? (
            <SectionCard
              title="高级编辑模式"
              description="支持任务重试、合并节点、局部重生和直接拖拽编辑。框选两个以上节点后，可以创建一个新的合并节点。"
              collapsible
              collapsed={collapsedPanels.advanced}
              onToggle={() => togglePanel('advanced')}
            >
              <div className="space-y-3">
                <div className="rounded-[16px] border border-border-subtle bg-bg-panel-secondary p-3 text-xs leading-6 text-text-secondary">
                  当前已选中 {selectedNodeIds.length} 个节点
                  {selectedNodes.length
                    ? `：${selectedNodes.map((node) => node.title || `节点${node.orderIndex + 1}`).join(' / ')}`
                    : '。'}
                </div>
                <input
                  value={mergeTitle}
                  onChange={(e) => setMergeTitle(e.target.value)}
                  className="input w-full"
                  placeholder="合并后节点标题，可留空自动生成"
                />
                <textarea
                  value={mergeInstructions}
                  onChange={(e) => setMergeInstructions(e.target.value)}
                  rows={3}
                  className="input w-full resize-none"
                  placeholder="描述如何合并这些镜头，例如：把两个支线在警报灯闪烁中收束到主角重新汇合。"
                />
                <button
                  onClick={() => void handleMergeNodes()}
                  disabled={selectedNodeIds.length < 2}
                  className="rounded-xl border border-border-subtle px-3 py-2 text-xs text-text-secondary disabled:opacity-40"
                >
                  将选中节点合并成新节点
                </button>
              </div>
            </SectionCard>
          ) : null}

          {hasProductionNodes || editorMode === 'advanced' ? (
            <SectionCard
              title="节点导演台"
              description="进入镜头生产后，这里才会展开节点级编辑。你可以改文案、改中文分镜说明、改模型提示词，再出图或出视频。"
              collapsible
              collapsed={collapsedPanels.nodeDirector}
              onToggle={() => togglePanel('nodeDirector')}
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
          ) : (
            <SectionCard
              title="当前阶段"
              description="你现在还在导演对话阶段。先通过聊天归纳故事和章节，再进入镜头级编辑。"
              collapsible
              collapsed={collapsedPanels.stage}
              onToggle={() => togglePanel('stage')}
            >
              <div className="rounded-[16px] border border-dashed border-border-subtle px-4 py-6 text-sm leading-6 text-text-tertiary">
                当前左侧主入口已经切到对话式创作。右侧节点导演台会在你生成章节节点或进入高级编辑后再显示。
              </div>
            </SectionCard>
          )}

          {editorMode === 'advanced' ? (
            <SectionCard
              title="任务与导出"
              description="这里会显示当前工程的渲染任务和成片状态。失败任务可以直接重试。"
              collapsible
              collapsed={collapsedPanels.tasks}
              onToggle={() => togglePanel('tasks')}
            >
              <div className="space-y-3">
                {graph?.project.meta.finalVideo ? (
                  <div className="rounded-[16px] border border-border-subtle bg-bg-panel-secondary p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-text-primary">最终成片</div>
                        <div className="mt-1 text-[11px] text-text-tertiary">
                          状态：{graph.project.meta.finalVideo.status}
                        </div>
                      </div>
                      {graph.project.meta.finalVideo.downloadUrl ? (
                        <a
                          href={graph.project.meta.finalVideo.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-[#111827] px-3 py-1.5 text-[11px] text-white"
                        >
                          打开成片
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {(graph?.project.meta.renderTasks || []).length ? (
                  <div className="space-y-2">
                    {(graph?.project.meta.renderTasks || []).slice(0, 8).map((task) => (
                      <div key={task.taskId} className="rounded-[16px] border border-border-subtle bg-bg-panel-secondary p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-text-primary">
                              {task.type === 'project_stitch' ? '成片导出任务' : `节点渲染任务 ${task.nodeId ? `#${task.nodeId.slice(-6)}` : ''}`}
                            </div>
                            <div className="mt-1 text-[11px] text-text-tertiary">
                              {task.status} · {new Date(task.createdAt).toLocaleString()}
                            </div>
                            {task.error ? (
                              <div className="mt-1 text-[11px] leading-5 text-[#EF4444]">{task.error}</div>
                            ) : null}
                          </div>
                          {task.status === 'FAILED' ? (
                            <button
                              onClick={() => void handleRetryTask(task.taskId)}
                              disabled={retryingTaskId === task.taskId}
                              className="rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary disabled:opacity-40"
                            >
                              {retryingTaskId === task.taskId ? '重试中' : '重试'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[16px] border border-dashed border-border-subtle px-4 py-5 text-center text-xs text-text-tertiary">
                    当前还没有渲染任务记录。
                  </div>
                )}

                {failedTasks.length ? (
                  <div className="rounded-[16px] border border-[#EF4444]/20 bg-[rgba(239,68,68,0.06)] px-3 py-3 text-[11px] leading-5 text-[#EF4444]">
                    当前有 {failedTasks.length} 个失败任务，已经支持在这里直接重试。
                  </div>
                ) : null}
              </div>
            </SectionCard>
          ) : null}
        </div>
      </aside>

      <div
        onMouseDown={() => setIsResizingPanels(true)}
        className={`relative z-20 w-2 shrink-0 cursor-col-resize bg-transparent transition hover:bg-[#E91E8C]/20 ${
          isResizingPanels ? 'bg-[#E91E8C]/30' : ''
        }`}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-subtle" />
      </div>

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
              onSelectionChange={handleSelectionChange}
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
