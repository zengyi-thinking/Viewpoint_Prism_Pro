export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  prismAction?: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  activePrism?: string;
  videoId?: string;
}
