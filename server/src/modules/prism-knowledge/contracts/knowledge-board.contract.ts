export enum KnowledgeBoardState {
  IDLE = 'idle',
  ANALYZING = 'analyzing',
  STREAMING = 'streaming',
  READY = 'ready',
  SYNCING = 'syncing',
  SYNCED = 'synced',
  FAILED = 'failed',
}

export enum KnowledgeTimelineItemType {
  KEYFRAME_CARD = 'KEYFRAME_CARD',
  OUTLINE_BLOCK = 'OUTLINE_BLOCK',
  QA_CARD = 'QA_CARD',
  FLASHCARD = 'FLASHCARD',
  REVIEW_PLAN = 'REVIEW_PLAN',
}

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

export interface KnowledgeBoardSnapshot {
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
  };
  updatedAt: string;
}

interface DeriveStateInput {
  transcriptStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
  keyframeStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
  assetStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
  syncedTo?: string[] | null;
  hasTranscript?: boolean;
  hasKeyframes?: boolean;
  hasOutline?: boolean;
  hasFlashcards?: boolean;
  syncing?: boolean;
}

export function deriveKnowledgeBoardState(input: DeriveStateInput): KnowledgeBoardState {
  const {
    transcriptStatus,
    keyframeStatus,
    assetStatus,
    syncedTo,
    hasTranscript = false,
    hasKeyframes = false,
    hasOutline = false,
    hasFlashcards = false,
    syncing = false,
  } = input;

  if (
    transcriptStatus === 'FAILED' ||
    keyframeStatus === 'FAILED' ||
    assetStatus === 'FAILED'
  ) {
    return KnowledgeBoardState.FAILED;
  }

  if (syncing) {
    return KnowledgeBoardState.SYNCING;
  }

  const readyByStatus =
    transcriptStatus === 'COMPLETED' &&
    keyframeStatus === 'COMPLETED' &&
    (assetStatus === 'COMPLETED' || hasOutline);

  if (readyByStatus && (syncedTo?.length ?? 0) > 0) {
    return KnowledgeBoardState.SYNCED;
  }

  if (readyByStatus) {
    return KnowledgeBoardState.READY;
  }

  const isProcessing =
    transcriptStatus === 'PROCESSING' ||
    keyframeStatus === 'PROCESSING' ||
    assetStatus === 'PROCESSING';

  if (isProcessing && (hasTranscript || hasKeyframes || hasOutline || hasFlashcards)) {
    return KnowledgeBoardState.STREAMING;
  }

  if (isProcessing) {
    return KnowledgeBoardState.ANALYZING;
  }

  if (hasTranscript || hasKeyframes || hasOutline || hasFlashcards) {
    return KnowledgeBoardState.STREAMING;
  }

  return KnowledgeBoardState.IDLE;
}

export function parseTimestampToSeconds(value?: string | null): number | undefined {
  if (!value) return undefined;

  const hms = value.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (hms) {
    const a = Number(hms[1]);
    const b = Number(hms[2]);
    const c = hms[3] ? Number(hms[3]) : undefined;
    if (Number.isFinite(c)) return a * 3600 + b * 60 + (c ?? 0);
    return a * 60 + b;
  }

  const secMatch = value.match(/(\d+(?:\.\d+)?)\s*秒/);
  if (secMatch) {
    return Number(secMatch[1]);
  }

  return undefined;
}
