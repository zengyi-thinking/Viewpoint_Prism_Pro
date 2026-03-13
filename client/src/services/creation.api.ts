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

export interface CreationConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface CreationConversationState {
  messages: CreationConversationMessage[];
  summary: {
    storyIntent: string;
    visualStyle: string;
    splitPreference: string;
  };
  scriptDraft: string;
  chaptersHint: number;
  lastUpdatedAt: string | null;
}

export interface CreationScenePlanScene {
  id: string;
  chapterIndex: number;
  sceneName: string;
  summary: string;
  visualSummary: string;
  location: string;
  timeOfDay: string;
  characters: string[];
  dialogueLines: { speaker: string; text: string }[];
  contentType: 'dialogue' | 'action' | 'mixed';
  continuityTone: string;
}

export interface CharacterAsset {
  id: string;
  name: string;
  description: string;
  appearance: string;
  imagePrompt: string;
  imageUrl?: string;
  identity: string;
  genderHint: string;
  ageHint: string;
}

export interface SceneAsset {
  id: string;
  sceneId: string;
  name: string;
  description: string;
  imagePrompt: string;
  imageUrl?: string;
  continuityTone: string;
}

export interface StoryboardSegment {
  id: string;
  chapterIndex: number;
  sceneId: string;
  title: string;
  summary: string;
  visualDescription: string;
  contentType: 'dialogue' | 'action' | 'mixed';
  characterRefs: string[];
  dialogueLines: { speaker: string; text: string }[];
  shotList: string[];
  videoPrompt?: string;
  compressedVideoPrompt?: string;
  storyboardImageUrl?: string;
  displayPromptCn?: string;
  imagePromptCn?: string;
  imagePromptModel?: string;
  continuityNotes?: string;
}

export interface VoiceCasting {
  characterName: string;
  voiceId: string;
  voiceName: string;
  rationale: string;
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
      conversationState: CreationConversationState;
      scriptPackage: { overallSummary: string; sourceScript: string } | null;
      previews: IdeaPreviewOption[];
      selectedPreviewId: string | null;
      scriptPlan: { summary: string; chapters: ScriptPlanChapter[] } | null;
      scenePlan: { overallSummary: string; scenes: CreationScenePlanScene[] } | null;
      characterAssets: CharacterAsset[];
      sceneAssets: SceneAsset[];
      storyboardSegments: StoryboardSegment[];
      voiceCasting: VoiceCasting[];
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

  appendConversationMessage(projectId: string, payload: { content: string; backgroundVideoId?: string }) {
    return apiFetch<CreationGraphResponse>(`/api/prism/creation/projects/${projectId}/conversation/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
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

  generateProductionPackage(flowProjectId: string, payload?: { artStyle?: string }) {
    return apiFetch<CreationGraphResponse>(`/api/prism/creation/projects/${flowProjectId}/production-package`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  generateProductionAssetImage(
    flowProjectId: string,
    assetType: 'character' | 'scene' | 'segment',
    assetId: string,
  ) {
    return apiFetch<CreationGraphResponse>(
      `/api/prism/creation/projects/${flowProjectId}/production-assets/${assetType}/${assetId}/generate-image`,
      {
        method: 'POST',
      },
    );
  },

  updateScriptPlanChapter(
    flowProjectId: string,
    chapterIndex: number,
    payload: Partial<Pick<ScriptPlanChapter, 'title' | 'summary' | 'goal' | 'storyboardCount'>>,
  ) {
    return apiFetch<CreationGraphResponse>(
      `/api/prism/creation/projects/${flowProjectId}/script-plan/chapters/${chapterIndex}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
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
