import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum VideoSourceType {
  LOCAL_UPLOAD = 'LOCAL_UPLOAD',
  URL_IMPORT = 'URL_IMPORT',
  YOUTUBE = 'YOUTUBE',
  BILIBILI = 'BILIBILI',
}

export class UploadVideoDto {
  @ApiProperty({ description: 'Video file (for LOCAL_UPLOAD)' })
  file?: Express.Multer.File;

  @ApiProperty({ description: 'Video title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Source type', enum: VideoSourceType })
  @IsEnum(VideoSourceType)
  sourceType: VideoSourceType;

  @ApiPropertyOptional({ description: 'Source URL (for URL_IMPORT, YOUTUBE, BILIBILI)' })
  @IsOptional()
  @IsUrl()
  sourceUrl?: string;
}

export class ImportVideoDto {
  @ApiProperty({ description: 'Video title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Source type', enum: VideoSourceType })
  @IsEnum(VideoSourceType)
  sourceType: VideoSourceType;

  @ApiProperty({ description: 'Source URL' })
  @IsUrl()
  sourceUrl: string;
}

export class UpdateVideoDto {
  @ApiPropertyOptional({ description: 'Video title' })
  @IsOptional()
  @IsString()
  title?: string;
}

export class VideoResponseDto {
  @ApiProperty({ description: 'Video ID' })
  id: string;

  @ApiProperty({ description: 'Project ID' })
  projectId: string;

  @ApiProperty({ description: 'Video title' })
  title: string;

  @ApiProperty({ description: 'Source type', enum: VideoSourceType })
  sourceType: VideoSourceType;

  @ApiPropertyOptional({ description: 'Source URL' })
  sourceUrl?: string;

  @ApiProperty({ description: 'Storage path in MinIO' })
  storagePath: string;

  @ApiProperty({ description: 'Video URL (presigned or public)' })
  videoUrl: string;

  @ApiPropertyOptional({ description: 'Duration in seconds' })
  duration?: number;

  @ApiPropertyOptional({ description: 'Resolution (e.g., 1920x1080)' })
  resolution?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  fileSize?: number;

  @ApiPropertyOptional({ description: 'Thumbnail URL' })
  thumbnailUrl?: string;

  @ApiProperty({ description: 'Transcript status' })
  transcriptStatus: string;

  @ApiProperty({ description: 'Keyframe status' })
  keyframeStatus: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}
