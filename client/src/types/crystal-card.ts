/**
 * 晶体卡片类型定义
 */

export enum CrystalCardType {
  CONCEPT = 'CONCEPT',
  TIMELINE = 'TIMELINE',
  COMPARISON = 'COMPARISON',
  INSIGHT = 'INSIGHT',
  QUOTE = 'QUOTE',
  KEYFRAME = 'KEYFRAME',
  QA = 'QA',
  SUMMARY = 'SUMMARY',
}

export interface CrystalCard {
  id: string;
  assetId: string;
  type: CrystalCardType;
  title: string;
  content: string;
  summary?: string;
  timestamp?: number;
  videoTime?: string;
  imageUrl?: string;
  keyframeId?: string;
  sourceText?: string;
  sourceType?: string;
  tags: string[];
  difficulty: number;
  importance: number;
  aiModel?: string;
  aiPrompt?: string;
  isFeatured: boolean;
  isVerified: boolean;
  orderIndex: number;
  category?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CrystalCardCollection {
  assetId: string;
  cards: CrystalCard[];
  count: number;
  byType: Record<string, CrystalCard[]>;
}

export interface FeaturedCrystalCards {
  userId: string;
  videoId: string;
  cards: CrystalCard[];
  count: number;
}

export interface CrystalCardUpdate {
  title?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  importance?: number;
  isFeatured?: boolean;
  isVerified?: boolean;
  category?: string;
}

export interface CrystalCardGenerationOptions {
  types?: CrystalCardType[];
  maxCards?: number;
  includeKeyframes?: boolean;
  difficulty?: number;
}

export interface CrystalCardRegenerateResponse {
  taskId: string;
  userId: string;
  videoId: string;
  status: string;
  result: {
    assetId: string;
    totalCards: number;
    cards: CrystalCard[];
  };
}
