import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum KnowledgeExportTarget {
  MARKDOWN = 'markdown',
  NOTION = 'notion',
  FEISHU = 'feishu',
}

export class AnalyzeKnowledgeDto {
  @IsOptional()
  @IsBoolean()
  regenerateTranscript?: boolean;

  @IsOptional()
  @IsBoolean()
  regenerateKeyframes?: boolean;
}

export class BatchAnalyzeKnowledgeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  videoIds: string[];

  @IsOptional()
  @IsBoolean()
  regenerateTranscript?: boolean;

  @IsOptional()
  @IsBoolean()
  regenerateKeyframes?: boolean;
}

export class ExportKnowledgeDto {
  @IsOptional()
  @IsEnum(KnowledgeExportTarget)
  target?: KnowledgeExportTarget = KnowledgeExportTarget.MARKDOWN;
}

export class GenerateMindmapDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(6)
  maxDepth?: number = 4;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(100)
  maxNodes?: number = 50;
}
