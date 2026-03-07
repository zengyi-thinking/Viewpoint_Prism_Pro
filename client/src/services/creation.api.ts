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
  scriptText?: string;
  persist?: boolean;
  adjustInstruction?: string;
  segments?: Array<{
    segment: string;
    prompt?: string;
    estimatedDuration?: number;
  }>;
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

export interface GenerateNextNodePayload {
  currentNodeId?: string;
  idea: string;
  branchName?: string;
  scriptSegment?: string;
  videoPrompt?: string;
  sceneFramePrompt?: string;
  firstFramePrompt?: string;
  lastFramePrompt?: string;
}

export interface GenerateIdeaPreviewPayload {
  idea: string;
  count?: number;
  tone?: string;
}

export interface IdeaPreviewResult {
  title: string;
  openingScene: string;
  progressionBeat: string;
  styleNotes: string;
  confirmationChecklist: string[];
  promptBundle: {
    scriptSegment: string;
    videoPrompt: string;
    sceneFramePrompt: string;
    firstFramePrompt: string;
    lastFramePrompt: string;
  };
}

export interface GenerateNodeCandidatesPayload {
  currentNodeId: string;
  idea: string;
  count?: number;
  branchName?: string;
}

export type NodePrecheckLevel = 'ready' | 'suggest_improve' | 'high_risk';

export interface NodePrecheckIssue {
  code: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  suggestion: string;
}

export interface NodeQuality {
  promptCompleteness: number;
  continuity: number;
  renderStability: number;
  subjectConsistency: number;
  overall: number;
}

export interface NodePrecheckResult {
  userId: string;
  nodeId: string;
  level: NodePrecheckLevel;
  issues: NodePrecheckIssue[];
  quality: NodeQuality;
}

export interface BranchCompareResult {
  userId: string;
  branchNodeId: string;
  mainNodeId: string;
  recommendation: 'merge_branch' | 'keep_main' | 'manual_review';
  reasons: string[];
  compare: {
    branch: {
      nodeId: string;
      quality: NodeQuality;
      issues: NodePrecheckIssue[];
    };
    main: {
      nodeId: string;
      quality: NodeQuality;
      issues: NodePrecheckIssue[];
    };
    delta: {
      overall: number;
      promptCompleteness: number;
      continuity: number;
      renderStability: number;
    };
  };
}

export const creationApi = {
  getNodes: (videoId: string) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/nodes`),

  createNode: (videoId: string, payload: CreateFlowNodePayload) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateNextNode: (videoId: string, payload: GenerateNextNodePayload) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/nodes/next`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateIdeaPreview: (videoId: string, payload: GenerateIdeaPreviewPayload) =>
    apiFetch<{
      userId: string;
      videoId: string;
      projectId: string;
      mode: 'idea_preview';
      existingNodeCount: number;
      tone: string;
      count: number;
      previews: IdeaPreviewResult[];
    }>(`/api/prism/creation/videos/${videoId}/nodes/idea-preview`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateNodeCandidates: (videoId: string, payload: GenerateNodeCandidatesPayload) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/nodes/expand-candidates`, {
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

  mergeBranch: (videoId: string, nodeId: string) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/branches/${nodeId}/merge`, {
      method: 'POST',
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

  getRenderTaskStatus: (taskId: string) =>
    apiFetch(`/api/prism/creation/tasks/${taskId}/render-status`),

  refineNodeCopy: (nodeId: string, payload: { requirement: string }) =>
    apiFetch(`/api/prism/creation/nodes/${nodeId}/refine-copy`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  precheckNode: (nodeId: string) =>
    apiFetch(`/api/prism/creation/nodes/${nodeId}/precheck`) as Promise<NodePrecheckResult>,

  assessNodeQuality: (nodeId: string) =>
    apiFetch(`/api/prism/creation/nodes/${nodeId}/quality`) as Promise<{
      userId: string;
      nodeId: string;
      quality: NodeQuality;
      precheckLevel: NodePrecheckLevel;
      issueCount: number;
    }>,

  compareBranch: (nodeId: string) =>
    apiFetch(`/api/prism/creation/branches/${nodeId}/compare`) as Promise<BranchCompareResult>,

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
