'use client';

import { create } from 'zustand';
import { Node, Edge } from '@xyflow/react';
import { creationApi, CreateFlowNodePayload, StitchFlowPayload, ExportProjectPayload } from '@/services/creation.api';

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
  prompt?: string;
  scriptSegment?: string;
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
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

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
  createNodesFromSegments: (videoId: string, segments: Array<{ segment: string; prompt: string; estimatedDuration?: number }>) => Promise<void>;
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
    set({ isLoading: true, error: null, currentVideoId: videoId });
    try {
      const response = await creationApi.getNodes(videoId) as any[];

      // Transform API response to React Flow nodes
      const flowNodes: FlowNode[] = response.map((node: any) => ({
        id: node.id,
        type: 'flowNodeCard',
        position: {
          x: node.positionX ?? node.positionX ?? Math.random() * 500,
          y: node.positionY ?? node.positionY ?? Math.random() * 400,
        },
        data: {
          orderIndex: node.orderIndex,
          prompt: node.prompt,
          scriptSegment: node.scriptSegment,
          firstFrameUrl: node.firstFrameUrl,
          lastFrameUrl: node.lastFrameUrl,
          renderedVideoUrl: node.renderedVideoUrl,
          renderStatus: node.renderStatus || 'PENDING',
          firstFrameLocked: node.firstFrameLocked,
          lastFrameLocked: node.lastFrameLocked,
          narrationUrl: node.narrationUrl,
          bgmUrl: node.bgmUrl,
        },
      }));

      set({ nodes: flowNodes, edges: [], isLoading: false });
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

      const newNode: FlowNode = {
        id: response.id,
        type: 'flowNodeCard',
        position: {
          x: payload.positionX ?? Math.random() * 500,
          y: payload.positionY ?? Math.random() * 400,
        },
        data: {
          orderIndex: response.orderIndex,
          prompt: response.prompt,
          scriptSegment: response.scriptSegment,
          firstFrameUrl: response.firstFrameUrl,
          lastFrameUrl: response.lastFrameUrl,
          renderedVideoUrl: response.renderedVideoUrl,
          renderStatus: response.renderStatus || 'PENDING',
          firstFrameLocked: response.firstFrameLocked,
          lastFrameLocked: response.lastFrameLocked,
        },
      };

      set((state) => ({
        nodes: [...state.nodes, newNode],
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
      const response = await creationApi.scriptSplit(videoId, {
        scriptText: segments.map(s => s.segment).join('\n\n'),
      }) as { segments: any[] };

      const newNodes: FlowNode[] = (response.segments || []).map((node: any) => ({
        id: node.id,
        type: 'flowNodeCard',
        position: {
          x: node.positionX ?? Math.random() * 500,
          y: node.positionY ?? Math.random() * 400,
        },
        data: {
          orderIndex: node.orderIndex,
          prompt: node.prompt,
          scriptSegment: node.scriptSegment,
          firstFrameUrl: node.firstFrameUrl,
          lastFrameUrl: node.lastFrameUrl,
          renderedVideoUrl: node.renderedVideoUrl,
          renderStatus: node.renderStatus || 'PENDING',
          firstFrameLocked: node.firstFrameLocked,
          lastFrameLocked: node.lastFrameLocked,
        },
      }));

      set((state) => ({
        nodes: [...state.nodes, ...newNodes],
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to create nodes from segments:', error);
      set({ error: '批量创建节点失败', isLoading: false });
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

    // Set loading state
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, isGeneratingFrame: true } } : node
      ),
    }));

    try {
      const response = await creationApi.generateFrame(nodeId, { frameType, prompt }) as any;

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

    // Set loading state
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, isRendering: true, renderStatus: 'PROCESSING' as RenderStatus } } : node
      ),
    }));

    try {
      const response = await creationApi.renderNode(nodeId, quality) as any;

      // The actual video will be updated via polling or websocket
      // For now, we just set the status
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, isRendering: false } } : node
        ),
      }));

      console.log('Render queued for node:', nodeId, 'taskId:', response.taskId);
    } catch (error) {
      console.error('Failed to render node:', error);
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, isRendering: false, renderStatus: 'FAILED' as RenderStatus } } : node
        ),
        error: '渲染失败',
      }));
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
