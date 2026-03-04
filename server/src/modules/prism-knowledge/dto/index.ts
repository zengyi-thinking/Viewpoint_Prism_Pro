import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
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

  @IsOptional()
  @IsArray()
  @IsIn(['notion', 'feishu'], { each: true })
  syncTargets?: Array<'notion' | 'feishu'>;

  @IsOptional()
  @IsBoolean()
  forceRegenerate?: boolean;
}

export class SettleKnowledgeDto {
  @IsOptional()
  @IsArray()
  @IsIn(['notion', 'feishu'], { each: true })
  syncTargets?: Array<'notion' | 'feishu'>;

  @IsOptional()
  @IsBoolean()
  forceRegenerate?: boolean;
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
  maxDepth?: number = 5;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  maxNodes?: number = 90;
}

export class RegenerateFlashcardsDto {
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(30)
  maxCards?: number = 12;
}

// Re-export prompt template DTOs
export * from './prompt-template.dto';
