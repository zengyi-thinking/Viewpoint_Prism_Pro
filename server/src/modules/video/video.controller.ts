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
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VideoService } from './video.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  ImportVideoDto,
  UpdateVideoDto,
  VideoResponseDto,
  VideoSourceType,
} from './dto';
import {
  decodeMojibakeUtf8,
  stripFileExtension,
} from './video-filename.util';

@Controller('api/videos')
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(
    private readonly videoService: VideoService,
    private readonly storageService: StorageService,
  ) {}

  private parseSingleRange(rangeHeader: string | undefined, totalSize: number) {
    if (!rangeHeader) return null;

    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match) return 'invalid' as const;

    const [, rawStart, rawEnd] = match;
    let start: number;
    let end: number;

    if (!rawStart && !rawEnd) {
      return 'invalid' as const;
    }

    if (!rawStart) {
      const suffixLength = Number(rawEnd);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        return 'invalid' as const;
      }
      start = Math.max(0, totalSize - suffixLength);
      end = totalSize - 1;
    } else {
      start = Number(rawStart);
      end = rawEnd ? Number(rawEnd) : totalSize - 1;
    }

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start >= totalSize
    ) {
      return 'invalid' as const;
    }

    end = Math.min(end, totalSize - 1);

    return {
      start,
      end,
      length: end - start + 1,
    };
  }

  private isSupportedVideoFile(file: Express.Multer.File): boolean {
    const filename = (file.originalname || '').toLowerCase();
    const mimeType = (file.mimetype || '').toLowerCase();

    const allowedExtensions = [
      '.mp4',
      '.webm',
      '.ogg',
      '.mov',
      '.avi',
      '.mkv',
      '.flv',
      '.wmv',
    ];

    const allowedMimeTypes = [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-matroska',
      'video/x-flv',
      'video/x-ms-wmv',
      'application/octet-stream',
    ];

    return (
      allowedExtensions.some((ext) => filename.endsWith(ext)) ||
      allowedMimeTypes.includes(mimeType)
    );
  }

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
    if (!this.isSupportedVideoFile(file)) {
      throw new BadRequestException('Unsupported video file type');
    }

    const normalizedOriginalName = decodeMojibakeUtf8(file.originalname);
    const title = stripFileExtension(normalizedOriginalName) || `video-${Date.now()}`;
    const video = await this.videoService.create(
      projectId,
      userId,
      title,
      VideoSourceType.LOCAL_UPLOAD,
      undefined,
      normalizedOriginalName,
    );

    const updated = await this.videoService.uploadFile(
      video.id,
      userId,
      file.buffer,
      normalizedOriginalName,
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
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { stream, filename, contentType, contentLength, storagePath } =
      await this.videoService.getVideoStream(id, userId);
    const range = this.parseSingleRange(req.headers.range, contentLength);

    if (range === 'invalid') {
      res.status(416);
      res.set('Content-Range', `bytes */${contentLength}`);
      res.end();
      return;
    }

    const outputStream =
      range && contentLength > 0
        ? await this.storageService.downloadStreamRange(storagePath, range.start, range.length)
        : stream;

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Accept-Ranges': 'bytes',
      ...(contentLength > 0
        ? { 'Content-Length': String(range ? range.length : contentLength) }
        : {}),
      ...(range
        ? { 'Content-Range': `bytes ${range.start}-${range.end}/${contentLength}` }
        : {}),
    });
    if (range) {
      res.status(206);
    }

    (outputStream as NodeJS.ReadableStream).pipe(res);
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
      title: decodeMojibakeUtf8(video.title),
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
