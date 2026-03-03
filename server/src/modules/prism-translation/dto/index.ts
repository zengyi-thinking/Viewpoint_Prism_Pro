import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export class CreateTranslationTaskDto {
  @IsOptional()
  @IsString()
  sourceLang?: string = 'auto';

  @IsArray()
  @IsString({ each: true })
  targetLangs: string[];
}

export class UpdateSubtitleSegmentsDto {
  @IsString()
  language: string;

  @IsArray()
  segments: Array<Record<string, unknown>>;
}

export class VoiceCloneDto {
  @IsString()
  language: string;

  @IsOptional()
  @IsString()
  voiceSampleUrl?: string;

  @IsOptional()
  @IsString()
  voiceName?: string;

  @IsOptional()
  @IsBoolean()
  enhanceQuality?: boolean;

  @IsOptional()
  @IsBoolean()
  saveModel?: boolean;
}

export class VoicePreviewDto {
  @IsString()
  voiceId: string;

  @IsOptional()
  @IsString()
  previewText?: string;
}

export class SetActiveVoiceDto {
  @IsString()
  voiceId: string;
}

export class DeleteVoiceProfileDto {
  @IsString()
  voiceProfileId: string;
}

export class LipSyncDto {
  @IsString()
  language: string;

  @IsString()
  dubbedAudioUrl: string;

  @IsOptional()
  enableLipSync?: boolean;

  @IsOptional()
  audioMixMode?: 'replace' | 'mix' | 'mute';
}

export class ExportTranslationDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsBoolean()
  burnSubtitles?: boolean = true;
}

export class InpaintingDto {
  @IsOptional()
  @IsString()
  videoPath?: string;

  @IsOptional()
  @IsNumber()
  frameInterval?: number = 1.0;

  @IsOptional()
  @IsBoolean()
  keyframesOnly?: boolean = false;

  @IsOptional()
  @IsString()
  detectionPrompt?: string;

  @IsOptional()
  @IsString()
  inpaintPrompt?: string;
}

