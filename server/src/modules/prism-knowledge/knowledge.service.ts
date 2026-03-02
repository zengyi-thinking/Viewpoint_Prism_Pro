import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AnalyzeKnowledgeDto,
  BatchAnalyzeKnowledgeDto,
  ExportKnowledgeDto,
  GenerateMindmapDto,
  RegenerateFlashcardsDto,
} from './dto';
import { CrystalCardService } from './services/crystal-card.service';
import { FlashcardService } from './services/flashcard.service';
import { KeyframeService } from './services/keyframe.service';
import { MindmapService, MindmapResult } from './services/mindmap.service';
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
    private readonly crystalCardService: CrystalCardService,
    private readonly mindmapService: MindmapService,
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
      transcriptSegments,
      userId,
      videoTitle: video.title,
      outlineMarkdown: asset.outlineMarkdown ?? '',
      maxCards: 12,
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

  async analyzeBatch(userId: string, dto: BatchAnalyzeKnowledgeDto) {
    const startedAt = Date.now();
    const options: AnalyzeKnowledgeDto = {
      regenerateTranscript: dto.regenerateTranscript,
      regenerateKeyframes: dto.regenerateKeyframes,
    };

    const results: Array<{
      videoId: string;
      status: 'completed' | 'failed';
      result?: any;
      error?: string;
    }> = [];

    // 按用户要求逐个分析，确保视频与音频流分析过程稳定可追踪。
    for (const videoId of dto.videoIds) {
      try {
        const result = await this.analyze(userId, videoId, options);
        results.push({ videoId, status: 'completed', result });
      } catch (error: any) {
        results.push({
          videoId,
          status: 'failed',
          error: error?.message || 'Unknown error',
        });
      }
    }

    const completed = results.filter((r) => r.status === 'completed').length;
    const failed = results.length - completed;

    return {
      taskId: `knowledge_batch_${Date.now()}`,
      status: failed > 0 ? 'partial' : 'completed',
      total: results.length,
      completed,
      failed,
      durationMs: Date.now() - startedAt,
      results,
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

  async regenerateOutline(userId: string, videoId: string) {
    const video = await this.getOwnedVideo(userId, videoId);

    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    if (!transcript) {
      throw new NotFoundException('请先生成转写内容');
    }

    const keyframes = await this.prisma.keyframe.findMany({
      where: { videoId },
      orderBy: { timestamp: 'asc' },
    });

    const transcriptSegments = (transcript.segments as Array<{
      start: number;
      end: number;
      text: string;
    }>) ?? [];

    const asset = await this.outlineService.buildOutline({
      userId,
      videoId,
      videoTitle: video.title,
      transcriptSegments,
      keyframes: keyframes.map((kf) => ({
        timestamp: kf.timestamp,
        storagePath: kf.storagePath,
        description: kf.description,
      })),
    });

    return {
      taskId: `outline_${Date.now()}`,
      userId,
      videoId,
      status: 'completed',
      assetId: asset.id,
      outlineMarkdown: asset.outlineMarkdown,
    };
  }

  async regenerateFlashcards(userId: string, videoId: string, dto: RegenerateFlashcardsDto = {}) {
    const video = await this.getOwnedVideo(userId, videoId);

    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    if (!transcript) {
      throw new NotFoundException('请先生成转写内容');
    }

    let asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!asset) {
      asset = await this.outlineService.buildOutline({
        userId,
        videoId,
        videoTitle: video.title,
        transcriptSegments: (transcript.segments as Array<{ start: number; end: number; text: string }>) ?? [],
        keyframes: [],
      });
    }

    const transcriptSegments = (transcript.segments as Array<{
      start: number;
      end: number;
      text: string;
    }>) ?? [];

    const cards = await this.flashcardService.generateFlashcards({
      assetId: asset.id,
      transcriptSegments,
      userId,
      videoTitle: video.title,
      outlineMarkdown: asset.outlineMarkdown ?? '',
      maxCards: dto.maxCards ?? 12,
    });

    return {
      taskId: `flashcards_${Date.now()}`,
      userId,
      videoId,
      status: 'completed',
      count: cards.length,
      items: cards,
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

  /**
   * 生成思维导图
   */
  async generateMindmap(userId: string, videoId: string, dto: GenerateMindmapDto) {
    const video = await this.getOwnedVideo(userId, videoId);
    const sessionId = dto.sessionId ?? null;

    // 获取转写内容
    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    if (!transcript) {
      throw new NotFoundException('请先生成转写内容');
    }

    const transcriptSegments = (transcript.segments as Array<{
      start: number;
      end: number;
      text: string;
    }>) ?? [];

    // 获取关键帧
    const keyframes = await this.prisma.keyframe.findMany({
      where: { videoId },
      orderBy: { timestamp: 'asc' },
      take: 20,
    });

    let result;

    if (sessionId && dto.prompt) {
      // 从对话生成思维导图
      result = await this.mindmapService.generateMindmapFromChat({
        userId,
        videoId: video.id,
        sessionId,
        prompt: dto.prompt,
      });
    } else {
      // 从视频内容生成思维导图
      result = await this.mindmapService.generateMindmap({
        userId,
        videoId: video.id,
        videoTitle: video.title,
        transcriptSegments,
        keyframes: keyframes.map((kf) => ({
          timestamp: kf.timestamp,
          storagePath: kf.storagePath,
          description: kf.description,
        })),
        maxDepth: dto.maxDepth ?? 5,
        maxNodes: dto.maxNodes ?? 90,
      });
    }

    return {
      taskId: `mindmap_${Date.now()}`,
      userId,
      videoId,
      status: 'completed',
      result: {
        nodeCount: result.nodeCount,
        json: result.json,
        markdown: result.markdown,
        mermaid: result.mermaid,
      },
    };
  }

  /**
   * 获取思维导图
   */
  async getMindmap(userId: string, videoId: string) {
    await this.getOwnedVideo(userId, videoId);
    const mindmap = await this.mindmapService.getMindmap(videoId);

    return {
      userId,
      videoId,
      status: mindmap ? 'COMPLETED' : 'PENDING',
      mindmap,
    };
  }

  /**
   * 导出思维导图
   */
  async exportMindmap(userId: string, videoId: string, format: 'json' | 'markdown' | 'mermaid' | 'xmind' | 'freemind') {
    await this.getOwnedVideo(userId, videoId);

    const content = await this.mindmapService.exportMindmap({
      videoId,
      format,
    });

    return {
      videoId,
      format,
      content,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * 获取晶体卡片列表
   */
  async getCrystalCards(userId: string, videoId: string, type?: string) {
    await this.getOwnedVideo(userId, videoId);
    const asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true },
    });

    if (!asset) {
      return {
        userId,
        videoId,
        status: 'PENDING',
        assetId: null,
        cards: [],
        count: 0,
        byType: {},
      };
    }

    return this.crystalCardService.getCrystalCards(asset.id, type ? { type: type as any } : {});
  }

  /**
   * 获取精选晶体卡片
   */
  async getFeaturedCrystalCards(userId: string, videoId: string) {
    await this.getOwnedVideo(userId, videoId);
    const asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    if (!asset) {
      return {
        userId,
        videoId,
        cards: [],
        count: 0,
      };
    }

    const cards = await this.crystalCardService.getFeaturedCards(asset.id);

    return {
      userId,
      videoId,
      cards,
      count: cards.length,
    };
  }

  /**
   * 获取单个晶体卡片
   */
  async getCrystalCard(userId: string, cardId: string) {
    const card = await this.prisma.crystalCard.findUnique({
      where: { id: cardId },
      include: { asset: true },
    });

    if (!card) {
      throw new NotFoundException('晶体卡片不存在');
    }

    // 验证权限
    await this.getOwnedVideo(userId, card.asset.videoId);

    return {
      userId,
      card,
    };
  }

  /**
   * 更新晶体卡片
   */
  async updateCrystalCard(userId: string, cardId: string, updates: any) {
    const card = await this.prisma.crystalCard.findUnique({
      where: { id: cardId },
      include: { asset: true },
    });

    if (!card) {
      throw new NotFoundException('晶体卡片不存在');
    }

    // 验证权限
    await this.getOwnedVideo(userId, card.asset.videoId);

    const updated = await this.crystalCardService.updateCrystalCard(cardId, updates);

    return {
      userId,
      card: updated,
    };
  }

  /**
   * 删除晶体卡片
   */
  async deleteCrystalCard(userId: string, cardId: string) {
    const card = await this.prisma.crystalCard.findUnique({
      where: { id: cardId },
      include: { asset: true },
    });

    if (!card) {
      throw new NotFoundException('晶体卡片不存在');
    }

    // 验证权限
    await this.getOwnedVideo(userId, card.asset.videoId);

    await this.crystalCardService.deleteCrystalCard(cardId);

    return {
      userId,
      success: true,
      cardId,
    };
  }

  /**
   * 重新生成晶体卡片
   */
  async regenerateCrystalCards(userId: string, videoId: string, options: any = {}) {
    const video = await this.getOwnedVideo(userId, videoId);

    // 获取转写内容
    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    if (!transcript) {
      throw new NotFoundException('请先生成转写内容');
    }

    // 获取关键帧
    const keyframes = await this.prisma.keyframe.findMany({
      where: { videoId },
      orderBy: { timestamp: 'asc' },
    });

    // 获取或创建知识资产
    let asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!asset) {
      asset = await this.prisma.knowledgeAsset.create({
        data: {
          videoId,
          outlineMarkdown: '# 知识大纲\n\n（待生成）',
          status: 'PROCESSING',
        },
      });
    }

    const transcriptSegments = (transcript.segments as Array<{
      start: number;
      end: number;
      text: string;
    }>) ?? [];

    const result = await this.crystalCardService.generateCrystalCards(
      {
        userId,
        assetId: asset.id,
        videoTitle: video.title,
        transcriptSegments,
        keyframes: keyframes.map((kf) => ({
          timestamp: kf.timestamp,
          storagePath: kf.storagePath,
          description: kf.description ?? undefined,
        })),
        outlineMarkdown: asset.outlineMarkdown ?? undefined,
      },
      options,
    );

    return {
      taskId: `crystal_cards_${Date.now()}`,
      userId,
      videoId,
      status: 'completed',
      result,
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
