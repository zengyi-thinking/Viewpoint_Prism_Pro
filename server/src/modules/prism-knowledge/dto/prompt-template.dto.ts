import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsBoolean } from 'class-validator';

// 定义 Prompt 资产类型
export enum PromptAssetType {
  CRYSTAL_CARD = 'crystal_card',
  MINDMAP = 'mindmap',
  OUTLINE = 'outline',
  FLASHCARD = 'flashcard',
}

/**
 * 创建 Prompt Template DTO
 */
export class CreatePromptTemplateDto {
  @IsString()
  userId: string;

  @IsEnum(PromptAssetType)
  assetType: PromptAssetType;

  @IsString()
  @IsOptional()
  cardType?: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  template: string;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsNumber()
  @IsOptional()
  difficulty?: number;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

/**
 * 更新 Prompt Template DTO
 */
export class UpdatePromptTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsNumber()
  @IsOptional()
  difficulty?: number;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}

/**
 * 获取 Prompt Templates 查询 DTO
 */
export class GetPromptTemplatesQueryDto {
  @IsOptional()
  @IsEnum(PromptAssetType)
  assetType?: PromptAssetType;

  @IsOptional()
  @IsString()
  cardType?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsBoolean()
  @IsOptional()
  includePublic?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  sortBy?: 'name' | 'rating' | 'useCount' | 'createdAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @IsNumber()
  @IsOptional()
  page?: number;

  @IsNumber()
  @IsOptional()
  limit?: number;
}
