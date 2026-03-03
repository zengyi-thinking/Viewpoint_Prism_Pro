import { IsArray, IsEnum, IsOptional, IsString, IsNumber } from 'class-validator';

export enum DiffractionPlatform {
  XIAOHONGSHU = 'xiaohongshu',
  JIKE = 'jike',
  TWITTER_X = 'twitter_x',
  WECHAT_MP = 'wechat_mp',
  NEWSLETTER = 'newsletter',
  LINKEDIN = 'linkedin',
  INSTAGRAM = 'instagram',
}

export class GenerateDiffractionDto {
  @IsArray()
  @IsEnum(DiffractionPlatform, { each: true })
  platforms: DiffractionPlatform[];

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  audience?: string;
}

export class BatchExportDiffractionDto {
  @IsOptional()
  @IsArray()
  @IsEnum(DiffractionPlatform, { each: true })
  platforms?: DiffractionPlatform[];

  @IsOptional()
  @IsString()
  format?: 'zip' | 'json' = 'zip';
}

/**
 * 提取关键帧 DTO
 */
export class ExtractKeyFramesDto {
  @IsString()
  videoId: string;

  @IsOptional()
  @IsNumber()
  count?: number = 12;
}

/**
 * 生成文案 DTO
 */
export class GenerateCopywritingDto {
  @IsString()
  videoId: string;

  @IsEnum(DiffractionPlatform)
  platform: DiffractionPlatform;

  @IsArray()
  selectedFrames: Array<{
    imageUrl: string;
    timestamp?: number;
    description?: string;
  }>;

  @IsOptional()
  @IsString()
  styleHints?: string;

  @IsOptional()
  @IsString()
  previousDraftId?: string;
}

/**
 * 批量导出 DTO
 */
export class GenerateAssetsDto {
  @IsString()
  videoId: string;

  @IsArray()
  @IsEnum(DiffractionPlatform, { each: true })
  platforms: DiffractionPlatform[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  draftIds?: string[];
}
