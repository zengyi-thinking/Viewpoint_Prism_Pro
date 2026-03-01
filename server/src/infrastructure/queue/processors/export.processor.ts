import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../queue.constants';
import { FfmpegService } from '../../media/ffmpeg.service';
import { StorageService } from '../../storage/storage.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WsGateway } from '../../websocket/ws.gateway';
import * as archiver from 'archiver';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ExportJobData {
  assetType: 'knowledge' | 'creation' | 'translation' | 'diffraction';
  assetId: string;
  userId: string;
  projectId: string;
  format?: 'markdown' | 'zip' | 'mp4';
}

@Processor(QUEUE_NAMES.EXPORT)
export class ExportProcessor {
  private readonly logger = new Logger(ExportProcessor.name);

  constructor(
    private readonly ffmpegService: FfmpegService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  @Process()
  async handleExport(job: Job<ExportJobData>) {
    const { assetType, assetId, userId, projectId, format = 'zip' } = job.data;

    this.logger.log(`Starting export for ${assetType} asset ${assetId}`);

    try {
      await job.progress(10);
      this.emitProgress(userId, projectId, assetId, 'export', 10, 'Preparing export...');

      let exportResult: any;

      switch (assetType) {
        case 'knowledge':
          exportResult = await this.exportKnowledgeAsset(assetId, userId, projectId, job);
          break;
        case 'creation':
          exportResult = await this.exportCreationAsset(assetId, userId, projectId, job);
          break;
        case 'translation':
          exportResult = await this.exportTranslationAsset(assetId, userId, projectId, job);
          break;
        case 'diffraction':
          exportResult = await this.exportDiffractionAsset(assetId, userId, projectId, job);
          break;
        default:
          throw new Error(`Unknown asset type: ${assetType}`);
      }

      await job.progress(100);
      this.emitProgress(userId, projectId, assetId, 'export', 100, 'Export completed');

      this.logger.log(`Export completed for ${assetType} asset ${assetId}`);

      return {
        success: true,
        assetType,
        assetId,
        ...exportResult,
      };
    } catch (error) {
      this.logger.error(`Export failed for ${assetType} asset ${assetId}: ${error.message}`, error.stack);
      this.emitError(userId, projectId, assetId, 'export', error.message);
      throw error;
    }
  }




  private async exportKnowledgeAsset(assetId: string, userId: string, projectId: string, job: Job) {
    await job.progress(20);
    this.emitProgress(userId, projectId, assetId, 'export', 20, 'Loading knowledge asset...');

    const asset = await this.prisma.knowledgeAsset.findUnique({
      where: { id: assetId },
      include: {
        video: true,
        flashcards: true,
      },
    });

    if (!asset) {
      throw new Error(`Knowledge asset ${assetId} not found`);
    }

    await job.progress(40);
    this.emitProgress(userId, projectId, assetId, 'export', 40, 'Creating export package...');

    // Create a ZIP archive with markdown, flashcards, and images
    const tempDir = `/tmp/export-${assetId}-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    // Write markdown files
    await fs.writeFile(path.join(tempDir, 'outline.md'), asset.outlineMarkdown);
    if (asset.notesMarkdown) {
      await fs.writeFile(path.join(tempDir, 'notes.md'), asset.notesMarkdown);
    }

    // Write flashcards JSON
    const flashcardsJson = JSON.stringify(asset.flashcards, null, 2);
    await fs.writeFile(path.join(tempDir, 'flashcards.json'), flashcardsJson);

    // Create ZIP archive
    const zipPath = path.join(tempDir, 'export.zip');
    await this.createZipArchive(tempDir, zipPath, ['outline.md', 'notes.md', 'flashcards.json']);

    await job.progress(80);
    this.emitProgress(userId, projectId, assetId, 'export', 80, 'Uploading export...');

    // Upload to storage
    const zipBuffer = await fs.readFile(zipPath);
    const storageKey = this.storageService.generateStoragePath(
      userId,
      projectId,
      'exports',
      `knowledge-${assetId}-${Date.now()}.zip`,
    );
    const downloadUrl = await this.storageService.upload(
      zipBuffer,
      storageKey,
      { contentType: 'application/zip' },
    );

    // Cleanup temp dir
    await fs.rm(tempDir, { recursive: true, force: true });

    return { downloadUrl, format: 'zip' };
  }

  private async exportCreationAsset(assetId: string, userId: string, projectId: string, job: Job) {
    await job.progress(20);
    this.emitProgress(userId, projectId, assetId, 'export', 20, 'Loading creation project...');

    const flowProject = await this.prisma.prismFlowProject.findUnique({
      where: { id: assetId },
      include: {
        nodes: {
          where: { isMerged: false },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!flowProject) {
      throw new Error(`PrismFlow project ${assetId} not found`);
    }

    await job.progress(40);
    this.emitProgress(userId, projectId, assetId, 'export', 40, 'Stitching video...');

    // Collect rendered videos
    const videoPaths: string[] = [];
    const tempDir = `/tmp/export-${assetId}-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    for (const node of flowProject.nodes) {
      if (node.renderedVideoUrl) {
        const videoBuffer = await this.storageService.download(
          node.renderedVideoUrl.split('/').slice(-2).join('/'),
        );
        const tempPath = path.join(tempDir, `node-${node.orderIndex}.mp4`);
        await fs.writeFile(tempPath, videoBuffer);
        videoPaths.push(tempPath);
      }
    }

    if (videoPaths.length === 0) {
      throw new Error('No rendered videos found for export');
    }

    await job.progress(60);
    this.emitProgress(userId, projectId, assetId, 'export', 60, 'Rendering final video...');

    // Stitch videos together
    const outputPath = path.join(tempDir, 'final.mp4');
    await this.ffmpegService.stitchVideos(videoPaths, outputPath);

    await job.progress(80);
    this.emitProgress(userId, projectId, assetId, 'export', 80, 'Uploading video...');

    // Upload to storage
    const videoBuffer = await fs.readFile(outputPath);
    const storageKey = this.storageService.generateStoragePath(
      userId,
      projectId,
      'exports',
      `creation-${assetId}-${Date.now()}.mp4`,
    );
    const downloadUrl = await this.storageService.upload(
      videoBuffer,
      storageKey,
      { contentType: 'video/mp4' },
    );

    // Cleanup temp dir
    await fs.rm(tempDir, { recursive: true, force: true });

    return { downloadUrl, format: 'mp4' };
  }

  private async exportTranslationAsset(assetId: string, userId: string, projectId: string, job: Job) {
    await job.progress(20);
    this.emitProgress(userId, projectId, assetId, 'export', 20, 'Loading translation task...');

    const translationTask = await this.prisma.translationTask.findUnique({
      where: { id: assetId },
      include: {
        subtitleTracks: true,
      },
    });

    if (!translationTask) {
      throw new Error(`Translation task ${assetId} not found`);
    }

    await job.progress(40);
    this.emitProgress(userId, projectId, assetId, 'export', 40, 'Creating export package...');

    // Create ZIP with all subtitle tracks
    const tempDir = `/tmp/export-${assetId}-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    const filesToZip: string[] = [];

    for (const track of translationTask.subtitleTracks) {
      const filename = `${track.language}.srt`;
      const filepath = path.join(tempDir, filename);
      await fs.writeFile(filepath, track.srtContent || '');
      filesToZip.push(filename);
    }

    // Create ZIP archive
    const zipPath = path.join(tempDir, 'subtitles.zip');
    await this.createZipArchive(tempDir, zipPath, filesToZip);

    await job.progress(80);
    this.emitProgress(userId, projectId, assetId, 'export', 80, 'Uploading export...');

    // Upload to storage
    const zipBuffer = await fs.readFile(zipPath);
    const storageKey = this.storageService.generateStoragePath(
      userId,
      projectId,
      'exports',
      `translation-${assetId}-${Date.now()}.zip`,
    );
    const downloadUrl = await this.storageService.upload(
      zipBuffer,
      storageKey,
      { contentType: 'application/zip' },
    );

    // Cleanup temp dir
    await fs.rm(tempDir, { recursive: true, force: true });

    return { downloadUrl, format: 'zip' };
  }

  private async exportDiffractionAsset(assetId: string, userId: string, projectId: string, job: Job) {
    await job.progress(20);
    this.emitProgress(userId, projectId, assetId, 'export', 20, 'Loading diffraction task...');

    const diffractionTask = await this.prisma.diffractionTask.findUnique({
      where: { id: assetId },
      include: {
        platformDrafts: true,
      },
    });

    if (!diffractionTask) {
      throw new Error(`Diffraction task ${assetId} not found`);
    }

    await job.progress(40);
    this.emitProgress(userId, projectId, assetId, 'export', 40, 'Creating export package...');

    // Create markdown files for each platform
    const tempDir = `/tmp/export-${assetId}-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    const filesToZip: string[] = [];

    for (const draft of diffractionTask.platformDrafts) {
      const filename = `${draft.platform.toLowerCase()}.md`;
      const filepath = path.join(tempDir, filename);
      const content = this.formatPlatformDraft(draft);
      await fs.writeFile(filepath, content);
      filesToZip.push(filename);
    }

    // Create ZIP archive
    const zipPath = path.join(tempDir, 'content.zip');
    await this.createZipArchive(tempDir, zipPath, filesToZip);

    await job.progress(80);
    this.emitProgress(userId, projectId, assetId, 'export', 80, 'Uploading export...');

    // Upload to storage
    const zipBuffer = await fs.readFile(zipPath);
    const storageKey = this.storageService.generateStoragePath(
      userId,
      projectId,
      'exports',
      `diffraction-${assetId}-${Date.now()}.zip`,
    );
    const downloadUrl = await this.storageService.upload(
      zipBuffer,
      storageKey,
      { contentType: 'application/zip' },
    );

    // Cleanup temp dir
    await fs.rm(tempDir, { recursive: true, force: true });

    return { downloadUrl, format: 'zip' };
  }

  private async createZipArchive(dir: string, outputPath: string, files: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = require('fs').createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);

      archive.pipe(output);

      for (const file of files) {
        archive.file(path.join(dir, file), { name: file });
      }

      archive.finalize();
    });
  }

  private formatPlatformDraft(draft: any): string {
    return `# ${draft.title || 'Untitled'}

**Platform:** ${draft.platform}
**Tone:** ${draft.tone || 'default'}

---

${draft.content || ''}

---
${draft.ctaLine || ''}
`;
  }

  private emitProgress(userId: string, projectId: string, assetId: string, task: string, progress: number, message: string) {
    this.wsGateway.emitToUser(userId, 'task:progress', {
      projectId,
      assetId,
      task,
      progress,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private emitError(userId: string, projectId: string, assetId: string, task: string, error: string) {
    this.wsGateway.emitToUser(userId, 'task:error', {
      projectId,
      assetId,
      task,
      error,
      timestamp: new Date().toISOString(),
    });
  }
}
