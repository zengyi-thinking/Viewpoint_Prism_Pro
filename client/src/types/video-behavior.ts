// Video Event Types
export enum VideoEventType {
  PLAY = 'PLAY',
  PAUSE = 'PAUSE',
  SEEK = 'SEEK',
  SPEED_CHANGE = 'SPEED_CHANGE',
  VOLUME_CHANGE = 'VOLUME_CHANGE',
  FULLSCREEN = 'FULLSCREEN',
  PICTURE_IN_PICTURE = 'PICTURE_IN_PICTURE',
  END = 'END',
  BUFFER = 'BUFFER',
  ERROR = 'ERROR',
  CHAPTER_CHANGE = 'CHAPTER_CHANGE',
  BOOKMARK_ADD = 'BOOKMARK_ADD',
  BOOKMARK_REMOVE = 'BOOKMARK_REMOVE',
  NOTE_ADD = 'NOTE_ADD',
  HIGHLIGHT_ADD = 'HIGHLIGHT_ADD',
  REGION_REPEAT = 'REGION_REPEAT',
  REGION_SHARE = 'REGION_SHARE',
}

export enum VideoActionContext {
  NORMAL = 'NORMAL',
  KNOWLEDGE_PRISM = 'KNOWLEDGE_PRISM',
  CREATION_PRISM = 'CREATION_PRISM',
  TRANSLATION_PRISM = 'TRANSLATION_PRISM',
  DIFFRACTION_PRISM = 'DIFFRACTION_PRISM',
}

// Event Tracking
export interface TrackEventDto {
  videoId: string;
  eventType: VideoEventType;
  context?: VideoActionContext;
  sessionId?: string;
  previousTime?: number;
  currentTime: number;
  playbackRate?: number;
  volume?: number;
  metadata?: Record<string, unknown>;
  deviceId?: string;
  userAgent?: string;
}

// Session
export interface VideoSession {
  id: string;
  sessionId: string;
  videoId: string;
  startTime: string;
  endTime?: string;
  totalWatchTime: number;
  activeWatchTime: number;
  pauseCount: number;
  seekCount: number;
  bufferCount: number;
  watchedSegments: [number, number][];
  coveragePercent: number;
  isCompleted: boolean;
  completionTime?: string;
  context: VideoActionContext;
  createdAt: string;
  updatedAt: string;
}

// Bookmark
export interface VideoBookmark {
  id: string;
  videoId: string;
  timestamp: number;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  color: string;
  tags: string[];
  context: VideoActionContext;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookmarkDto {
  videoId: string;
  timestamp: number;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  color?: string;
  tags?: string[];
  context?: VideoActionContext;
}

export interface UpdateBookmarkDto {
  timestamp?: number;
  title?: string;
  description?: string;
  color?: string;
  tags?: string[];
}

// Note
export interface VideoNote {
  id: string;
  videoId: string;
  timestamp: number;
  content: string;
  timeRange?: [number, number];
  isMarkdown: boolean;
  tags: string[];
  color: string;
  linkedKnowledgeAssetId?: string;
  linkedFlashcardId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteDto {
  videoId: string;
  timestamp: number;
  content: string;
  timeRange?: [number, number];
  isMarkdown?: boolean;
  tags?: string[];
  color?: string;
  linkedKnowledgeAssetId?: string;
  linkedFlashcardId?: string;
}

export interface UpdateNoteDto {
  timestamp?: number;
  content?: string;
  timeRange?: [number, number];
  tags?: string[];
  color?: string;
}

// Highlight
export interface VideoHighlight {
  id: string;
  videoId: string;
  startTime: number;
  endTime: number;
  title: string;
  description?: string;
  color: string;
  label?: string;
  highlightType: string;
  isShared: boolean;
  shareToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHighlightDto {
  videoId: string;
  startTime: number;
  endTime: number;
  title: string;
  description?: string;
  color?: string;
  label?: string;
  highlightType?: string;
}

export interface UpdateHighlightDto {
  startTime?: number;
  endTime?: number;
  title?: string;
  description?: string;
  color?: string;
  label?: string;
}

// Analytics
export interface VideoAnalytics {
  videoId: string;
  totalSessions: number;
  totalWatchTime: number;
  averageWatchTime: number;
  completionRate: number;
  averageCoverage: number;
  totalBookmarks: number;
  totalNotes: number;
  totalHighlights: number;
  engagementEvents: {
    play: number;
    pause: number;
    seek: number;
    speedChange: number;
  };
  lastWatchedAt?: string;
}

// Progress
export interface UserVideoProgress {
  videoId: string;
  lastPosition: number;
  totalWatchTime: number;
  coveragePercent: number;
  isCompleted: boolean;
  lastWatchedAt: string;
  bookmarks: VideoBookmark[];
  notes: VideoNote[];
  highlights: VideoHighlight[];
}

// WebSocket Events
export interface VideoEventPayload {
  videoId: string;
  userId: string;
  eventType: string;
  currentTime: number;
  sessionId?: string;
  context?: string;
  timestamp: string;
}

export interface VideoBookmarkPayload {
  videoId: string;
  userId: string;
  bookmarkId: string;
  action: 'created' | 'updated' | 'deleted';
  timestamp: string;
}

export interface VideoNotePayload {
  videoId: string;
  userId: string;
  noteId: string;
  action: 'created' | 'updated' | 'deleted';
  timestamp: string;
}

export interface VideoHighlightPayload {
  videoId: string;
  userId: string;
  highlightId: string;
  action: 'created' | 'updated' | 'deleted' | 'shared';
  timestamp: string;
}

export interface VideoSessionUpdatePayload {
  videoId: string;
  sessionId: string;
  userId: string;
  isActive: boolean;
  currentTime?: number;
  timestamp: string;
}

// Tracking State
export interface VideoTrackingState {
  sessionId: string | null;
  isPlaying: boolean;
  currentTime: number;
  previousTime: number;
  playbackRate: number;
  volume: number;
  context: VideoActionContext;
  lastEventTime: number;
}
