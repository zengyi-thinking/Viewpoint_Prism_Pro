import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { FfmpegService } from '../../infrastructure/media/ffmpeg.service';
import { VideoSourceType } from './dto';
import * as os from 'os';
import * as path from 'path';
import { decodeMojibakeUtf8, resolveVideoExtension } from './video-filename.util';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  /**
   * Create a new video source entry
   * @param projectId - Project ID
   * @param userId - User ID (for ownership check)
   * @param title - Video title
   * @param sourceType - Source type
   * @param sourceUrl - Optional source URL
   * @returns Created video source
   */
  async create(
    projectId: string,
    userId: string,
    title: string,
    sourceType: VideoSourceType,
    sourceUrl?: string,
    originalFilename?: string,
  ) {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // Generate storage path
    const safeTitle = decodeMojibakeUtf8(title) || `video-${Date.now()}`;
    const filenameForStorage =
      sourceType === VideoSourceType.LOCAL_UPLOAD
        ? decodeMojibakeUtf8(originalFilename || `${safeTitle}.mp4`)
        : `${safeTitle}.mp4`;

    const storagePath = this.storage.generateStoragePath(
      userId,
      projectId,
      'videos',
      filenameForStorage,
    );

    // Store URL in metadata for non-local uploads
    const createData: any = {
      projectId,
      title: safeTitle,
      sourceType,
      sourceUrl,
      storagePath,
      transcriptStatus: 'PENDING',
      keyframeStatus: 'PENDING',
    };

    // Only include metadata if there's a sourceUrl
    if (sourceUrl) {
      createData.metadata = { videoUrl: sourceUrl };
    }

    // Create video source record
    const videoSource = await this.prisma.videoSource.create({
      data: createData,
    });

    this.logger.log(`Created video source: ${videoSource.id} for project: ${projectId}`);
    return videoSource;
  }

  /**
   * Upload video file to MinIO and update record
   * @param videoId - Video ID
   * @param userId - User ID
   * @param fileBuffer - File buffer
   * @param filename - Original filename
   * @param mimeType - MIME type
   * @returns Updated video source with URL
   */
  async uploadFile(
    videoId: string,
    userId: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
  ) {
    // Get video source and verify ownership
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    if (video.sourceType !== VideoSourceType.LOCAL_UPLOAD) {
      throw new ForbiddenException('Can only upload files for LOCAL_UPLOAD type');
    }

    // Upload to MinIO
    const normalizedFilename = decodeMojibakeUtf8(filename) || filename;
    const encodedOriginalName = Buffer.from(normalizedFilename, 'utf8').toString('base64');
    const metaData = {
      'Content-Type': mimeType,
      // Keep original filename for traceability, but encode to ASCII-safe value.
      'x-amz-meta-original-filename-b64': encodedOriginalName,
    };
    const videoUrl = await this.storage.upload(fileBuffer, video.storagePath, metaData);

    // Get video metadata using FFmpeg
    let duration: number | undefined;
    let resolution: string | undefined;
    let fileSize: number | undefined;
    let thumbnailUrl: string | undefined;

    try {
      // Save buffer to temp file for FFmpeg processing
      const ext = resolveVideoExtension(normalizedFilename, mimeType);
      const tempPath = path.join(os.tmpdir(), `${videoId}-${Date.now()}${ext}`);
      require('fs').writeFileSync(tempPath, fileBuffer);

      // Get metadata
      const metadata = await this.ffmpeg.getVideoMetadata(tempPath);
      duration = Math.round(metadata.duration);
      resolution = `${metadata.width}x${metadata.height}`;
      fileSize = fileBuffer.length;

      // Generate thumbnail
      const thumbnailPath = await this.ffmpeg.generateThumbnail(tempPath);
      const thumbnailBuffer = require('fs').readFileSync(thumbnailPath);
      const thumbnailStoragePath = this.storage.generateStoragePath(
        userId,
        video.projectId,
        'thumbnails',
        `${video.id}.jpg`,
      );
      thumbnailUrl = await this.storage.upload(thumbnailBuffer, thumbnailStoragePath, {
        'Content-Type': 'image/jpeg',
      });

      // Cleanup temp files
      require('fs').unlinkSync(tempPath);
      require('fs').unlinkSync(thumbnailPath);
    } catch (error) {
      this.logger.error(`Failed to process video metadata: ${error.message}`, error.stack);
      // Continue without metadata - video is still uploaded
    }

    // Update video source with URL in metadata
    const updated = await this.prisma.videoSource.update({
      where: { id: videoId },
      data: {
        duration,
        resolution,
        fileSize: fileSize ? BigInt(fileSize) : undefined,
        thumbnailUrl,
        metadata: {
          ...(video.metadata as Record<string, unknown> || {}),
          videoUrl,
        },
      },
    });

    this.logger.log(`Uploaded file for video: ${videoId}`);
    return updated;
  }

  /**
   * Import video from URL
   * @param projectId - Project ID
   * @param userId - User ID
   * @param title - Video title
   * @param sourceType - Source type
   * @param sourceUrl - Source URL
   * @returns Created video source
   */
  async importFromUrl(
    projectId: string,
    userId: string,
    title: string,
    sourceType: VideoSourceType,
    sourceUrl: string,
  ) {
    // Create video source record with URL in metadata
    const video = await this.prisma.videoSource.create({
      data: {
        projectId,
        title,
        sourceType,
        sourceUrl,
        storagePath: '', // No local storage for URL imports initially
        transcriptStatus: 'PENDING',
        keyframeStatus: 'PENDING',
        metadata: {
          videoUrl: sourceUrl,
        },
      },
    });

    this.logger.log(`Imported video from URL: ${sourceUrl} -> ${video.id}`);

    // TODO: Queue async task to download and process the video
    // This would use a queue processor to:
    // 1. Download the video (for URL_IMPORT) or extract stream (for YouTube/Bilibili)
    // 2. Upload to MinIO
    // 3. Extract metadata and generate thumbnail

    return video;
  }

  /**
   * List all videos for a project
   * @param projectId - Project ID
   * @param userId - User ID
   * @returns Array of video sources
   */
  async listByProject(projectId: string, userId: string) {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    const videos = await this.prisma.videoSource.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return videos;
  }

  /**
   * Get a single video by ID
   * @param videoId - Video ID
   * @param userId - User ID
   * @returns Video source
   */
  async getById(videoId: string, userId: string) {
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    return video;
  }

  /**
   * Update video title
   * @param videoId - Video ID
   * @param userId - User ID
   * @param title - New title
   * @returns Updated video source
   */
  async update(videoId: string, userId: string, title: string) {
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    const updated = await this.prisma.videoSource.update({
      where: { id: videoId },
      data: { title },
    });

    this.logger.log(`Updated video title: ${videoId}`);
    return updated;
  }

  /**
   * Delete a video
   * @param videoId - Video ID
   * @param userId - User ID
   */
  async delete(videoId: string, userId: string) {
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    // Delete from MinIO
    try {
      if (video.storagePath) {
        await this.storage.delete(video.storagePath);
      }
      if (video.thumbnailUrl) {
        const thumbnailPath = video.thumbnailUrl.split('/').pop();
        if (thumbnailPath) {
          await this.storage.delete(`${video.project.userId}/${video.projectId}/thumbnails/${thumbnailPath}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to delete video from storage: ${error.message}`, error.stack);
      // Continue with database deletion
    }

    // Delete from database (cascade will delete related records)
    await this.prisma.videoSource.delete({
      where: { id: videoId },
    });

    this.logger.log(`Deleted video: ${videoId}`);
  }

  /**
   * Get a signed URL for video playback
   * @param videoId - Video ID
   * @param userId - User ID
   * @returns Signed URL
   */
  async getSignedUrl(videoId: string, userId: string) {
    const video = await this.getById(videoId, userId);

    const metadata = video.metadata as Record<string, unknown> | null;

    // For URL imports, return the source URL from metadata
    if (video.sourceType !== VideoSourceType.LOCAL_UPLOAD) {
      return (metadata?.videoUrl as string) || video.sourceUrl || '';
    }

    // For uploaded files, generate a signed URL
    if (!video.storagePath) {
      throw new NotFoundException('Video file not found');
    }
    return await this.storage.getSignedUrl(video.storagePath, 7 * 24 * 60 * 60); // 7 days
  }

  /**
   * Get video stream for playback
   * @param videoId - Video ID
   * @param userId - User ID
   * @returns Video stream and metadata
   */
  async getVideoStream(videoId: string, userId: string) {
    const video = await this.getById(videoId, userId);

    if (video.sourceType !== VideoSourceType.LOCAL_UPLOAD) {
      throw new ForbiddenException('Can only stream uploaded videos');
    }

    if (!video.storagePath) {
      throw new NotFoundException('Video file not found');
    }

    const stream = await this.storage.downloadStream(video.storagePath);
    const meta = await this.storage
      .getMetadata(video.storagePath)
      .catch(() => null as any);
    const metaMap = (meta?.metaData ?? {}) as Record<string, string>;
    const metaContentType =
      metaMap['content-type'] ||
      metaMap['Content-Type'] ||
      metaMap['x-amz-meta-content-type'] ||
      null;
    const contentType = metaContentType || this.guessContentType(video.storagePath);

    return {
      stream,
      filename: `${video.title}.mp4`,
      contentType,
    };
  }

  private guessContentType(storagePath: string): string {
    const ext = path.extname(storagePath || '').toLowerCase();
    switch (ext) {
      case '.webm':
        return 'video/webm';
      case '.ogg':
      case '.ogv':
        return 'video/ogg';
      case '.mov':
        return 'video/quicktime';
      case '.avi':
        return 'video/x-msvideo';
      case '.mkv':
        return 'video/x-matroska';
      case '.wmv':
        return 'video/x-ms-wmv';
      case '.flv':
        return 'video/x-flv';
      case '.mp4':
      default:
        return 'video/mp4';
    }
  }

  /**
   * Regenerate thumbnail for a video
   * @param videoId - Video ID
   * @param userId - User ID
   * @returns Updated video with new thumbnail URL
   */
  async regenerateThumbnail(videoId: string, userId: string) {
    const video = await this.getById(videoId, userId);

    if (video.sourceType !== VideoSourceType.LOCAL_UPLOAD) {
      throw new ForbiddenException('Can only regenerate thumbnails for uploaded videos');
    }

    if (!video.storagePath) {
      throw new NotFoundException('Video file not found');
    }

    try {
      // Download video from storage
      const videoBuffer = await this.storage.download(video.storagePath);

      // Save to temp file
      const tempPath = path.join(os.tmpdir(), `${videoId}-${Date.now()}.mp4`);
      require('fs').writeFileSync(tempPath, videoBuffer);

      // Generate new thumbnail
      const thumbnailPath = await this.ffmpeg.generateThumbnail(tempPath);
      const thumbnailBuffer = require('fs').readFileSync(thumbnailPath);

      // Upload new thumbnail
      const thumbnailStoragePath = this.storage.generateStoragePath(
        userId,
        video.projectId,
        'thumbnails',
        `${video.id}.jpg`,
      );
      const thumbnailUrl = await this.storage.upload(thumbnailBuffer, thumbnailStoragePath, {
        'Content-Type': 'image/jpeg',
      });

      // Cleanup
      require('fs').unlinkSync(tempPath);
      require('fs').unlinkSync(thumbnailPath);

      // Update video
      const updated = await this.prisma.videoSource.update({
        where: { id: videoId },
        data: { thumbnailUrl },
      });

      this.logger.log(`Regenerated thumbnail for video: ${videoId}`);
      return updated;
    } catch (error) {
      this.logger.error(`Failed to regenerate thumbnail: ${error.message}`, error.stack);
      throw error;
    }
  }
}
