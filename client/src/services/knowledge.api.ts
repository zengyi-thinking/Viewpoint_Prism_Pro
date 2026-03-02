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
}

export interface BatchAnalyzeKnowledgePayload extends AnalyzeKnowledgePayload {
  videoIds: string[];
}

export interface ExportKnowledgePayload {
  target?: 'markdown' | 'notion' | 'feishu';
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

  getOutline: (videoId: string) =>
    apiFetch(`/api/prism/knowledge/videos/${videoId}/outline`),

  getFlashcards: (videoId: string) =>
    apiFetch(`/api/prism/knowledge/videos/${videoId}/flashcards`),

  export: (videoId: string, payload: ExportKnowledgePayload = {}) =>
    apiFetch(`/api/prism/knowledge/videos/${videoId}/export`, {
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
