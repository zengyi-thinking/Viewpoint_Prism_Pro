/**
 * 思维导图节点结构
 */
export interface MindmapNode {
  id: string;
  content: string;
  level: number;
  children?: MindmapNode[];
  metadata?: {
    timestamp?: number;
    keyframeUrl?: string;
    transcriptSegment?: string;
  };
}

/**
 * 思维导图生成结果
 */
export interface MindmapResult {
  json: MindmapNode;
  markdown: string;
  mermaid: string;
  nodeCount: number;
}

/**
 * 思维导图生成请求参数
 */
export interface GenerateMindmapDto {
  sessionId?: string;
  prompt?: string;
  maxDepth?: number;
  maxNodes?: number;
}

/**
 * 思维导图导出格式
 */
export type MindmapExportFormat = 'json' | 'markdown' | 'mermaid' | 'xmind' | 'freemind';

/**
 * 思维导图 API 响应
 */
export interface MindmapApiResponse {
  taskId: string;
  userId: string;
  videoId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: {
    nodeCount: number;
    json: MindmapNode;
    markdown: string;
    mermaid: string;
  };
}

/**
 * 获取思维导图 API 响应
 */
export interface GetMindmapApiResponse {
  userId: string;
  videoId: string;
  status: 'PENDING' | 'COMPLETED';
  mindmap: MindmapResult | null;
}

/**
 * 导出思维导图 API 响应
 */
export interface ExportMindmapApiResponse {
  videoId: string;
  format: MindmapExportFormat;
  content: string;
  exportedAt: string;
}
