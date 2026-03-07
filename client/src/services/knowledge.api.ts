import { apiFetch } from './api';
import type {
  CrystalCardCollection,
  CrystalCardGenerationOptions,
  CrystalCardRegenerateResponse,
  CrystalCardUpdate,
  FeaturedCrystalCards,
} from '../types/crystal-card';
import type {
  GenerateMindmapDto,
  MindmapExportFormat,
  MindmapResult,
} from '../types/mindmap';

export interface AnalyzeKnowledgePayload {
  regenerateTranscript?: boolean;
  regenerateKeyframes?: boolean;
  includeDeepAnalysis?: boolean;
}

export interface BatchAnalyzeKnowledgePayload extends AnalyzeKnowledgePayload {
  videoIds: string[];
}

export interface ExportKnowledgePayload {
  target?: 'markdown' | 'notion' | 'feishu';
  syncTargets?: Array<'notion' | 'feishu'>;
  forceRegenerate?: boolean;
}

export interface SettleKnowledgePayload {
  syncTargets?: Array<'notion' | 'feishu'>;
  forceRegenerate?: boolean;
}

export interface KnowledgeSettlementResponse {
  taskId: string;
  userId: string;
  videoId: string;
  status: 'completed';
  boardState: KnowledgeBoardState;
  output: {
    title: string;
    outlineMarkdown: string;
    notesMarkdown: string;
    reviewPlanMarkdown: string;
    markdownPackage: {
      fileName: string;
      content: string;
      size: number;
    };
    flashcards: Array<{
      id: string;
      front: string;
      back: string;
      chapter?: string | null;
      difficulty: number;
      nextReview?: string | null;
    }>;
    keyframes: Array<{
      id: string;
      timestamp: number;
      url: string;
      description?: string | null;
      frameType: string;
    }>;
  };
  sync: Partial<
    Record<
      'notion' | 'feishu',
      {
        success: boolean;
        mode: 'api' | 'dry-run';
        url?: string;
        id?: string;
        reason?: string;
      }
    >
  >;
  syncedTargets: Array<'notion' | 'feishu'>;
}

export interface KnowledgeOutlineResponse {
  userId: string;
  videoId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  assetId?: string | null;
  outlineMarkdown: string;
  notesMarkdown?: string;
}

export interface FlashcardItem {
  id: string;
  title?: string | null;
  front: string;
  back: string;
  chapter?: string | null;
  difficulty: number;
  createdAt: string;
}

export interface KnowledgeFlashcardsResponse {
  userId: string;
  videoId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  assetId?: string | null;
  items: FlashcardItem[];
  count: number;
  flashcards?: FlashcardItem[];
}

export type KnowledgeBoardState =
  | 'idle'
  | 'analyzing'
  | 'streaming'
  | 'ready'
  | 'syncing'
  | 'synced'
  | 'failed';

export type KnowledgeTimelineItemType =
  | 'KEYFRAME_CARD'
  | 'OUTLINE_BLOCK'
  | 'QA_CARD'
  | 'FLASHCARD'
  | 'REVIEW_PLAN';

export interface KnowledgeTimelineItem {
  id: string;
  type: KnowledgeTimelineItemType;
  videoId: string;
  assetId?: string | null;
  timestampSec?: number;
  title: string;
  summary?: string;
  content?: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface KnowledgeBoardSnapshotResponse {
  videoId: string;
  projectId: string;
  state: KnowledgeBoardState;
  timeline: KnowledgeTimelineItem[];
  stats: {
    transcriptSegments: number;
    keyframes: number;
    flashcards: number;
    qaCards: number;
    outlineBlocks: number;
    frameInsights?: number;
    deepAnalysisVersion?: number | null;
  };
  updatedAt: string;
}

export interface KnowledgeDeepAnalysisResponse {
  userId: string;
  videoId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  deepAnalysis: null | {
    id: string;
    version: number;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    summary?: string | null;
    chapterGraphJson?: unknown;
    conceptGraphJson?: unknown;
    ambiguitiesJson?: unknown;
    backgroundFactsJson?: unknown;
    learningRecommendationsJson?: unknown;
    updatedAt: string;
    createdAt: string;
  };
}

export const knowledgeApi = {
  analyze: (videoId: string, payload: AnalyzeKnowledgePayload = {}) =>
    apiFetch(`/api/prism/knowledge/videos/${videoId}/analyze`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  analyzeBatch: (payload: BatchAnalyzeKnowledgePayload) =>
    apiFetch<{
      taskId: string;
      status: 'completed' | 'partial';
      total: number;
      completed: number;
      failed: number;
      durationMs: number;
      results: Array<{
        videoId: string;
        status: 'completed' | 'failed';
        error?: string;
      }>;
    }>('/api/prism/knowledge/videos/analyze-batch', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getTranscript: (videoId: string) =>
    apiFetch(`/api/prism/knowledge/videos/${videoId}/transcript`),

  getBoardSnapshot: (videoId: string) =>
    apiFetch<KnowledgeBoardSnapshotResponse>(
      `/api/prism/knowledge/videos/${videoId}/board`,
    ),

  getDeepAnalysis: (videoId: string) =>
    apiFetch<KnowledgeDeepAnalysisResponse>(
      `/api/prism/knowledge/videos/${videoId}/deep-analysis`,
    ),

  regenerateDeepAnalysis: (
    videoId: string,
    payload: { includeBackground?: boolean } = {},
  ) =>
    apiFetch<{
      taskId: string;
      status: 'completed';
      deepAnalysis: KnowledgeDeepAnalysisResponse['deepAnalysis'];
    }>(`/api/prism/knowledge/videos/${videoId}/deep-analysis/regenerate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getBackgroundFacts: (videoId: string) =>
    apiFetch<{
      userId: string;
      videoId: string;
      status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
      deepAnalysisId: string | null;
      items: Array<Record<string, unknown>>;
      ambiguities: Array<Record<string, unknown>>;
      updatedAt: string | null;
    }>(`/api/prism/knowledge/videos/${videoId}/background-facts`),

  getOutline: (videoId: string) =>
    apiFetch<KnowledgeOutlineResponse>(`/api/prism/knowledge/videos/${videoId}/outline`),

  regenerateOutline: (videoId: string) =>
    apiFetch<{
      taskId: string;
      status: 'completed';
      outlineMarkdown: string;
      assetId: string;
    }>(`/api/prism/knowledge/videos/${videoId}/outline/regenerate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getFlashcards: (videoId: string) =>
    apiFetch<KnowledgeFlashcardsResponse>(`/api/prism/knowledge/videos/${videoId}/flashcards`),

  regenerateFlashcards: (videoId: string, payload: { maxCards?: number } = {}) =>
    apiFetch<{
      taskId: string;
      status: 'completed';
      count: number;
      items: any[];
    }>(`/api/prism/knowledge/videos/${videoId}/flashcards/regenerate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  settle: (videoId: string, payload: SettleKnowledgePayload = {}) =>
    apiFetch<KnowledgeSettlementResponse>(
      `/api/prism/knowledge/videos/${videoId}/settle`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  export: (videoId: string, payload: ExportKnowledgePayload = {}) =>
    apiFetch<KnowledgeSettlementResponse>(`/api/prism/knowledge/videos/${videoId}/export`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /**
   * 生成思维导图
   */
  generateMindmap: (
    videoId: string,
    payload: GenerateMindmapDto = {},
  ) =>
    apiFetch<{ taskId: string; result: MindmapResult }>(
      `/api/prism/knowledge/videos/${videoId}/mindmap`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  /**
   * 获取思维导图
   */
  getMindmap: (videoId: string) =>
    apiFetch<{ mindmap: MindmapResult | null }>(
      `/api/prism/knowledge/videos/${videoId}/mindmap`,
    ),

  /**
   * 导出思维导图
   */
  exportMindmap: (videoId: string, format: MindmapExportFormat) =>
    apiFetch<{ content: string; exportedAt: string }>(
      `/api/prism/knowledge/videos/${videoId}/mindmap/export?format=${format}`,
    ),

  /**
   * 获取晶体卡片列表
   */
  getCrystalCards: (videoId: string, type?: string) =>
    apiFetch<CrystalCardCollection>(
      `/api/prism/knowledge/videos/${videoId}/crystal-cards${type ? `?type=${type}` : ''}`,
    ),

  /**
   * 获取精选晶体卡片
   */
  getFeaturedCrystalCards: (videoId: string) =>
    apiFetch<FeaturedCrystalCards>(
      `/api/prism/knowledge/videos/${videoId}/crystal-cards/featured`,
    ),

  /**
   * 获取单个晶体卡片
   */
  getCrystalCard: (cardId: string) =>
    apiFetch<{ userId: string; card: any }>(
      `/api/prism/knowledge/crystal-cards/${cardId}`,
    ),

  /**
   * 更新晶体卡片
   */
  updateCrystalCard: (cardId: string, updates: CrystalCardUpdate) =>
    apiFetch<{ userId: string; card: any }>(
      `/api/prism/knowledge/crystal-cards/${cardId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      },
    ),

  /**
   * 删除晶体卡片
   */
  deleteCrystalCard: (cardId: string) =>
    apiFetch<{ userId: string; success: boolean; cardId: string }>(
      `/api/prism/knowledge/crystal-cards/${cardId}`,
      {
        method: 'DELETE',
      },
    ),

  /**
   * 重新生成晶体卡片
   */
  regenerateCrystalCards: (
    videoId: string,
    options: CrystalCardGenerationOptions = {},
  ) =>
    apiFetch<CrystalCardRegenerateResponse>(
      `/api/prism/knowledge/videos/${videoId}/crystal-cards/regenerate`,
      {
        method: 'POST',
        body: JSON.stringify(options),
      },
    ),
};
