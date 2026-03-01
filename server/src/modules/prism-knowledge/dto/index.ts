import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

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

export class ExportKnowledgeDto {
  @IsOptional()
  @IsEnum(KnowledgeExportTarget)
  target?: KnowledgeExportTarget = KnowledgeExportTarget.MARKDOWN;
}
