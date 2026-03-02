import { IsEnum, IsNumber, IsOptional, IsString, IsBoolean, IsArray, Min, Max } from 'class-validator';

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

// Track Event DTO
export class TrackEventDto {
  @IsString()
  videoId: string;

  @IsEnum(VideoEventType)
  eventType: VideoEventType;

  @IsOptional()
  @IsEnum(VideoActionContext)
  context?: VideoActionContext;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  previousTime?: number;

  @IsNumber()
  @Min(0)
  currentTime: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(16)
  playbackRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  volume?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

// Create Bookmark DTO
export class CreateBookmarkDto {
  @IsString()
  videoId: string;

  @IsNumber()
  @Min(0)
  timestamp: number;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(VideoActionContext)
  context?: VideoActionContext;
}

// Update Bookmark DTO
export class UpdateBookmarkDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  timestamp?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

// Create Note DTO
export class CreateNoteDto {
  @IsString()
  videoId: string;

  @IsNumber()
  @Min(0)
  timestamp: number;

  @IsString()
  content: string;

  @IsOptional()
  timeRange?: [number, number];

  @IsOptional()
  @IsBoolean()
  isMarkdown?: boolean;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  linkedKnowledgeAssetId?: string;

  @IsOptional()
  @IsString()
  linkedFlashcardId?: string;
}

// Update Note DTO
export class UpdateNoteDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  timestamp?: number;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  timeRange?: [number, number];

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  color?: string;
}

// Create Highlight DTO
export class CreateHighlightDto {
  @IsString()
  videoId: string;

  @IsNumber()
  @Min(0)
  startTime: number;

  @IsNumber()
  @Min(0)
  endTime: number;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  highlightType?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

// Update Highlight DTO
export class UpdateHighlightDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  startTime?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  endTime?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  label?: string;
}

// Session Response DTO
export class VideoSessionResponseDto {
  id: string;
  sessionId: string;
  videoId: string;
  startTime: Date;
  endTime?: Date;
  totalWatchTime: number;
  activeWatchTime: number;
  pauseCount: number;
  seekCount: number;
  bufferCount: number;
  watchedSegments: Array<[number, number]>;
  coveragePercent: number;
  isCompleted: boolean;
  completionTime?: Date;
  context: string;
  createdAt: Date;
  updatedAt: Date;
}

// Bookmark Response DTO
export class VideoBookmarkResponseDto {
  id: string;
  videoId: string;
  timestamp: number;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  color: string;
  tags: string[];
  context: string;
  createdAt: Date;
  updatedAt: Date;
}

// Note Response DTO
export class VideoNoteResponseDto {
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
  createdAt: Date;
  updatedAt: Date;
}

// Highlight Response DTO
export class VideoHighlightResponseDto {
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
  createdAt: Date;
  updatedAt: Date;
}

// Video Analytics Response DTO
export class VideoAnalyticsResponseDto {
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
  lastWatchedAt?: Date;
}

// User Video Progress Response DTO
export class UserVideoProgressResponseDto {
  videoId: string;
  lastPosition: number;
  totalWatchTime: number;
  coveragePercent: number;
  isCompleted: boolean;
  lastWatchedAt: Date;
  bookmarks: VideoBookmarkResponseDto[];
  notes: VideoNoteResponseDto[];
  highlights: VideoHighlightResponseDto[];
}

// Bulk Track Events DTO
export class BulkTrackEventsDto {
  @IsArray()
  events: TrackEventDto[];
}
