import { Injectable, Logger } from '@nestjs/common';
import { TaskStatus } from '../../../../generated/prisma/enums';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { PrismaService } from '../../../prisma/prisma.service';

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

type KeyframeContext = {
  id: string;
  timestamp: number;
  description?: string | null;
  frameType: string;
  storagePath: string;
};

type FrameInsightContext = {
  keyframeId: string;
  timestampSec: number;
  visualSummary: string;
  chapterHint?: string | null;
  visualType?: string | null;
  ocrText?: string | null;
  visualEntities?: string[];
};

type UserProfileContext = Record<string, unknown> | null;

type DeepAnalysisPayload = {
  summary: string;
  chapterGraph: Array<Record<string, unknown>>;
  conceptGraph: Array<Record<string, unknown>>;
  ambiguities: Array<Record<string, unknown>>;
  backgroundFacts: Array<Record<string, unknown>>;
  learningRecommendations: Array<Record<string, unknown>>;
  sourceDigest: Record<string, unknown>;
};

@Injectable()
export class DeepUnderstandingService {
  private readonly logger = new Logger(DeepUnderstandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  async generate(params: {
    userId: string;
    videoId: string;
    assetId?: string | null;
    videoTitle: string;
    transcriptSegments: TranscriptSegment[];
    keyframes: KeyframeContext[];
    frameInsights: FrameInsightContext[];
    outlineMarkdown: string;
    userProfile?: UserProfileContext;
    qaCards?: Array<{ title?: string | null; summary?: string | null; content?: string | null; timestamp?: number | null }>;
    includeBackground?: boolean;
  }) {
    const existing = await this.prisma.knowledgeDeepAnalysis.findFirst({
      where: { videoId: params.videoId },
      orderBy: { createdAt: 'desc' },
      select: { version: true },
    });
    const version = (existing?.version ?? 0) + 1;

    const draft = await this.prisma.knowledgeDeepAnalysis.create({
      data: {
        videoId: params.videoId,
        assetId: params.assetId ?? null,
        version,
        status: TaskStatus.PROCESSING,
        metadata: {
          includeBackground: Boolean(params.includeBackground),
        },
      },
    });

    try {
      const payload = await this.generatePayload(params);
      return await this.prisma.knowledgeDeepAnalysis.update({
        where: { id: draft.id },
        data: {
          status: TaskStatus.COMPLETED,
          summary: payload.summary,
          chapterGraphJson: payload.chapterGraph as any,
          conceptGraphJson: payload.conceptGraph as any,
          ambiguitiesJson: payload.ambiguities as any,
          backgroundFactsJson: payload.backgroundFacts as any,
          learningRecommendationsJson: payload.learningRecommendations as any,
          sourceDigestJson: payload.sourceDigest as any,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.knowledgeDeepAnalysis.update({
        where: { id: draft.id },
        data: {
          status: TaskStatus.FAILED,
          metadata: {
            ...(draft.metadata as Record<string, unknown> | null),
            error: message,
          },
        },
      });
      throw error;
    }
  }

  private async generatePayload(params: {
    userId: string;
    videoId: string;
    videoTitle: string;
    transcriptSegments: TranscriptSegment[];
    keyframes: KeyframeContext[];
    frameInsights: FrameInsightContext[];
    outlineMarkdown: string;
    userProfile?: UserProfileContext;
    qaCards?: Array<{ title?: string | null; summary?: string | null; content?: string | null; timestamp?: number | null }>;
    includeBackground?: boolean;
  }): Promise<DeepAnalysisPayload> {
    const transcriptSegments = params.transcriptSegments.slice(0, 48).map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: this.truncate(seg.text, 180),
    }));
    const keyframes = params.keyframes.slice(0, 18).map((frame) => ({
      id: frame.id,
      timestamp: frame.timestamp,
      frameType: frame.frameType,
      description: frame.description ?? '',
    }));
    const frameInsights = params.frameInsights.slice(0, 18).map((insight) => ({
      keyframeId: insight.keyframeId,
      timestampSec: insight.timestampSec,
      visualSummary: this.truncate(insight.visualSummary, 220),
      chapterHint: insight.chapterHint ?? '',
      visualType: insight.visualType ?? '',
      ocrText: this.truncate(insight.ocrText ?? '', 180),
      visualEntities: insight.visualEntities ?? [],
    }));
    const qaCards = (params.qaCards ?? []).slice(0, 10).map((card) => ({
      title: card.title ?? '',
      summary: card.summary ?? '',
      content: this.truncate(card.content ?? '', 220),
      timestamp: card.timestamp ?? null,
    }));

    const llm = await this.aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'system',
            content: [
              '你是知识棱镜的二次理解引擎，不是普通摘要器。',
              '你的任务是把一次分析结果提升为稳定的学习资产结构。',
              '输出必须是 JSON 对象，字段必须包含：summary, chapterGraph, conceptGraph, ambiguities, backgroundFacts, learningRecommendations, sourceDigest。',
              'chapterGraph: 数组，每项包含 id,title,summary,startSec,endSec,keyframeIds,conceptIds。',
              'conceptGraph: 数组，每项包含 id,name,summary,chapterIds,importance,prerequisites。',
              'ambiguities: 数组，每项包含 concept,reason,clarification。',
              'backgroundFacts: 数组，每项包含 title,summary,sourceType。若没有外部补充，可给空数组。',
              'learningRecommendations: 数组，每项包含 title,action,reason,priority。',
              'sourceDigest: 对象，包含 transcriptCount,keyframeCount,qaCount,profileMode。',
              '要求：',
              '1) 明确章节主线，不要只重复大纲标题。',
              '2) 结合关键帧洞察解释“为什么这一段重要”。',
              '3) 结合用户画像调整难度和表达方式。',
              '4) 不要输出 markdown 代码块。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                videoTitle: params.videoTitle,
                outlineMarkdown: this.truncate(params.outlineMarkdown, 3000),
                transcriptSegments,
                keyframes,
                frameInsights,
                qaCards,
                userProfile: params.userProfile ?? {},
                includeBackground: Boolean(params.includeBackground),
              },
              null,
              2,
            ),
          },
        ],
        temperature: 0.25,
        maxTokens: 4200,
        responseFormat: { type: 'json_object' },
      },
      params.userId,
    );

    const rawText = this.extractText(llm);
    if (!rawText) {
      throw new Error('二次理解模型未返回内容');
    }

    const parsed = this.parseObject(rawText);
    const summary = this.asText(parsed?.summary);
    if (!summary) {
      throw new Error('二次理解结果缺少 summary');
    }

    return {
      summary,
      chapterGraph: this.ensureObjectArray(parsed?.chapterGraph),
      conceptGraph: this.ensureObjectArray(parsed?.conceptGraph),
      ambiguities: this.ensureObjectArray(parsed?.ambiguities),
      backgroundFacts: this.ensureObjectArray(parsed?.backgroundFacts),
      learningRecommendations: this.ensureObjectArray(parsed?.learningRecommendations),
      sourceDigest: this.ensureObject(parsed?.sourceDigest, {
        transcriptCount: transcriptSegments.length,
        keyframeCount: keyframes.length,
        qaCount: qaCards.length,
        profileMode: this.inferProfileMode(params.userProfile),
      }),
    };
  }

  private extractText(result: any): string {
    const candidates: unknown[] = [
      result?.text,
      result?.content,
      result?.description,
      result?.message?.content,
      result?.result?.text,
      result?.result?.content,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
      if (Array.isArray(candidate)) {
        const joined = candidate
          .map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object' && typeof (part as any).text === 'string') {
              return (part as any).text;
            }
            return '';
          })
          .join('\n')
          .trim();
        if (joined) return joined;
      }
    }
    return '';
  }

  private parseObject(raw: string): Record<string, any> {
    const candidates = [
      raw,
      raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim(),
      raw.replace(/```json/gi, '').replace(/```/g, '').trim(),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, any>;
        }
      } catch {
        // ignore
      }
    }

    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    }

    this.logger.error(`Invalid deep analysis JSON: ${this.truncate(raw, 400)}`);
    throw new Error('二次理解结果不是有效 JSON');
  }

  private ensureObjectArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
  }

  private ensureObject(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return fallback;
    }
    return value as Record<string, unknown>;
  }

  private asText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private inferProfileMode(profile: UserProfileContext | undefined): string {
    if (!profile || typeof profile !== 'object') return 'default';
    const role = typeof profile.role === 'string' ? profile.role : '';
    const level = typeof profile.level === 'string' ? profile.level : '';
    return [role, level].filter(Boolean).join(':') || 'default';
  }

  private truncate(text: string, maxLength: number): string {
    const clean = String(text || '').trim().replace(/\s+/g, ' ');
    if (!clean) return '';
    return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
  }
}
