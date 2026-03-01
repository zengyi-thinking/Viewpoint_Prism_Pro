import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  HttpStatus,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VideoService } from './video.service';
import {
  ImportVideoDto,
  UpdateVideoDto,
  VideoResponseDto,
  VideoSourceType,
} from './dto';

@Controller('api/videos')
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  /**
   * Upload a video file
   * POST /api/videos/upload?projectId=xxx
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadVideo(
    @Query('projectId') projectId: string,
    @CurrentUser() userId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(mp4|webm|ogg|mov|avi|mkv|flv|wmv)$/i,
        })
        .addMaxSizeValidator({
          maxSize: 1024 * 1024 * 1024 * 2, // 2GB
          message: 'File size exceeds 2GB limit',
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
  ) {
    const title = file.originalname.replace(/\.[^/.]+$/, ''); // Remove extension
    const video = await this.videoService.create(
      projectId,
      userId,
      title,
      VideoSourceType.LOCAL_UPLOAD,
    );

    const updated = await this.videoService.uploadFile(
      video.id,
      userId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    return this.toResponseDto(updated);
  }

  /**
   * Import video from URL
   * POST /api/videos/import?projectId=xxx
   */
  @Post('import')
  async importVideo(
    @Query('projectId') projectId: string,
    @CurrentUser() userId: string,
    @Body() dto: ImportVideoDto,
  ) {
    const video = await this.videoService.importFromUrl(
      projectId,
      userId,
      dto.title,
      dto.sourceType,
      dto.sourceUrl,
    );

    return this.toResponseDto(video);
  }

  /**
   * List all videos for a project
   * GET /api/videos?projectId=xxx
   */
  @Get()
  async listVideos(
    @Query('projectId') projectId: string,
    @CurrentUser() userId: string,
  ) {
    const videos = await this.videoService.listByProject(projectId, userId);
    return videos.map((v) => this.toResponseDto(v));
  }

  /**
   * Get a single video
   * GET /api/videos/:id
   */
  @Get(':id')
  async getVideo(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ) {
    const video = await this.videoService.getById(id, userId);
    return this.toResponseDto(video);
  }

  /**
   * Update video title
   * PATCH /api/videos/:id
   */
  @Patch(':id')
  async updateVideo(
    @Param('id') id: string,
    @CurrentUser() userId: string,
    @Body() dto: UpdateVideoDto,
  ) {
    if (!dto.title) {
      throw new Error('Title is required');
    }
    const video = await this.videoService.update(id, userId, dto.title);
    return this.toResponseDto(video);
  }

  /**
   * Delete a video
   * DELETE /api/videos/:id
   */
  @Delete(':id')
  async deleteVideo(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ) {
    await this.videoService.delete(id, userId);
    return { success: true, message: 'Video deleted successfully' };
  }

  /**
   * Get signed URL for video playback
   * GET /api/videos/:id/play
   */
  @Get(':id/play')
  async getPlayUrl(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ) {
    const url = await this.videoService.getSignedUrl(id, userId);
    return { url };
  }

  /**
   * Stream video file (proxy for frontend video player)
   * GET /api/videos/:id/stream
   */
  @Get(':id/stream')
  async streamVideo(
    @Param('id') id: string,
    @CurrentUser() userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, filename, contentType } = await this.videoService.getVideoStream(id, userId);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Accept-Ranges': 'bytes',
    });

    // Convert ReadableStream to Readable for StreamableFile
    const { Readable } = require('stream');
    const readableStream = new Readable().wrap(stream);
    return new StreamableFile(readableStream);
  }

  /**
   * Regenerate video thumbnail
   * POST /api/videos/:id/thumbnail/regenerate
   */
  @Post(':id/thumbnail/regenerate')
  async regenerateThumbnail(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ) {
    const video = await this.videoService.regenerateThumbnail(id, userId);
    return this.toResponseDto(video);
  }

  /**
   * Convert Prisma model to response DTO
   */
  private toResponseDto(video: any): VideoResponseDto {
    const metadata = video.metadata as Record<string, unknown> | null;

    // For all videos, use the videoUrl from metadata if available
    // This contains the actual MinIO public URL or source URL
    const videoUrl = (metadata?.videoUrl as string) || video.sourceUrl || '';

    return {
      id: video.id,
      projectId: video.projectId,
      title: video.title,
      sourceType: video.sourceType as VideoSourceType,
      sourceUrl: video.sourceUrl,
      storagePath: video.storagePath,
      videoUrl,
      duration: video.duration,
      resolution: video.resolution,
      fileSize: video.fileSize ? Number(video.fileSize) : undefined,
      thumbnailUrl: video.thumbnailUrl,
      transcriptStatus: video.transcriptStatus,
      keyframeStatus: video.keyframeStatus,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    };
  }
}
