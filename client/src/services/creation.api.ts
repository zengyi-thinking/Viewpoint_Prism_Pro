import { apiFetch } from './api';

export interface CharacterAnchor {
  identity: string;
  hair: string;
  outfit: string;
  face: string;
  prop: string;
}

export interface CreationGraphNode {
  id: string;
  title: string;
  scriptSegment: string;
  modelPrompt: string;
  displayPromptCn: string;
  imagePromptCn: string;
  imagePromptModel: string;
  videoPrompt: string;
  continuityNotes: string;
  characterAnchor: CharacterAnchor;
  continuityLocked: boolean;
  orderIndex: number;
  positionX: number;
  positionY: number;
  parentNodeId: string | null;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  renderedVideoUrl?: string | null;
  renderStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

export interface IdeaPreviewOption {
  id: string;
  title: string;
  openingScene: string;
  conflict: string;
  progression: string;
  whyItWorks: string;
  firstNodeScript: string;
}

export interface ScriptPlanChapter {
  index: number;
  title: string;
  summary: string;
  goal: string;
  storyboardCount: number;
}

export interface CreationNextCandidate {
  id: string;
  title: string;
  scriptSegment: string;
  visualDescription: string;
}

export interface CreationGraphResponse {
  project: {
    id: string;
    videoId: string | null;
    projectId: string | null;
    name: string;
    mode: 'idea' | 'script';
    status: string;
    scriptText?: string | null;
    meta: {
      backgroundVideoId?: string | null;
      previews: IdeaPreviewOption[];
      selectedPreviewId: string | null;
      scriptPlan: { summary: string; chapters: ScriptPlanChapter[] } | null;
    };
  };
  nodes: CreationGraphNode[];
}

export const creationApi = {
  bootstrap(projectId: string, backgroundVideoId?: string) {
    return apiFetch<CreationGraphResponse>(`/api/prism/creation/projects/${projectId}/bootstrap`, {
      method: 'POST',
      body: JSON.stringify(backgroundVideoId ? { backgroundVideoId } : {}),
    });
  },

  getGraph(flowProjectId: string) {
    return apiFetch<CreationGraphResponse>(`/api/prism/creation/projects/${flowProjectId}/graph`);
  },

  resetProject(flowProjectId: string) {
    return apiFetch<CreationGraphResponse>(`/api/prism/creation/projects/${flowProjectId}/reset`, {
      method: 'POST',
    });
  },

  generateIdeaPreviews(projectId: string, payload: {
    idea: string;
    conflict?: string;
    setting?: string;
    visualGoal?: string;
    constraints?: string;
    count?: number;
    backgroundVideoId?: string;
  }) {
    return apiFetch<{ flowProjectId: string; previews: IdeaPreviewOption[] }>(`/api/prism/creation/projects/${projectId}/idea-previews`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  selectIdeaPreview(flowProjectId: string, previewId: string) {
    return apiFetch<CreationGraphResponse>(`/api/prism/creation/projects/${flowProjectId}/previews/select`, {
      method: 'POST',
      body: JSON.stringify({ previewId }),
    });
  },

  generateScriptPlan(projectId: string, payload: { scriptText: string; chaptersHint?: number; backgroundVideoId?: string }) {
    return apiFetch<{ flowProjectId: string; scriptPlan: { summary: string; chapters: ScriptPlanChapter[] } }>(`/api/prism/creation/projects/${projectId}/script-plan`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createChapterNodes(flowProjectId: string, chapterIndex: number) {
    return apiFetch<CreationGraphResponse>(`/api/prism/creation/projects/${flowProjectId}/chapters/create`, {
      method: 'POST',
      body: JSON.stringify({ chapterIndex }),
    });
  },

  updateNode(nodeId: string, payload: Record<string, unknown>) {
    return apiFetch<CreationGraphResponse>(`/api/prism/creation/nodes/${nodeId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteNode(nodeId: string) {
    return apiFetch<CreationGraphResponse>(`/api/prism/creation/nodes/${nodeId}`, {
      method: 'DELETE',
    });
  },

  reextractCharacterAnchor(nodeId: string) {
    return apiFetch<CreationGraphResponse>(`/api/prism/creation/nodes/${nodeId}/reextract-character-anchor`, {
      method: 'POST',
    });
  },

  generateNextCandidates(nodeId: string, payload: { intent?: string; count?: number }) {
    return apiFetch<{ nodeId: string; candidates: CreationNextCandidate[] }>(`/api/prism/creation/nodes/${nodeId}/next-candidates`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  selectNextCandidate(nodeId: string, candidateId: string) {
    return apiFetch<CreationGraphResponse>(`/api/prism/creation/nodes/${nodeId}/next-candidates/select`, {
      method: 'POST',
      body: JSON.stringify({ candidateId }),
    });
  },

  generateNodeImage(nodeId: string) {
    return apiFetch<{ taskId: string; imageUrl: string }>(`/api/prism/creation/nodes/${nodeId}/generate-image`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  renderNodeVideo(nodeId: string) {
    return apiFetch<{ taskId: string; queueJobId: string }>(`/api/prism/creation/nodes/${nodeId}/render-video`, {
      method: 'POST',
    });
  },

  stitchProject(flowProjectId: string) {
    return apiFetch<{ taskId: string; queueJobId: string }>(`/api/prism/creation/projects/${flowProjectId}/stitch`, {
      method: 'POST',
    });
  },

  getTask(taskId: string) {
    return apiFetch<any>(`/api/prism/creation/tasks/${taskId}`);
  },
};
