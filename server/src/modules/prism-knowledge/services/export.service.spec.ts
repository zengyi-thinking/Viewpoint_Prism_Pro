import { ExportService } from './export.service';

describe('ExportService', () => {
  it('should build settlement package and sync notion/feishu', async () => {
    const asset = {
      id: 'asset_1',
      videoId: 'video_1',
      outlineMarkdown: '# 大纲\n\n## 章节一\n- 重点A',
      notesMarkdown: '旧笔记',
      status: 'COMPLETED',
      syncedTo: [],
      profileSnapshot: null,
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    };

    const flashcard = {
      id: 'fc_1',
      assetId: asset.id,
      front: '什么是 Encoder？',
      back: '用于编码上下文信息',
      chapter: 'Transformer',
      difficulty: 2,
      nextReview: new Date('2026-03-03T00:00:00.000Z'),
      reviewCount: 0,
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
    };

    const prisma: any = {
      transcript: {
        findFirst: jest.fn().mockResolvedValue({
          id: 't_1',
          segments: [
            { start: 0, end: 10, text: '介绍 Transformer 架构' },
            { start: 10, end: 20, text: '讲解 Encoder 与 Decoder' },
          ],
        }),
      },
      keyframe: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'kf_1',
            timestamp: 8,
            storagePath: 'https://example.com/kf_1.jpg',
            description: 'Transformer 总览图',
            frameType: 'PPT',
          },
        ]),
      },
      knowledgeAsset: {
        findFirst: jest.fn().mockResolvedValue(asset),
        update: jest.fn().mockResolvedValue(asset),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_1',
          name: 'Alice',
          email: 'alice@example.com',
          profile: { level: 'beginner' },
        }),
      },
      userSettings: {
        findUnique: jest.fn().mockResolvedValue({
          notionToken: 'notion_xxx',
          feishuAppId: 'cli_xxx',
          feishuAppSecret: 'sec_xxx',
        }),
      },
      crystalCard: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'qa_1',
            assetId: asset.id,
            title: '专属 Q&A 补充',
            content: 'Q: Encoder 做什么\nA: 提取语义特征',
            summary: 'Encoder 作用',
            sourceText: 'Encoder 作用？',
            timestamp: 12,
          },
        ]),
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      videoBehaviorEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      knowledgeDeepAnalysis: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'deep_1',
          version: 1,
          summary: '本视频重点讲解 Transformer 的整体结构、Encoder/Decoder 分工以及注意力机制的作用。',
          chapterGraphJson: [
            { title: 'Transformer 总览', summary: '先建立整体结构认知' },
          ],
          conceptGraphJson: [
            { name: 'Encoder', summary: '负责上下文编码' },
          ],
          ambiguitiesJson: [
            { concept: 'Encoder vs Decoder', clarification: '前者编码输入，后者逐步生成输出' },
          ],
          backgroundFactsJson: [
            { title: '注意力机制', detail: '使模型能关注输入序列中的关键位置' },
          ],
          learningRecommendationsJson: [
            { title: '先看总览图', action: '先理解模块关系再深入公式' },
          ],
        }),
      },
      flashcard: {
        findMany: jest.fn().mockResolvedValue([flashcard]),
      },
    };

    const flashcardService: any = {
      generateFlashcards: jest.fn().mockResolvedValue([flashcard]),
    };

    const notionService: any = {
      syncKnowledgePackage: jest.fn().mockResolvedValue({
        success: true,
        mode: 'dry-run',
        pageId: 'page_1',
        pageUrl: 'https://notion.so/page_1',
      }),
    };

    const feishuService: any = {
      syncKnowledgePackage: jest.fn().mockResolvedValue({
        success: true,
        mode: 'dry-run',
        documentId: 'doc_1',
        documentUrl: 'https://feishu.cn/docx/doc_1',
      }),
    };

    const service = new ExportService(
      prisma,
      flashcardService,
      notionService,
      feishuService,
    );

    const result = await service.settleKnowledgePackage({
      userId: 'user_1',
      videoId: 'video_1',
      videoTitle: 'Transformer 入门课',
      syncTargets: ['notion', 'feishu'],
    });

    expect(result.output.markdownPackage.content).toContain('图文并茂结构化大纲');
    expect(result.output.markdownPackage.content).toContain('二次理解与背景知识');
    expect(result.output.notesMarkdown).toContain('个性化学习笔记');
    expect(result.output.flashcards.length).toBe(1);
    expect(result.syncedTargets).toEqual(expect.arrayContaining(['notion', 'feishu']));
    expect(notionService.syncKnowledgePackage).toHaveBeenCalledTimes(1);
    expect(feishuService.syncKnowledgePackage).toHaveBeenCalledTimes(1);
    expect(prisma.knowledgeAsset.update).toHaveBeenCalled();
  });
});
