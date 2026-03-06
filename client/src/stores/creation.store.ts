'use client';

import { create } from 'zustand';
import { Node, Edge } from '@xyflow/react';
import {
  creationApi,
  BranchCompareResult,
  CreateFlowNodePayload,
  NodePrecheckLevel,
  NodePrecheckResult,
  StitchFlowPayload,
  ExportProjectPayload,
  GenerateNextNodePayload,
} from '@/services/creation.api';

export type RenderStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// 导出任务类型
export interface ExportTask {
  taskId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  downloadUrl?: string;
  format?: string;
  error?: string;
}

export interface FlowNodeData extends Record<string, unknown> {
  orderIndex: number;
  videoPrompt?: string;
  prompt?: string;
  scriptSegment?: string;
  parentNodeId?: string | null;
  branchName?: string | null;
  isMerged?: boolean;
  childBranchCount?: number;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  renderedVideoUrl?: string;
  renderStatus: RenderStatus;
  firstFrameLocked?: boolean;
  lastFrameLocked?: boolean;
  narrationUrl?: string;
  bgmUrl?: string;
  // Loading states
  isGeneratingFrame?: boolean;
  isRendering?: boolean;
  // Rendering progress
  renderProgress?: number;
  activeRenderTaskId?: string | null;
  latestRenderTaskStatus?: string | null;
  latestRenderTaskVideoUrl?: string | null;
  isFirstScene?: boolean;
  // Frame prompt editing (frontend runtime state)
  firstFramePrompt?: string;
  lastFramePrompt?: string;
  sceneFramePrompt?: string;
  precheckLevel?: NodePrecheckLevel;
  precheckIssues?: Array<{
    code: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    suggestion: string;
  }>;
  qualityScore?: number;
  qualityBreakdown?: {
    promptCompleteness: number;
    continuity: number;
    renderStability: number;
    subjectConsistency: number;
    overall: number;
  };
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

export interface PromptBundleCandidate {
  index?: number;
  scriptSegment: string;
  videoPrompt: string;
  sceneFramePrompt: string;
  firstFramePrompt: string;
  lastFramePrompt: string;
}

function extractNodeList(response: any): any[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  return [];
}

function extractSingleNode(response: any): any | null {
  if (!response) return null;
  if (response.node) return response.node;
  if (response.id) return response;
  return null;
}

function buildFirstFramePrompt(basePrompt?: string, scriptSegment?: string) {
  const source = (basePrompt || scriptSegment || '视频场景').trim();
  return `${source}，开场镜头，画面干净，主体明确，电影感构图，16:9`;
}

function buildLastFramePrompt(basePrompt?: string, scriptSegment?: string) {
  const source = (basePrompt || scriptSegment || '视频场景').trim();
  return `${source}，收尾镜头，结尾定格，氛围完整，电影感构图，16:9`;
}

function buildSceneFramePrompt(basePrompt?: string, scriptSegment?: string) {
  const source = (basePrompt || scriptSegment || '视频场景').trim();
  return `${source}，关键画面帧，信息清晰，细节完整，电影感构图，16:9`;
}

function resolvePromptBundle(node: any, fallbackPrompt?: string, fallbackSegment?: string) {
  const videoPrompt = String(
    node?.videoPrompt || node?.prompt || fallbackPrompt || fallbackSegment || '',
  ).trim();
  const scriptSegment = String(node?.scriptSegment || fallbackSegment || '').trim();
  return {
    videoPrompt,
    sceneFramePrompt: String(
      node?.sceneFramePrompt || buildSceneFramePrompt(videoPrompt, scriptSegment),
    ).trim(),
    firstFramePrompt: String(
      node?.firstFramePrompt || buildFirstFramePrompt(videoPrompt, scriptSegment),
    ).trim(),
    lastFramePrompt: String(
      node?.lastFramePrompt || buildLastFramePrompt(videoPrompt, scriptSegment),
    ).trim(),
  };
}

interface CreationStore {
  // 项目状态
  nodes: FlowNode[];
  edges: FlowEdge[];

  // 画布状态
  selectedNodeId: string | null;
  isLoading: boolean;
  error: string | null;

  // 当前视频ID
  currentVideoId: string | null;

  // 导出任务状态
  stitchTask: ExportTask | null;
  exportTask: ExportTask | null;
  isStitching: boolean;
  isExporting: boolean;

  // Actions
  loadNodes: (videoId: string) => Promise<void>;
  createNode: (payload: CreateFlowNodePayload) => Promise<void>;
  generateNextNode: (payload: GenerateNextNodePayload) => Promise<void>;
  generateNodeCandidates: (
    currentNodeId: string,
    idea: string,
    count?: number,
  ) => Promise<PromptBundleCandidate[]>;
  createNodesFromSegments: (videoId: string, segments: Array<{ segment: string; prompt: string; estimatedDuration?: number }>) => Promise<void>;
  createBranch: (sourceNodeId: string, branchName: string, promptOverride?: string) => Promise<void>;
  mergeBranch: (branchNodeId: string) => Promise<void>;
  updateNode: (nodeId: string, data: Partial<FlowNodeData>) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  selectNode: (nodeId: string | null) => void;

  // 节点位置更新（拖拽）
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;

  // 首帧/落幅生成
  generateFrame: (nodeId: string, frameType: 'first' | 'last', prompt?: string) => Promise<void>;

  // 帧锁定/解锁
  lockFrame: (nodeId: string, frameType: 'first' | 'last', locked: boolean) => Promise<void>;

  // 渲染节点
  renderNode: (nodeId: string, quality?: string) => Promise<void>;

  // 串联视频
  stitch: (videoId: string, options?: StitchFlowPayload) => Promise<void>;

  // 导出项目
  exportProject: (videoId: string, options?: ExportProjectPayload) => Promise<void>;

  // 查询任务状态
  pollStitchTask: (taskId: string) => Promise<void>;
  pollExportTask: (taskId: string) => Promise<void>;
  pollRenderTask: (nodeId: string, taskId: string) => Promise<void>;
  refineNodeCopy: (nodeId: string, requirement: string) => Promise<void>;
  precheckNode: (nodeId: string) => Promise<NodePrecheckResult | null>;
  assessNodeQuality: (nodeId: string) => Promise<{
    nodeId: string;
    quality: {
      promptCompleteness: number;
      continuity: number;
      renderStability: number;
      subjectConsistency: number;
      overall: number;
    };
    precheckLevel: NodePrecheckLevel;
    issueCount: number;
  } | null>;
  compareBranch: (nodeId: string) => Promise<BranchCompareResult | null>;
  updateNodeLocalData: (nodeId: string, data: Partial<FlowNodeData>) => void;

  // 清除状态
  clear: () => void;
}

export const useCreationStore = create<CreationStore>((set, get) => ({
  // Initial state
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isLoading: false,
  error: null,
  currentVideoId: null,
  stitchTask: null,
  exportTask: null,
  isStitching: false,
  isExporting: false,

  // Load nodes from API
  loadNodes: async (videoId: string) => {
    set({ isLoading: true, error: null, currentVideoId: videoId, selectedNodeId: null });
    try {
      const response = await creationApi.getNodes(videoId) as any[];

      // Transform API response to React Flow nodes
      const responseData = extractNodeList(response);
      const firstMainOrderIndex = responseData
        .filter((n: any) => !n.parentNodeId && !n.branchName)
        .reduce((min: number, n: any) => Math.min(min, Number(n.orderIndex ?? Infinity)), Number.POSITIVE_INFINITY);

      const flowNodes: FlowNode[] = responseData.map((node: any) => ({
        // 首节点保留首帧/尾帧；其他节点默认仅使用 sceneFrame(firstFrameUrl)。
        id: node.id,
        type: 'flowNodeCard',
        position: {
          x: node.positionX ?? node.position?.x ?? Math.random() * 500,
          y: node.positionY ?? node.position?.y ?? Math.random() * 400,
        },
        data: {
          ...resolvePromptBundle(node, node.prompt, node.scriptSegment),
          orderIndex: node.orderIndex,
          prompt: node.prompt,
          scriptSegment: node.scriptSegment,
          parentNodeId: node.parentNodeId ?? null,
          branchName: node.branchName ?? null,
          isMerged: Boolean(node.isMerged),
          childBranchCount: Array.isArray(node.childBranches) ? node.childBranches.length : 0,
          firstFrameUrl: node.firstFrameUrl,
          lastFrameUrl: node.lastFrameUrl,
          renderedVideoUrl: node.renderedVideoUrl,
          renderStatus: node.renderStatus || 'PENDING',
          renderProgress: node.renderProgress ?? 0,
          activeRenderTaskId: node.activeRenderTaskId ?? null,
          latestRenderTaskStatus: node.latestRenderTaskStatus ?? null,
          latestRenderTaskVideoUrl: node.latestRenderTaskVideoUrl ?? null,
          isFirstScene:
            !node.parentNodeId &&
            !node.branchName &&
            Number(node.orderIndex) === firstMainOrderIndex,
          firstFrameLocked: node.firstFrameLocked,
          lastFrameLocked: node.lastFrameLocked,
          narrationUrl: node.narrationUrl,
          bgmUrl: node.bgmUrl,
        },
      }));

      const flowEdges: FlowEdge[] = responseData
        .filter((node: any) => Boolean(node.parentNodeId))
        .map((node: any) => ({
          id: `edge-${node.parentNodeId}-${node.id}`,
          source: node.parentNodeId,
          target: node.id,
          animated: true,
          style: {
            stroke: '#9C27B0',
            strokeWidth: 1.5,
            strokeDasharray: '4 3',
          },
        }));

      set({ nodes: flowNodes, edges: flowEdges, isLoading: false });

      flowNodes.forEach((node) => {
        const taskId = node.data.activeRenderTaskId;
        if (taskId) {
          setTimeout(() => get().pollRenderTask(node.id, taskId), 50);
        }
      });
    } catch (error) {
      console.error('Failed to load nodes:', error);
      set({ error: '加载节点失败', isLoading: false });
    }
  },

  // Create a new node
  createNode: async (payload: CreateFlowNodePayload) => {
    const { currentVideoId } = get();
    if (!currentVideoId) return;

    set({ isLoading: true, error: null });
    try {
      const response = await creationApi.createNode(currentVideoId, payload) as any;
      const createdNode = extractSingleNode(response);

      if (!createdNode?.id) {
        await get().loadNodes(currentVideoId);
        return;
      }

      const newNode: FlowNode = {
        id: createdNode.id,
        type: 'flowNodeCard',
        position: {
          x: createdNode.positionX ?? payload.positionX ?? Math.random() * 500,
          y: createdNode.positionY ?? payload.positionY ?? Math.random() * 400,
        },
        data: {
          ...resolvePromptBundle(createdNode, createdNode.prompt, createdNode.scriptSegment),
          orderIndex: createdNode.orderIndex,
          prompt: createdNode.prompt,
          scriptSegment: createdNode.scriptSegment,
          parentNodeId: createdNode.parentNodeId ?? null,
          branchName: createdNode.branchName ?? null,
          isMerged: Boolean(createdNode.isMerged),
          childBranchCount: Array.isArray(createdNode.childBranches) ? createdNode.childBranches.length : 0,
          firstFrameUrl: createdNode.firstFrameUrl,
          lastFrameUrl: createdNode.lastFrameUrl,
          renderedVideoUrl: createdNode.renderedVideoUrl,
          renderStatus: createdNode.renderStatus || 'PENDING',
          renderProgress: createdNode.renderProgress ?? 0,
          activeRenderTaskId: createdNode.activeRenderTaskId ?? null,
          latestRenderTaskStatus: createdNode.latestRenderTaskStatus ?? null,
          latestRenderTaskVideoUrl: createdNode.latestRenderTaskVideoUrl ?? null,
          isFirstScene:
            Boolean(createdNode.isFirstScene) ||
            (!createdNode.parentNodeId && !createdNode.branchName && Number(createdNode.orderIndex) === 0),
          firstFrameLocked: createdNode.firstFrameLocked,
          lastFrameLocked: createdNode.lastFrameLocked,
        },
      };

      set((state) => ({
        nodes: [...state.nodes, newNode],
        edges: newNode.data.parentNodeId
          ? [
              ...state.edges,
              {
                id: `edge-${newNode.data.parentNodeId}-${newNode.id}`,
                source: newNode.data.parentNodeId,
                target: newNode.id,
                animated: true,
                style: {
                  stroke: '#9C27B0',
                  strokeWidth: 1.5,
                  strokeDasharray: '4 3',
                },
              },
            ]
          : state.edges,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to create node:', error);
      set({ error: '创建节点失败', isLoading: false });
    }
  },

  // Create multiple nodes from segments (for script split)
  createNodesFromSegments: async (videoId: string, segments: Array<{ segment: string; prompt: string; estimatedDuration?: number }>) => {
    set({ isLoading: true, error: null, currentVideoId: videoId });
    try {
      await creationApi.scriptSplit(videoId, {
        persist: true,
        segments: segments.map((s) => ({
          segment: s.segment,
          prompt: s.prompt,
          estimatedDuration: s.estimatedDuration,
        })),
      });

      // 统一重新拉取，避免前后端结构差异导致前端映射错误
      await get().loadNodes(videoId);
    } catch (error) {
      console.error('Failed to create nodes from segments:', error);
      set({ error: '批量创建节点失败', isLoading: false });
    }
  },

  // Simple mode: generate next node from current node + idea
  generateNextNode: async (payload: GenerateNextNodePayload) => {
    const { currentVideoId } = get();
    if (!currentVideoId) return;

    set({ isLoading: true, error: null });
    try {
      const response = await creationApi.generateNextNode(currentVideoId, payload) as any;
      const createdNode = extractSingleNode(response);

      if (!createdNode?.id) {
        await get().loadNodes(currentVideoId);
        return;
      }

      const parentNode = payload.currentNodeId
        ? get().nodes.find((n) => n.id === payload.currentNodeId)
        : null;

      const newNode: FlowNode = {
        id: createdNode.id,
        type: 'flowNodeCard',
        position: {
          x: createdNode.positionX ?? (parentNode ? parentNode.position.x + 260 : 180),
          y: createdNode.positionY ?? (parentNode ? parentNode.position.y : 160),
        },
        data: {
          ...resolvePromptBundle(
            response?.promptBundle || createdNode,
            createdNode.prompt,
            createdNode.scriptSegment,
          ),
          orderIndex: createdNode.orderIndex,
          prompt: createdNode.prompt,
          scriptSegment: createdNode.scriptSegment,
          parentNodeId: createdNode.parentNodeId ?? null,
          branchName: createdNode.branchName ?? null,
          isMerged: Boolean(createdNode.isMerged),
          childBranchCount: Array.isArray(createdNode.childBranches) ? createdNode.childBranches.length : 0,
          firstFrameUrl: createdNode.firstFrameUrl,
          lastFrameUrl: createdNode.lastFrameUrl,
          renderedVideoUrl: createdNode.renderedVideoUrl,
          renderStatus: createdNode.renderStatus || 'PENDING',
          renderProgress: createdNode.renderProgress ?? 0,
          activeRenderTaskId: createdNode.activeRenderTaskId ?? null,
          latestRenderTaskStatus: createdNode.latestRenderTaskStatus ?? null,
          latestRenderTaskVideoUrl: createdNode.latestRenderTaskVideoUrl ?? null,
          isFirstScene: Boolean(createdNode.isFirstScene),
          firstFrameLocked: createdNode.firstFrameLocked,
          lastFrameLocked: createdNode.lastFrameLocked,
        },
      };

      set((state) => ({
        nodes: [...state.nodes, newNode],
        edges: newNode.data.parentNodeId
          ? [
              ...state.edges,
              {
                id: `edge-${newNode.data.parentNodeId}-${newNode.id}`,
                source: newNode.data.parentNodeId,
                target: newNode.id,
                animated: true,
                style: {
                  stroke: '#9C27B0',
                  strokeWidth: 1.5,
                  strokeDasharray: '4 3',
                },
              },
            ]
          : state.edges,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to generate next node:', error);
      set({ error: 'AI 续写节点失败', isLoading: false });
    }
  },

  generateNodeCandidates: async (currentNodeId: string, idea: string, count = 3) => {
    const { currentVideoId } = get();
    if (!currentVideoId) return [];
    const normalizedIdea = idea.trim();
    if (!normalizedIdea) return [];

    try {
      const response = await creationApi.generateNodeCandidates(currentVideoId, {
        currentNodeId,
        idea: normalizedIdea,
        count,
      }) as any;
      const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
      return candidates.map((candidate: any, idx: number) => ({
        index: Number(candidate?.index ?? idx),
        ...resolvePromptBundle(candidate, candidate?.videoPrompt || candidate?.prompt, candidate?.scriptSegment),
        scriptSegment: String(candidate?.scriptSegment || '').trim(),
        videoPrompt: String(candidate?.videoPrompt || candidate?.prompt || '').trim(),
      }));
    } catch (error) {
      console.error('Failed to generate node candidates:', error);
      set({ error: '生成节点候选失败' });
      return [];
    }
  },

  // Update a node
  createBranch: async (sourceNodeId: string, branchName: string, promptOverride?: string) => {
    const { currentVideoId } = get();
    if (!currentVideoId) return;

    set({ isLoading: true, error: null });
    try {
      await creationApi.createBranch(currentVideoId, {
        sourceNodeId,
        branchName,
        promptOverride,
      });
      await get().loadNodes(currentVideoId);
    } catch (error) {
      console.error('Failed to create branch:', error);
      set({ error: '创建分支失败', isLoading: false });
    }
  },

  mergeBranch: async (branchNodeId: string) => {
    const { currentVideoId, nodes } = get();
    if (!currentVideoId) return;

    const previousNodes = nodes;
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === branchNodeId
          ? { ...node, data: { ...node.data, isMerged: true } }
          : node
      ),
    }));

    try {
      await creationApi.mergeBranch(currentVideoId, branchNodeId);
      await get().loadNodes(currentVideoId);
    } catch (error) {
      console.error('Failed to merge branch:', error);
      set({ nodes: previousNodes, error: '合并分支失败' });
    }
  },

  // Update a node
  updateNode: async (nodeId: string, data: Partial<FlowNodeData>) => {
    const { currentVideoId, nodes } = get();
    if (!currentVideoId) return;

    // Optimistic update
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      ),
    }));

    try {
      await creationApi.updateNode(currentVideoId, nodeId, data as any);
    } catch (error) {
      console.error('Failed to update node:', error);
      // Revert on error
      set({ nodes });
      set({ error: '更新节点失败' });
    }
  },

  updateNodeLocalData: (nodeId: string, data: Partial<FlowNodeData>) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      ),
    }));
  },

  // Delete a node
  deleteNode: async (nodeId: string) => {
    const { currentVideoId, nodes } = get();
    if (!currentVideoId) return;

    // Optimistic update
    const previousNodes = nodes;
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== nodeId),
    }));

    try {
      await creationApi.deleteNode(currentVideoId, nodeId);
    } catch (error) {
      console.error('Failed to delete node:', error);
      // Revert on error
      set({ nodes: previousNodes });
      set({ error: '删除节点失败' });
    }
  },

  // Select a node
  selectNode: (nodeId: string | null) => {
    set({ selectedNodeId: nodeId });
  },

  // Update node position (for drag)
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, position } : node
      ),
    }));
  },

  // Generate frame (first or last)
  generateFrame: async (nodeId: string, frameType: 'first' | 'last', prompt?: string) => {
    const { currentVideoId } = get();
    if (!currentVideoId) return;

    const node = get().nodes.find((n) => n.id === nodeId);
    const fallbackPrompt =
      prompt ||
      (frameType === 'first'
        ? (node?.data.sceneFramePrompt || node?.data.firstFramePrompt || node?.data.prompt)
        : (node?.data.lastFramePrompt || node?.data.prompt));

    // Set loading state
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, isGeneratingFrame: true } } : node
      ),
    }));

    try {
      const response = await creationApi.generateFrame(nodeId, { frameType, prompt: fallbackPrompt }) as any;

      // Update node with generated frame URL
      const updateData: Partial<FlowNodeData> = {
        isGeneratingFrame: false,
      };

      if (frameType === 'first') {
        updateData.firstFrameUrl = response.frameUrl;
      } else {
        updateData.lastFrameUrl = response.frameUrl;
      }

      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...updateData } } : node
        ),
      }));
    } catch (error) {
      console.error('Failed to generate frame:', error);
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, isGeneratingFrame: false } } : node
        ),
        error: '生成帧失败',
      }));
    }
  },

  // Lock/unlock frame
  lockFrame: async (nodeId: string, frameType: 'first' | 'last', locked: boolean) => {
    const { currentVideoId, nodes } = get();
    if (!currentVideoId) return;

    // Optimistic update
    const previousNodes = nodes;
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                ...(frameType === 'first'
                  ? { firstFrameLocked: locked }
                  : { lastFrameLocked: locked }),
              },
            }
          : node
      ),
    }));

    try {
      await creationApi.lockFrame(nodeId, { frameType, locked });
    } catch (error) {
      console.error('Failed to lock frame:', error);
      // Revert on error
      set({ nodes: previousNodes });
      set({ error: '锁定帧失败' });
    }
  },

  // Render node (generate video)
  renderNode: async (nodeId: string, quality?: string) => {
    const { currentVideoId } = get();
    if (!currentVideoId) return;

    const precheck = await get().precheckNode(nodeId);
    if (precheck?.level === 'high_risk') {
      const highestIssue = precheck.issues.find((item) => item.severity === 'high') || precheck.issues[0];
      set({
        error: highestIssue
          ? `预检未通过：${highestIssue.message}`
          : '预检未通过：当前节点风险过高，请先补全提示词或帧锚点',
      });
      return;
    }

    // Set loading state
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, isRendering: true, renderStatus: 'PROCESSING' as RenderStatus } } : node
      ),
    }));

    try {
      const response = await creationApi.renderNode(nodeId, quality) as any;
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  isRendering: true,
                  renderStatus: 'PROCESSING',
                  renderProgress: 0,
                  activeRenderTaskId: response.taskId,
                },
              }
            : node
        ),
      }));

      console.log('Render queued for node:', nodeId, 'taskId:', response.taskId);
      get().pollRenderTask(nodeId, response.taskId);
    } catch (error) {
      console.error('Failed to render node:', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : '渲染失败';
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, isRendering: false, renderStatus: 'FAILED' as RenderStatus } } : node
        ),
        error: message,
      }));
    }
  },

  pollRenderTask: async (nodeId: string, taskId: string) => {
    try {
      const response = await creationApi.getRenderTaskStatus(taskId) as any;

      const nextStatus = response?.renderStatus || response?.status || 'PROCESSING';
      const nextProgress = Number(response?.progress ?? 0);
      const videoUrl = response?.videoUrl || null;

      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  renderStatus: nextStatus as RenderStatus,
                  renderProgress: nextProgress,
                  renderedVideoUrl: videoUrl || node.data.renderedVideoUrl,
                  isRendering: nextStatus === 'PROCESSING' || nextStatus === 'PENDING',
                  activeRenderTaskId:
                    nextStatus === 'PROCESSING' || nextStatus === 'PENDING' ? taskId : null,
                },
              }
            : node
        ),
      }));

      if (nextStatus === 'COMPLETED' || nextStatus === 'FAILED') {
        if (nextStatus === 'FAILED') {
          set({ error: response?.error || '节点渲染失败' });
        }
        return;
      }

      setTimeout(() => get().pollRenderTask(nodeId, taskId), 1800);
    } catch (error) {
      console.error('Failed to poll render task:', error);
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  isRendering: false,
                  renderStatus: 'FAILED',
                },
              }
            : node
        ),
        error: '查询渲染状态失败',
      }));
    }
  },

  refineNodeCopy: async (nodeId: string, requirement: string) => {
    const req = requirement.trim();
    if (!req) return;
    try {
      const response = await creationApi.refineNodeCopy(nodeId, { requirement: req }) as any;
      const node = response?.node;
      if (!node?.id) return;
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === node.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  prompt: node.prompt,
                  scriptSegment: node.scriptSegment,
                  ...resolvePromptBundle(node, node.prompt, node.scriptSegment),
                },
              }
            : n
        ),
      }));
    } catch (error) {
      console.error('Failed to refine node copy:', error);
      set({ error: 'AI 调整文案失败' });
    }
  },

  precheckNode: async (nodeId: string) => {
    try {
      const response = await creationApi.precheckNode(nodeId);
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  precheckLevel: response.level,
                  precheckIssues: response.issues,
                  qualityScore: response.quality.overall,
                  qualityBreakdown: response.quality,
                },
              }
            : node,
        ),
      }));
      return response;
    } catch (error) {
      console.error('Failed to precheck node:', error);
      set({ error: '节点预检失败' });
      return null;
    }
  },

  assessNodeQuality: async (nodeId: string) => {
    try {
      const response = await creationApi.assessNodeQuality(nodeId);
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  precheckLevel: response.precheckLevel,
                  qualityScore: response.quality.overall,
                  qualityBreakdown: response.quality,
                },
              }
            : node,
        ),
      }));
      return response;
    } catch (error) {
      console.error('Failed to assess node quality:', error);
      set({ error: '质量评估失败' });
      return null;
    }
  },

  compareBranch: async (nodeId: string) => {
    try {
      return await creationApi.compareBranch(nodeId);
    } catch (error) {
      console.error('Failed to compare branch:', error);
      set({ error: '分支对比失败' });
      return null;
    }
  },

  // Stitch videos
  stitch: async (videoId: string, options?: StitchFlowPayload) => {
    const { currentVideoId } = get();
    if (!currentVideoId && !videoId) return;

    const targetVideoId = videoId || currentVideoId;
    if (!targetVideoId) return;

    set({ isStitching: true, stitchTask: null, error: null });

    try {
      const response = await creationApi.stitch(targetVideoId, options || {}) as any;

      set({
        isStitching: false,
        stitchTask: {
          taskId: response.taskId,
          status: 'PENDING',
          progress: 0,
        },
      });

      console.log('Stitch queued for video:', targetVideoId, 'taskId:', response.taskId);

      // 开始轮询任务状态
      get().pollStitchTask(response.taskId);
    } catch (error) {
      console.error('Failed to stitch:', error);
      set({
        isStitching: false,
        error: '串联失败',
      });
    }
  },

  // Poll stitch task status
  pollStitchTask: async (taskId: string) => {
    try {
      const response = await creationApi.getStitchTaskStatus(taskId) as any;

      set({
        stitchTask: {
          taskId: response.taskId,
          status: response.status,
          progress: response.progress,
          downloadUrl: response.outputUrl,
          error: response.error,
        },
      });

      // 如果任务完成或失败，停止轮询
      if (response.status === 'COMPLETED' || response.status === 'FAILED') {
        set({ isStitching: false });
        return;
      }

      // 继续轮询
      if (response.status === 'PROCESSING') {
        setTimeout(() => get().pollStitchTask(taskId), 2000);
      }
    } catch (error) {
      console.error('Failed to poll stitch task:', error);
      set({
        isStitching: false,
        error: '查询串联状态失败',
      });
    }
  },

  // Export project
  exportProject: async (videoId: string, options?: ExportProjectPayload) => {
    const { currentVideoId } = get();
    if (!currentVideoId && !videoId) return;

    const targetVideoId = videoId || currentVideoId;
    if (!targetVideoId) return;

    set({ isExporting: true, exportTask: null, error: null });

    try {
      const response = await creationApi.exportProject(targetVideoId, options) as any;

      set({
        isExporting: false,
        exportTask: {
          taskId: response.taskId,
          status: 'PENDING',
          progress: 0,
          format: response.format,
        },
      });

      console.log('Export queued for video:', targetVideoId, 'taskId:', response.taskId, 'format:', response.format);

      // 开始轮询任务状态
      get().pollExportTask(response.taskId);
    } catch (error) {
      console.error('Failed to export:', error);
      set({
        isExporting: false,
        error: '导出失败',
      });
    }
  },

  // Poll export task status
  pollExportTask: async (taskId: string) => {
    try {
      const response = await creationApi.getExportTaskStatus(taskId) as any;

      set({
        exportTask: {
          taskId: response.taskId,
          status: response.status,
          progress: response.progress,
          downloadUrl: response.downloadUrl,
          format: response.format,
          error: response.error,
        },
      });

      // 如果任务完成或失败，停止轮询
      if (response.status === 'COMPLETED' || response.status === 'FAILED') {
        set({ isExporting: false });
        return;
      }

      // 继续轮询
      if (response.status === 'PROCESSING') {
        setTimeout(() => get().pollExportTask(taskId), 2000);
      }
    } catch (error) {
      console.error('Failed to poll export task:', error);
      set({
        isExporting: false,
        error: '查询导出状态失败',
      });
    }
  },

  // Clear state
  clear: () => {
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      isLoading: false,
      error: null,
      currentVideoId: null,
      stitchTask: null,
      exportTask: null,
      isStitching: false,
      isExporting: false,
    });
  },
}));
