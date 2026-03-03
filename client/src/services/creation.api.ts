import { apiFetch } from './api';

export interface CreateFlowNodePayload {
  orderIndex: number;
  prompt?: string;
  scriptSegment?: string;
  parentNodeId?: string;
  positionX?: number;
  positionY?: number;
}

export interface CreateBranchPayload {
  sourceNodeId: string;
  branchName: string;
  promptOverride?: string;
}

export interface RenderFlowPayload {
  nodeId: string;
  quality?: 'draft' | 'high';
  stylePresetId?: string;
}

export interface StitchFlowPayload {
  includeNarration?: boolean;
  includeBgm?: boolean;
  bgmVolume?: number;
}

export interface ExportProjectPayload {
  format?: 'mp4' | 'webm' | 'json' | 'zip';
}

export interface ScriptSplitPayload {
  scriptText: string;
  stylePreset?: {
    cameraMovements?: string[];
    pacePattern?: number[];
    colorGrading?: Record<string, any>;
    transitionStyle?: string;
  };
}

export interface ScriptSegment {
  id: string;
  orderIndex: number;
  prompt?: string;
  scriptSegment?: string;
  positionX: number;
  positionY: number;
  renderStatus: string;
}

export interface GenerateFramePayload {
  frameType: 'first' | 'last';
  prompt?: string;
}

export interface LockFramePayload {
  frameType: 'first' | 'last';
  locked: boolean;
}

export const creationApi = {
  getNodes: (videoId: string) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/nodes`),

  createNode: (videoId: string, payload: CreateFlowNodePayload) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateNode: (videoId: string, nodeId: string, payload: Record<string, any>) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/nodes/${nodeId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteNode: (videoId: string, nodeId: string) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/nodes/${nodeId}`, {
      method: 'DELETE',
    }),

  createBranch: (videoId: string, payload: CreateBranchPayload) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/branches`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  render: (videoId: string, payload: RenderFlowPayload) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/render`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  stitch: (videoId: string, payload: StitchFlowPayload = {}) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/stitch`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  scriptSplit: (videoId: string, payload: ScriptSplitPayload) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/script-split`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Frame generation
  generateFrame: (nodeId: string, payload: GenerateFramePayload) =>
    apiFetch(`/api/prism/creation/nodes/${nodeId}/generate-frame`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Frame lock/unlock
  lockFrame: (nodeId: string, payload: LockFramePayload) =>
    apiFetch(`/api/prism/creation/nodes/${nodeId}/lock-frame`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Render single node
  renderNode: (nodeId: string, quality?: string) => {
    const query = quality ? `?quality=${quality}` : '';
    return apiFetch(`/api/prism/creation/nodes/${nodeId}/render${query}`, {
      method: 'POST',
    });
  },

  // Export project
  exportProject: (videoId: string, payload?: ExportProjectPayload) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/export`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  // Get stitch task status
  getStitchTaskStatus: (taskId: string) =>
    apiFetch(`/api/prism/creation/tasks/${taskId}/stitch-status`),

  // Get export task status
  getExportTaskStatus: (taskId: string) =>
    apiFetch(`/api/prism/creation/tasks/${taskId}/export-status`),
};
