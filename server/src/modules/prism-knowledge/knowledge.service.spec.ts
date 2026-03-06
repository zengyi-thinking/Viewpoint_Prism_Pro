import { KnowledgeService } from './knowledge.service';

describe('KnowledgeService analyze pipeline', () => {
  it('should execute analyze pipeline and return ready board state', async () => {
    const video = {
      id: 'video_1',
      projectId: 'project_1',
      title: 'Test Video',
      sourceType: 'LOCAL_UPLOAD',
      sourceUrl: null,
      storagePath: 'user/project/videos/test.mp4',
      duration: 120,
      thumbnailUrl: null,
      transcriptStatus: 'PENDING',
      keyframeStatus: 'PENDING',
    };

    const prisma: any = {
      videoSource: {
        findFirst: jest.fn().mockResolvedValue(video),
      },
      knowledgeAsset: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'asset_processing',
          videoId: video.id,
          outlineMarkdown: '',
          notesMarkdown: '',
          status: 'PROCESSING',
        }),
        update: jest.fn(),
      },
      crystalCard: {
        create: jest.fn(),
      },
    };

    const transcriptService: any = {
      generateTranscript: jest.fn().mockResolvedValue({
        id: 'transcript_1',
        segments: [
          { start: 0, end: 10, text: '段落1' },
          { start: 10, end: 20, text: '段落2' },
        ],
      }),
    };
    const keyframeService: any = {
      extractKeyframes: jest.fn().mockResolvedValue([
        {
          id: 'kf_1',
          timestamp: 8,
          storagePath: 'https://example/kf_1.jpg',
          description: 'PPT 页面',
          frameType: 'PPT',
        },
      ]),
    };
    const outlineService: any = {
      buildOutline: jest.fn().mockResolvedValue({
        id: 'asset_1',
        outlineMarkdown: '# 大纲\n\n## 章节 00:08',
      }),
    };
    const flashcardService: any = {
      generateFlashcards: jest.fn().mockResolvedValue([
        {
          id: 'fc_1',
          front: '什么是编码器？',
          back: '编码器负责提取上下文特征',
          chapter: '章节 1',
          difficulty: 2,
          nextReview: new Date('2026-03-03T00:00:00.000Z'),
          createdAt: new Date('2026-03-02T00:00:00.000Z'),
        },
      ]),
    };
    const crystalCardService: any = {};
    const mindmapService: any = {};
    const exportService: any = {};
    const deepUnderstandingService: any = {
      generate: jest.fn(),
    };

    const wsGateway: any = {
      emitKnowledgeState: jest.fn(),
      emitKnowledgeTimeline: jest.fn(),
      emitTaskProgress: jest.fn(),
      emitTaskComplete: jest.fn(),
    };

    const service = new KnowledgeService(
      prisma,
      wsGateway,
      transcriptService,
      keyframeService,
      outlineService,
      flashcardService,
      crystalCardService,
      mindmapService,
      exportService,
      deepUnderstandingService,
    );

    const result = await service.analyze('user_1', video.id, { includeDeepAnalysis: false });

    expect(result.status).toBe('completed');
    expect(result.boardState).toBe('ready');
    expect(result.keyframeCount).toBe(1);
    expect(result.flashcardCount).toBe(1);

    expect(transcriptService.generateTranscript).toHaveBeenCalledTimes(1);
    expect(keyframeService.extractKeyframes).toHaveBeenCalledTimes(1);
    expect(outlineService.buildOutline).toHaveBeenCalledTimes(1);
    expect(flashcardService.generateFlashcards).toHaveBeenCalledTimes(1);

    const transcriptOptions = transcriptService.generateTranscript.mock.calls[0][2];
    const keyframeOptions = keyframeService.extractKeyframes.mock.calls[0][2];
    expect(typeof transcriptOptions.onSegment).toBe('function');
    expect(typeof keyframeOptions.onFrame).toBe('function');

    expect(wsGateway.emitKnowledgeState).toHaveBeenCalled();
    expect(wsGateway.emitKnowledgeTimeline).toHaveBeenCalled();
    expect(wsGateway.emitTaskProgress).toHaveBeenCalled();
    expect(wsGateway.emitTaskComplete).toHaveBeenCalled();
  });
});
