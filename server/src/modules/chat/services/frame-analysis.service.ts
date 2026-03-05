import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';

/**
 * 画面分析结果 DTO
 */
export interface FrameAnalysisResult {
  id: string;
  videoId: string;
  timestamp: number;
  description: string;
  imageUrl: string;
  detectedObjects: string[];
  metadata?: Record<string, unknown>;
}

/**
 * 画面分析请求参数
 */
export interface FrameAnalysisRequest {
  userId: string;
  videoId: string;
  timestamp: number;
  frameBase64: string;
}

/**
 * 跳跃区间分析结果
 */
export interface SeekRangeAnalysisResult {
  fromAnalysis: FrameAnalysisResult;
  toAnalysis: FrameAnalysisResult;
  summary: string;
}

/**
 * 画面分析服务
 *
 * 负责分析视频帧的内容，提取视觉信息并提供给对话系统使用
 */
@Injectable()
export class FrameAnalysisService {
  private readonly logger = new Logger(FrameAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  /**
   * 分析单个视频帧
   *
   * @param userId 用户 ID
   * @param videoId 视频 ID
   * @param timestamp 时间戳（秒）
   * @param frameBase64 帧图片的 Base64 编码
   * @returns 画面分析结果
   */
  async analyzeFrame({
    userId,
    videoId,
    timestamp,
    frameBase64,
  }: FrameAnalysisRequest): Promise<FrameAnalysisResult> {
    // 1. 标准化时间戳，避免浮点抖动
    const normalizedTimestamp = Number(Math.max(0, timestamp).toFixed(2));

    // 2. 清理 Base64 前缀（如果是 data URL）
    let imageBase64 = frameBase64;
    if (frameBase64.startsWith('data:')) {
      imageBase64 = frameBase64.split(',')[1] || frameBase64;
    }
    const frameHash = this.computeFrameHash(imageBase64);

    // 3. 检查缓存（同一时间戳 + 同一帧哈希才复用）
    const existing = await this.prisma.frameAnalysis.findUnique({
      where: {
        videoId_timestamp: {
          videoId,
          timestamp: normalizedTimestamp,
        },
      },
    });

    if (existing) {
      const existingHash =
        existing.metadata &&
        typeof existing.metadata === 'object' &&
        'frameHash' in (existing.metadata as Record<string, unknown>)
          ? String((existing.metadata as Record<string, unknown>).frameHash || '')
          : '';

      if (existingHash && existingHash === frameHash) {
        this.logger.log(
          `Using cached frame analysis for video ${videoId} @ ${normalizedTimestamp}s`,
        );
        return this.toDto(existing);
      }

      this.logger.warn(
        `Frame changed at same timestamp (${normalizedTimestamp}s), re-analyzing. oldHash=${existingHash.slice(0, 8)} newHash=${frameHash.slice(0, 8)}`,
      );
    }

    this.logger.log(`Analyzing frame for video ${videoId} @ ${normalizedTimestamp}s`);

    // 4. 构建 AI 分析提示词
    const analysisPrompt = this.buildAnalysisPrompt(timestamp);

    // 5. 调用多模态 AI 进行画面分析
    const llmResult = await this.aiRouter.execute(
      AITaskType.MULTIMODAL,
      {
        prompt: analysisPrompt,
        image: imageBase64,
        temperature: 0.3, // 较低温度确保稳定性
        maxTokens: 600,
      },
      userId,
    );

    const description = this.extractLlmText(llmResult);
    if (!description) {
      const provider = String(llmResult?.provider ?? 'unknown');
      const model = String(llmResult?.model ?? 'unknown');
      throw new Error(`画面分析模型未返回内容(provider=${provider}, model=${model})`);
    }
    const detectedObjects = this.extractDetectedObjects(description);

    // 6. 持久化分析结果（同时间戳存在则更新，避免重复主键冲突）
    const analysis = existing
      ? await this.prisma.frameAnalysis.update({
          where: {
            videoId_timestamp: {
              videoId,
              timestamp: normalizedTimestamp,
            },
          },
          data: {
            description,
            detectedObjects: detectedObjects as any,
            metadata: {
              analyzedAt: new Date().toISOString(),
              aiProvider: llmResult?.provider || 'unknown',
              aiModel: llmResult?.model || 'unknown',
              frameHash,
            } as any,
          },
        })
      : await this.prisma.frameAnalysis.create({
          data: {
            videoId,
            timestamp: normalizedTimestamp,
            description,
            detectedObjects: detectedObjects as any,
            metadata: {
              analyzedAt: new Date().toISOString(),
              aiProvider: llmResult?.provider || 'unknown',
              aiModel: llmResult?.model || 'unknown',
              frameHash,
            },
          },
        });

    this.logger.log(
      `Created frame analysis ${analysis.id} for video ${videoId} @ ${timestamp}s`,
    );

    return {
      id: analysis.id,
      videoId: analysis.videoId,
      timestamp: analysis.timestamp,
      description: analysis.description,
      imageUrl: analysis.imageUrl || frameBase64, // 短期返回 Base64
      detectedObjects,
      metadata: analysis.metadata as Record<string, unknown>,
    };
  }

  private computeFrameHash(base64Data: string): string {
    return createHash('sha1').update(base64Data).digest('hex');
  }

  /**
   * 分析跳跃区间
   *
   * 对起始和结束两帧进行分析，并生成区间总结
   *
   * @param userId 用户 ID
   * @param videoId 视频 ID
   * @param fromTime 起始时间
   * @param fromBase64 起始帧 Base64
   * @param toTime 结束时间
   * @param toBase64 结束帧 Base64
   * @returns 区间分析结果
   */
  async analyzeSeekRange(
    userId: string,
    videoId: string,
    fromTime: number,
    fromBase64: string,
    toTime: number,
    toBase64: string,
  ): Promise<SeekRangeAnalysisResult> {
    this.logger.log(
      `Analyzing seek range for video ${videoId}: ${fromTime}s -> ${toTime}s`,
    );

    // 并行分析两帧
    const [fromAnalysis, toAnalysis] = await Promise.all([
      this.analyzeFrame({
        userId,
        videoId,
        timestamp: fromTime,
        frameBase64: fromBase64,
      }),
      this.analyzeFrame({
        userId,
        videoId,
        timestamp: toTime,
        frameBase64: toBase64,
      }),
    ]);

    // 生成区间总结
    const summaryPrompt = this.buildSeekSummaryPrompt(
      fromAnalysis,
      toAnalysis,
      fromTime,
      toTime,
    );

    const summaryResult = await this.aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.5,
        maxTokens: 300,
      },
      userId,
    );

    const summary = this.extractLlmText(summaryResult);

    this.logger.log(
      `Seek range analysis completed for video ${videoId}: ${fromTime}s -> ${toTime}s`,
    );

    return {
      fromAnalysis,
      toAnalysis,
      summary,
    };
  }

  /**
   * 批量分析区域点击
   *
   * @param userId 用户 ID
   * @param videoId 视频 ID
   * @param clicks 点击位置列表
   * @returns 区域分析结果
   */
  async analyzeRegionClicks(
    userId: string,
    videoId: string,
    clicks: Array<{ x: number; y: number; timestamp: number }>,
    frameBase64: string,
  ): Promise<string> {
    if (clicks.length === 0) {
      return '请先在视频画面上点击至少一个位置';
    }

    this.logger.log(
      `Analyzing region clicks for video ${videoId}: ${clicks.length} clicks`,
    );

    // 构建区域上下文
    const regionContext = clicks
      .map((click, i) => `点击${i + 1}: 位置(${click.x}%, ${click.y}%) @ ${Math.round(click.timestamp)}s`)
      .join('\n');

    const regionPrompt = `用户在视频画面上点击了以下位置：
${regionContext}

请分析：
1. 每个点击位置对应什么画面内容
2. 用户可能想关注什么
3. 基于点击模式，推荐用户返回哪个时间点`;

    const llmResult = await this.aiRouter.execute(
      AITaskType.MULTIMODAL,
      {
        prompt: regionPrompt,
        image: this.extractBase64Data(frameBase64),
        temperature: 0.5,
        maxTokens: 500,
      },
      userId,
    );

    const text = this.extractLlmText(llmResult);
    if (!text) {
      const provider = String(llmResult?.provider ?? 'unknown');
      const model = String(llmResult?.model ?? 'unknown');
      throw new Error(`区域分析模型未返回内容(provider=${provider}, model=${model})`);
    }
    return text;
  }

  private extractLlmText(result: any): string {
    const candidates: unknown[] = [
      result?.text,
      result?.content,
      result?.description,
      result?.message?.content,
      result?.result?.text,
      result?.result?.content,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const text = candidate.trim();
        if (text) return text;
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

  /**
   * 构建画面分析提示词
   */
  private buildAnalysisPrompt(timestamp: number): string {
    return `请详细分析这帧视频画面（时间点: ${Math.round(timestamp)}秒），提供以下信息：

1. **主要元素**：画面中的核心内容（人物、物体、场景）
2. **文字信息**：所有可见的文字内容（字幕、标题、图表文字）
3. **视觉特征**：颜色、光线、构图、风格
4. **技术内容**：代码、公式、图表等专业元素
5. **动作/状态**：人物的表情、动作，或场景的动态
6. **学习价值**：这段内容的教学重点或关键知识点

要求：
- 简洁准确，每点不超过 30 字
- 使用专业术语但通俗易懂
- 识别出的文字需完全准确`;
  }

  /**
   * 构建跳跃区间总结提示词
   */
  private buildSeekSummaryPrompt(
    fromAnalysis: FrameAnalysisResult,
    toAnalysis: FrameAnalysisResult,
    fromTime: number,
    toTime: number,
  ): string {
    return `基于以下两个画面的分析结果，生成一个简洁的跳转区间总结：

起始画面 (${Math.round(fromTime)}s):
${fromAnalysis.description}

结束画面 (${Math.round(toTime)}s):
${toAnalysis.description}

请用 100 字以内总结：
1. 用户从什么内容跳转到了什么内容
2. 可能的跳转原因
3. 建议关注的关键变化`;
  }

  /**
   * 从分析描述中提取识别到的物体
   */
  private extractDetectedObjects(description: string): string[] {
    const objects: string[] = [];

    // 简单的关键词提取模式
    const objectPatterns = [
      { pattern: /人物|讲者|演讲者|讲师|主持人/gi, label: '人物' },
      { pattern: /图表|柱状图|饼图|折线图|数据图/gi, label: '图表' },
      { pattern: /PPT|幻灯片|演示文稿|演示/gi, label: 'PPT' },
      { pattern: /代码|编辑器|终端|console|terminal|IDE/gi, label: '代码' },
      { pattern: /白板|写字板|黑板/gi, label: '白板' },
      { pattern: /字幕|文字|标题|标签/gi, label: '文字' },
      { pattern: /表格|列表|清单/gi, label: '表格' },
    ];

    for (const { pattern, label } of objectPatterns) {
      if (pattern.test(description)) {
        objects.push(label);
      }
    }

    return [...new Set(objects)]; // 去重
  }

  /**
   * 从 Base64 数据中提取纯 Base64 字符串
   */
  private extractBase64Data(data: string): string {
    if (!data.startsWith('data:')) {
      return data;
    }

    const parts = data.split(',');
    if (parts.length === 2) {
      return parts[1];
    }

    return data;
  }

  /**
   * 将数据库记录转换为 DTO
   */
  private toDto(record: {
    id: string;
    videoId: string;
    timestamp: number;
    description: string;
    imageUrl: string | null;
    detectedObjects: unknown | null;
    metadata: unknown | null;
  }): FrameAnalysisResult {
    // 处理 detectedObjects - 可能是字符串（JSON）或已经是数组
    let parsedObjects: string[] = [];
    if (record.detectedObjects) {
      if (typeof record.detectedObjects === 'string') {
        try {
          parsedObjects = JSON.parse(record.detectedObjects) as string[];
        } catch {
          parsedObjects = [];
        }
      } else if (Array.isArray(record.detectedObjects)) {
        parsedObjects = record.detectedObjects as string[];
      }
    }

    return {
      id: record.id,
      videoId: record.videoId,
      timestamp: record.timestamp,
      description: record.description,
      imageUrl: record.imageUrl || '',
      detectedObjects: parsedObjects,
      metadata: record.metadata as Record<string, unknown> | undefined,
    };
  }

  /**
   * 清理过期的分析结果
   * 用于定期清理，减少数据库压力
   */
  async cleanupOldAnalyses(daysToKeep: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.prisma.frameAnalysis.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(
      `Cleaned up ${result.count} old frame analyses (older than ${daysToKeep} days)`,
    );

    return result.count;
  }
}
