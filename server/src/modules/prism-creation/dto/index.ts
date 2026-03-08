import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export enum RenderQuality {
  DRAFT = 'draft',
  HIGH = 'high',
}

export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export class ScriptSplitSegmentDto {
  @IsString()
  segment: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedDuration?: number;
}

export class ScriptSplitDto {
  @IsOptional()
  @IsString()
  scriptText?: string;

  @IsOptional()
  @IsObject()
  stylePreset?: {
    cameraMovements?: string[];
    pacePattern?: number[];
    colorGrading?: Record<string, any>;
    transitionStyle?: string;
  };

  @IsOptional()
  @IsString()
  adjustInstruction?: string;

  @IsOptional()
  @IsBoolean()
  persist?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScriptSplitSegmentDto)
  segments?: ScriptSplitSegmentDto[];
}

export class CreateFlowNodeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderIndex: number;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  scriptSegment?: string;

  @IsOptional()
  @IsString()
  parentNodeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  positionX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  positionY?: number;
}

export class UpdateFlowNodeDto {
  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  scriptSegment?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  positionX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  positionY?: number;

  @IsOptional()
  @IsString()
  firstFrameUrl?: string;

  @IsOptional()
  @IsString()
  lastFrameUrl?: string;

  @IsOptional()
  @IsBoolean()
  firstFrameLocked?: boolean;

  @IsOptional()
  @IsBoolean()
  lastFrameLocked?: boolean;

  @IsOptional()
  @IsString()
  renderedVideoUrl?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  renderStatus?: TaskStatus;

  @IsOptional()
  @IsString()
  narrationUrl?: string;

  @IsOptional()
  @IsString()
  bgmUrl?: string;
}

export class CreateBranchDto {
  @IsString()
  sourceNodeId: string;

  @IsString()
  branchName: string;

  @IsOptional()
  @IsString()
  promptOverride?: string;
}

export class RenderFlowDto {
  @IsString()
  nodeId: string;

  @IsOptional()
  @IsEnum(RenderQuality)
  quality?: RenderQuality = RenderQuality.DRAFT;

  @IsOptional()
  @IsString()
  stylePresetId?: string;
}

export enum FrameType {
  FIRST = 'first',
  LAST = 'last',
}

export class GenerateFrameDto {
  @IsEnum(FrameType)
  frameType: FrameType;

  @IsOptional()
  @IsString()
  prompt?: string;
}

export class RefineCopyDto {
  @IsString()
  requirement: string;
}

export class GenerateNextNodeDto {
  @IsOptional()
  @IsString()
  currentNodeId?: string;

  @IsString()
  idea: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  scriptSegment?: string;

  @IsOptional()
  @IsString()
  videoPrompt?: string;

  @IsOptional()
  @IsString()
  sceneFramePrompt?: string;

  @IsOptional()
  @IsString()
  firstFramePrompt?: string;

  @IsOptional()
  @IsString()
  lastFramePrompt?: string;
}

export class GenerateIdeaPreviewDto {
  @IsString()
  idea: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  count?: number;

  @IsOptional()
  @IsString()
  tone?: string;
}

export class GenerateNodeCandidatesDto {
  @IsString()
  currentNodeId: string;

  @IsString()
  idea: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  count?: number = 3;

  @IsOptional()
  @IsString()
  branchName?: string;
}

export class LockFrameDto {
  @IsEnum(FrameType)
  frameType: FrameType;

  @IsBoolean()
  locked: boolean;
}

export class StitchFlowDto {
  @IsOptional()
  @IsBoolean()
  includeNarration?: boolean;

  @IsOptional()
  @IsBoolean()
  includeBgm?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bgmVolume?: number; // 0-100
}

export class StitchExportDto {
  @IsOptional()
  @IsBoolean()
  includeNarration?: boolean;

  @IsOptional()
  @IsBoolean()
  includeBgm?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bgmVolume?: number; // 0-100
}

export class ExportProjectDto {
  @IsOptional()
  @IsString()
  format?: string; // 'mp4', 'webm', 'json'
}

export class RenderNodeDto {
  @IsOptional()
  @IsEnum(RenderQuality)
  quality?: RenderQuality = RenderQuality.DRAFT;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  videoPrompt?: string;

  @IsOptional()
  @IsString()
  sceneFramePrompt?: string;

  @IsOptional()
  @IsString()
  firstFramePrompt?: string;

  @IsOptional()
  @IsString()
  lastFramePrompt?: string;
}
