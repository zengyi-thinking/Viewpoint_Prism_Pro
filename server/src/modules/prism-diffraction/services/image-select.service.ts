import { Injectable, Logger } from '@nestjs/common';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { FfmpegService } from '../../../infrastructure/media/ffmpeg.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import * as path from 'path';
import * as fs from 'fs/promises';

interface FrameQuality {
  timestamp: number;
  imageUrl: string;
  qualityScore: number;
  hasDataChart: boolean;
  hasSpeaker: boolean;
  emotionScore?: number;
  description?: string;
}

@Injectable()
export class ImageSelectService {
  private readonly logger = new Logger(ImageSelectService.name);

  constructor(
    private readonly ffmpeg: FfmpegService,
    private readonly aiRouter: AiRouterService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 从视频中提取关键帧
   * @param videoPath - 视频文件路径
   * @param duration - 视频时长
   * @param count - 提取帧数量（默认 12）
   */
  async extractKeyFrames(
    videoPath: string,
    duration: number,
    count: number = 12,
  ): Promise<FrameQuality[]> {
    // 计算采样间隔（均匀分布）
    const interval = Math.max(Math.floor(duration / count), 3);

    this.logger.log(`Extracting ${count} keyframes from video with ${duration}s at ${interval}s intervals`);

    // 使用 FFmpeg 提取关键帧到临时目录
    const framePaths = await this.ffmpeg.extractFrames(
      videoPath,
      interval,
      count,
    );

    // 上传每帧到 MinIO 并获取可访问的 URL
    const frameUrls: string[] = [];

    for (let i = 0; i < framePaths.length; i++) {
      try {
        const framePath = framePaths[i];
        const filename = `keyframe-${Date.now()}-${i}.jpg`;

        // 读取文件内容
        const fileBuffer = await fs.readFile(framePath);

        // 上传到 MinIO
        const imageUrl = await this.storage.upload(
          fileBuffer,
          `diffraction/keyframes/${filename}`,
          { 'Content-Type': 'image/jpeg' },
        );

        frameUrls.push(imageUrl);

        // 删除临时文件
        await fs.unlink(framePath).catch(() => {});

        this.logger.log(`Uploaded frame ${i + 1}/${frameUrls.length} to storage`);
      } catch (error) {
        this.logger.warn(`Failed to upload frame ${i}: ${error.message}`);
        // 即使上传失败，也删除临时文件
        await fs.unlink(framePaths[i]).catch(() => {});
      }
    }

    // 使用 AI Router MULTIMODAL 分析每帧质量
    const analyzedFrames = await Promise.all(
      frameUrls.map(async (url, index) => {
        try {
          const analysis = await this.aiRouter.execute(
            AITaskType.MULTIMODAL,
            {
              type: 'image_analysis',
              imageUrl: url,
              prompt: '分析这张图片的构图质量、是否有数据图表、讲者表情是否饱满、适合社交平台使用',
            },
            'system',  // 使用系统级 API key
          );

          return {
            timestamp: index * interval,
            imageUrl: url,
            qualityScore: this.calculateQualityScore(analysis),
            hasDataChart: analysis.hasDataChart ?? false,
            hasSpeaker: analysis.hasSpeaker ?? false,
            emotionScore: analysis.emotionScore,
            description: analysis.description,
          };
        } catch (error) {
          this.logger.warn(`Failed to analyze frame ${index}: ${error.message}`);
          return {
            timestamp: index * interval,
            imageUrl: url,
            qualityScore: 0,  // 失败的帧给低分
            hasDataChart: false,
            hasSpeaker: false,
          };
        }
      })
    );

    // 按质量评分排序
    return analyzedFrames.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 6);
  }

  /**
   * 计算综合质量评分
   */
  private calculateQualityScore(analysis: any): number {
    let score = 50; // 基准分

    // 构图质量（权重 30）
    if (analysis.compositionQuality === 'excellent') score += 15;
    if (analysis.compositionQuality === 'good') score += 10;
    if (analysis.compositionQuality === 'fair') score += 5;

    // 数据图表（权重 25%）
    if (analysis.hasDataChart) score += 25;

    // 讲者表情（权重 25%）
    if (analysis.hasSpeaker && analysis.speakerExpression === 'expressive') score += 25;

    // 表情丰富度（权重 20%）
    if (analysis.emotionScore > 70) score += 20;
    if (analysis.emotionScore > 50) score += 10;

    return Math.min(score, 100);
  }
}
