import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

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
}

export class LipSyncDto {
  @IsString()
  language: string;
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
