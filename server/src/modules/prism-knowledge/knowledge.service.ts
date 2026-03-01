import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyzeKnowledgeDto, ExportKnowledgeDto } from './dto';
import { FlashcardService } from './services/flashcard.service';
import { KeyframeService } from './services/keyframe.service';
import { OutlineService } from './services/outline.service';
import { TranscriptService } from './services/transcript.service';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transcriptService: TranscriptService,
    private readonly keyframeService: KeyframeService,
    private readonly outlineService: OutlineService,
    private readonly flashcardService: FlashcardService,
  ) {}

  async analyze(
    userId: string,
    videoId: string,
    dto: AnalyzeKnowledgeDto,
  ) {
    const video = await this.getOwnedVideo(userId, videoId);
    const taskId = `knowledge_${Date.now()}`;

    const transcript = await this.transcriptService.generateTranscript(
      {
        id: video.id,
        title: video.title,
        sourceType: video.sourceType,
        storagePath: video.storagePath,
        duration: video.duration,
      },
      userId,
      { regenerate: dto.regenerateTranscript },
    );

    const keyframes = await this.keyframeService.extractKeyframes(
      {
        id: video.id,
        projectId: video.projectId,
        sourceType: video.sourceType,
        storagePath: video.storagePath,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
      },
      userId,
      { regenerate: dto.regenerateKeyframes },
    );

    const transcriptSegments =
      (transcript.segments as Array<{
        start: number;
        end: number;
        text: string;
      }>) ?? [];

    const asset = await this.outlineService.buildOutline({
      userId,
      videoId: video.id,
      videoTitle: video.title,
      transcriptSegments,
      keyframes: keyframes.map((kf) => ({
        timestamp: kf.timestamp,
        storagePath: kf.storagePath,
        description: kf.description,
      })),
    });

    const flashcards = await this.flashcardService.generateFlashcards({
      assetId: asset.id,
      transcriptSegments: transcriptSegments.map((seg) => ({ text: seg.text })),
    });

    return {
      taskId,
      userId,
      videoId,
      status: 'completed',
      options: dto,
      transcriptId: transcript.id,
      keyframeCount: keyframes.length,
      assetId: asset.id,
      flashcardCount: flashcards.length,
    };
  }

  async getTranscript(userId: string, videoId: string) {
    await this.getOwnedVideo(userId, videoId);
    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      userId,
      videoId,
      status: transcript ? 'COMPLETED' : 'PENDING',
      transcript,
      segments: (transcript?.segments as any[]) ?? [],
    };
  }

  async getOutline(userId: string, videoId: string) {
    await this.getOwnedVideo(userId, videoId);
    const asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      userId,
      videoId,
      status: asset?.status ?? 'PENDING',
      assetId: asset?.id ?? null,
      outlineMarkdown: asset?.outlineMarkdown ?? '',
      notesMarkdown: asset?.notesMarkdown ?? '',
      syncedTo: asset?.syncedTo ?? [],
    };
  }

  async getFlashcards(userId: string, videoId: string) {
    await this.getOwnedVideo(userId, videoId);
    const asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true },
    });

    const items = asset
      ? await this.prisma.flashcard.findMany({
          where: { assetId: asset.id },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    return {
      userId,
      videoId,
      status: asset?.status ?? 'PENDING',
      assetId: asset?.id ?? null,
      items,
      count: items.length,
      flashcards: items,
    };
  }

  async export(userId: string, videoId: string, dto: ExportKnowledgeDto) {
    // TODO: enqueue export/sync task
    return {
      taskId: `knowledge_export_${Date.now()}`,
      userId,
      videoId,
      target: dto.target ?? 'markdown',
      status: 'queued',
    };
  }

  async injectQaCard(params: {
    userId: string;
    videoId: string;
    question: string;
    answer: string;
    metadata?: Record<string, unknown> | null;
  }) {
    const { userId, videoId, question, answer, metadata } = params;
    await this.getOwnedVideo(userId, videoId);

    let asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!asset) {
      asset = await this.prisma.knowledgeAsset.create({
        data: {
          videoId,
          outlineMarkdown: '# 知识大纲\n\n（待生成）',
          notesMarkdown: '',
          status: 'PROCESSING',
        },
      });
    }

    const ts = new Date().toISOString();
    const metaLine = metadata ? `\n- metadata: \`${JSON.stringify(metadata)}\`` : '';
    const block = [
      `### Q&A 补充 (${ts})`,
      '',
      `- Q: ${question}`,
      `- A: ${answer}`,
      metaLine,
      '',
    ].join('\n');

    const updated = await this.prisma.knowledgeAsset.update({
      where: { id: asset.id },
      data: {
        notesMarkdown: `${asset.notesMarkdown ?? ''}\n${block}`.trim(),
      },
    });

    return {
      assetId: updated.id,
      videoId,
      injectedAt: ts,
    };
  }

  private async getOwnedVideo(userId: string, videoId: string) {
    const video = await this.prisma.videoSource.findFirst({
      where: { id: videoId, project: { userId } },
      select: {
        id: true,
        projectId: true,
        title: true,
        sourceType: true,
        sourceUrl: true,
        storagePath: true,
        duration: true,
        thumbnailUrl: true,
      },
    });

    if (!video) {
      throw new NotFoundException('视频不存在或无访问权限');
    }

    return video;
  }
}
