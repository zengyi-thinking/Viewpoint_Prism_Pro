import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

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
