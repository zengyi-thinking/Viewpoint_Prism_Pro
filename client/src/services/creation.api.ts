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
}

export const creationApi = {
  getNodes: (videoId: string) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/nodes`),

  createNode: (videoId: string, payload: CreateFlowNodePayload) =>
    apiFetch(`/api/prism/creation/videos/${videoId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(payload),
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
};
