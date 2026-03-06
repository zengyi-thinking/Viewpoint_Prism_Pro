import { Injectable, Logger } from '@nestjs/common';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { PrismaService } from '../../../prisma/prisma.service';

type FrameInsightInput = {
  userId: string;
  videoId: string;
  keyframeId: string;
  timestampSec: number;
  imageBase64: string;
  imageUrl?: string | null;
  frameType?: string | null;
  keyframeDescription?: string | null;
  transcriptWindow: Array<{
    start: number;
    end: number;
    text: string;
  }>;
};

type FrameInsightResult = {
  ocrText?: string | null;
  visualSummary: string;
  chapterHint?: string | null;
  chartType?: string | null;
  visualType?: string | null;
  formulaSignals?: string[];
  codeSignals?: string[];
  visualEntities?: string[];
  confidence?: number | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class FrameInsightService {
  private readonly logger = new Logger(FrameInsightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  async generateAndStore(input: FrameInsightInput) {
    const insight = await this.generateInsight(input);

    return this.prisma.frameInsight.upsert({
      where: { keyframeId: input.keyframeId },
      update: {
        timestampSec: input.timestampSec,
        ocrText: insight.ocrText ?? null,
        visualSummary: insight.visualSummary,
        chapterHint: insight.chapterHint ?? null,
        chartType: insight.chartType ?? null,
        visualType: insight.visualType ?? null,
        formulaSignals: insight.formulaSignals ?? [],
        codeSignals: insight.codeSignals ?? [],
        visualEntities: insight.visualEntities ?? [],
        confidence: insight.confidence ?? null,
        metadata: (insight.metadata ?? {}) as any,
      },
      create: {
        videoId: input.videoId,
        keyframeId: input.keyframeId,
        timestampSec: input.timestampSec,
        ocrText: insight.ocrText ?? null,
        visualSummary: insight.visualSummary,
        chapterHint: insight.chapterHint ?? null,
        chartType: insight.chartType ?? null,
        visualType: insight.visualType ?? null,
        formulaSignals: insight.formulaSignals ?? [],
        codeSignals: insight.codeSignals ?? [],
        visualEntities: insight.visualEntities ?? [],
        confidence: insight.confidence ?? null,
        metadata: (insight.metadata ?? {}) as any,
      },
    });
  }

  private async generateInsight(input: FrameInsightInput): Promise<FrameInsightResult> {
    const transcriptWindow = input.transcriptWindow
      .slice(0, 8)
      .map((seg) => ({
        start: seg.start,
        end: seg.end,
        text: this.truncate(seg.text, 180),
      }));

    const result = await this.aiRouter.execute(
      AITaskType.MULTIMODAL,
      {
        prompt: [
          '你是知识棱镜的关键帧洞察引擎。',
          '请结合图片内容、帧类型提示和相邻转写片段，输出一个 JSON 对象。',
          '字段要求：ocrText, visualSummary, chapterHint, chartType, visualType, formulaSignals, codeSignals, visualEntities, confidence。',
          '要求：',
          '1) visualSummary 必须是中文，解释这一帧为什么重要。',
          '2) chapterHint 应是适合大纲章节的短标题。',
          '3) visualType 只能取 PPT / WHITEBOARD / CHART / CODE / SPEAKER / SCENE_CHANGE / MIXED。',
          '4) formulaSignals、codeSignals、visualEntities 必须是数组。',
          '5) confidence 为 0 到 1。',
          '6) 不要输出 markdown 代码块。',
          '',
          `frameTypeHint: ${input.frameType ?? 'unknown'}`,
          `keyframeDescriptionHint: ${input.keyframeDescription ?? ''}`,
          `timestampSec: ${input.timestampSec}`,
          `transcriptWindow: ${JSON.stringify(transcriptWindow)}`,
        ].join('\n'),
        image: input.imageBase64,
        imageUrl: input.imageUrl ?? undefined,
      },
      input.userId,
    );

    const rawText = this.extractText(result);
    if (!rawText) {
      throw new Error('关键帧洞察模型未返回内容');
    }

    const parsed = this.parseObject(rawText);
    const visualSummary =
      this.asText(parsed?.visualSummary) ||
      this.asText(parsed?.summary) ||
      this.asText(parsed?.description) ||
      this.truncate(rawText, 600);

    if (!visualSummary) {
      throw new Error('关键帧洞察模型未返回有效摘要');
    }

    return {
      ocrText: this.asText(parsed?.ocrText) || null,
      visualSummary,
      chapterHint: this.asText(parsed?.chapterHint) || null,
      chartType: this.asText(parsed?.chartType) || null,
      visualType: this.asText(parsed?.visualType) || input.frameType || null,
      formulaSignals: this.asStringArray(parsed?.formulaSignals),
      codeSignals: this.asStringArray(parsed?.codeSignals),
      visualEntities: this.asStringArray(parsed?.visualEntities),
      confidence: this.asConfidence(parsed?.confidence),
      metadata: {
        keyframeDescriptionHint: input.keyframeDescription ?? null,
      },
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
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, any>;
        }
      } catch {
        // ignore
      }
    }

    this.logger.warn(`Frame insight JSON parse fallback: ${this.truncate(raw, 300)}`);
    return {};
  }

  private asText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, 12);
  }

  private asConfidence(value: unknown): number | null {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.min(1, num));
  }

  private truncate(text: string, maxLength: number): string {
    const clean = String(text || '').trim().replace(/\s+/g, ' ');
    if (!clean) return '';
    return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
  }
}
