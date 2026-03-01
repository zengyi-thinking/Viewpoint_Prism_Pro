export type ChatPrismType =
  | 'knowledge'
  | 'creation'
  | 'translation'
  | 'diffraction';

export type PrismActionType =
  | 'none'
  | 'inject_qa_card'
  | 'update_node_prompt'
  | 'refine_translation_segment'
  | 'regenerate_platform_draft'
  | 'generate_summary'
  | 'generate_mindmap';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown> | null;
  prismAction?: PrismActionType | null;
  prismPayload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  projectId: string;
  userId: string;
  activePrism?: ChatPrismType | null;
  videoId?: string | null;
  createdAt: string;
  updatedAt: string;
}
