import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { FfmpegService } from '../../../infrastructure/media/ffmpeg.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 视频帧中的文字区域检测结果
 */
export interface TextRegion {
  /** 文字内容 */
  text: string;
  /** 文字的边界框 [x1, y1, x2, y2] (归一化坐标 0-1) */
  bbox: [number, number, number, number];
  /** 检测置信度 */
  confidence: number;
}

/**
 * 视频帧修复结果
 */
export interface InpaintingResult {
  /** 原始帧路径 */
  originalFrame: string;
  /** 修复后的帧路径 */
  inpaintedFrame: string;
  /** 检测到的文字区域 */
  textRegions: TextRegion[];
  /** 存储的修复帧 URL */
  storageUrl?: string;
}

/**
 * 视频批量修复结果
 */
export interface BatchInpaintingResult {
  /** 视频文件路径 */
  videoPath: string;
  /** 修复后的视频 URL */
  outputVideoUrl: string;
  /** 处理的帧数 */
  totalFrames: number;
  /** 成功修复的帧数 */
  successfulFrames: number;
  /** 处理的帧结果详情 */
  frameResults: InpaintingResult[];
  /** 处理耗时（毫秒） */
  duration: number;
}

/**
 * 修复配置选项
 */
export interface InpaintingOptions {
  /** 采样间隔（秒） */
  frameInterval?: number;
  /** 是否只处理关键帧（如果可用） */
  keyframesOnly?: boolean;
  /** 多模态模型提示词 */
  detectionPrompt?: string;
  /** 图像生成模型提示词 */
  inpaintPrompt?: string;
  /** 图像生成模型 */
  imageGenModel?: string;
  /** 图像尺寸 */
  imageSize?: string;
  /** 图像种子 */
  seed?: number;
  /** 处理进度回调 */
  onProgress?: (progress: number, currentFrame: number, totalFrames: number) => void;
}

/**
 * 翻译棱镜 - 视频画面文字修复服务
 *
 * 功能：
 * 1. 检测视频帧中的文字区域（使用 AI Router MULTIMODAL）
 * 2. 生成修复图像移除文字（使用 AI Router IMAGE_GEN）
 * 3. 批量处理整个视频的关键帧
 * 4. 使用 FFmpeg 替换视频帧并生成输出
 * 5. 使用 StorageService 存储结果
 */
@Injectable()
export class InpaintingService {
  private readonly logger = new Logger(InpaintingService.name);
  private readonly tempDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly ffmpeg: FfmpegService,
    private readonly storage: StorageService,
    private readonly configService: ConfigService,
  ) {
    this.tempDir = path.join(process.cwd(), 'temp', 'inpainting');
  }

  /**
   * 检测图像中的文字区域
   * @param imagePath - 图像文件路径或 URL
   * @param prompt - 检测提示词
   * @param userId - 用户 ID（用于 BYOK）
   * @returns 检测到的文字区域列表
   */
  async detectTextRegions(
    imagePath: string,
    prompt?: string,
    userId?: string,
  ): Promise<TextRegion[]> {
    const detectionPrompt =
      prompt ||
      this.configService.get<string>('INPAINTING_DETECTION_PROMPT') ||
      '检测并定位画面中所有文字区域的边界框（bounding box）。返回格式为 JSON 数组，每个元素包含 text（文字内容）、bbox（[x1,y1,x2,y2] 归一化坐标）和 confidence（置信度）。';

    this.logger.log(`Detecting text regions in image: ${imagePath}`);

    try {
      const result = await this.aiRouter.execute(
        AITaskType.MULTIMODAL,
        {
          prompt: detectionPrompt,
          image: imagePath,
          imageUrl: imagePath,
        },
        userId || 'system',
      );

      // 解析结果中的文字区域
      const text = result?.description || result?.text || '';
      const regions = this.parseTextRegions(text);

      this.logger.log(`Detected ${regions.length} text regions`);
      return regions;
    } catch (error) {
      this.logger.error(`Failed to detect text regions: ${error.message}`, error.stack);
      throw new Error(`文字区域检测失败: ${error.message}`);
    }
  }

  /**
   * 生成修复图像（移除文字区域）
   * @param imagePath - 原始图像路径或 URL
   * @param textRegions - 要移除的文字区域
   * @param prompt - 修复提示词
   * @param userId - 用户 ID
   * @returns 修复后的图像 base64
   */
  async generateInpaintedImage(
    imagePath: string,
    textRegions: TextRegion[],
    prompt?: string,
    userId?: string,
  ): Promise<Buffer> {
    if (textRegions.length === 0) {
      throw new Error('没有需要移除的文字区域');
    }

    const inpaintPrompt =
      prompt ||
      this.configService.get<string>('INPAINTING_INPAINT_PROMPT') ||
      '保持背景画面自然连贯，移除文字区域并用背景内容填充，确保修复区域与周围环境无缝融合。';

    const imageGenModel =
      this.configService.get<string>('INPAINTING_IMAGE_GEN_MODEL') ||
      'black-forest-labs/FLUX.1-schnell';

    const imageSize =
      this.configService.get<string>('INPAINTING_IMAGE_SIZE') || '1280x720';

    this.logger.log(`Generating inpainted image with ${textRegions.length} regions`);

    try {
      const result = await this.aiRouter.execute(
        AITaskType.IMAGE_GEN,
        {
          prompt: inpaintPrompt,
          image: imagePath,
          imageUrl: imagePath,
          model: imageGenModel,
          image_size: imageSize,
          // 添加文字区域作为 mask 指令
          mask_regions: textRegions.map((region) => ({
            bbox: region.bbox,
            text: region.text,
          })),
        },
        userId || 'system',
      );

      // 返回生成的图像（可能是 base64 或 URL）
      const imageBase64 = result?.image || result?.imageUrl || result?.data?.[0]?.b64_json;

      if (!imageBase64) {
        throw new Error('未收到生成的图像数据');
      }

      // 如果是 base64，转换为 buffer
      if (typeof imageBase64 === 'string') {
        // 移除 data URL 前缀
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        return Buffer.from(base64Data, 'base64');
      }

      // 如果已经是 buffer
      return Buffer.isBuffer(imageBase64) ? imageBase64 : Buffer.from(imageBase64);
    } catch (error) {
      this.logger.error(`Failed to generate inpainted image: ${error.message}`, error.stack);
      throw new Error(`图像修复生成失败: ${error.message}`);
    }
  }

  /**
   * 修复单个视频帧
   * @param framePath - 帧文件路径
   * @param userId - 用户 ID
   * @param projectId - 项目 ID
   * @returns 修复结果
   */
  async inpaintFrame(
    framePath: string,
    userId?: string,
    projectId?: string,
  ): Promise<InpaintingResult> {
    this.logger.log(`Inpainting frame: ${framePath}`);

    await this.ensureTempDir();

    try {
      // 1. 检测文字区域
      const textRegions = await this.detectTextRegions(framePath, undefined, userId);

      if (textRegions.length === 0) {
        this.logger.log(`No text regions detected in frame: ${framePath}`);
        return {
          originalFrame: framePath,
          inpaintedFrame: framePath,
          textRegions: [],
        };
      }

      // 2. 生成修复图像
      const inpaintedBuffer = await this.generateInpaintedImage(
        framePath,
        textRegions,
        undefined,
        userId,
      );

      // 3. 保存修复后的帧
      const inpaintedPath = await this.saveInpaintedFrame(
        framePath,
        inpaintedBuffer,
        userId,
        projectId,
      );

      // 4. 上传到存储
      let storageUrl: string | undefined;
      if (userId && projectId) {
        try {
          const buffer = await fs.readFile(inpaintedPath);
          const storageKey = this.storage.generateStoragePath(
            userId,
            projectId,
            'inpainted-frames',
            path.basename(inpaintedPath),
          );
          storageUrl = await this.storage.upload(buffer, storageKey, {
            'Content-Type': 'image/jpeg',
          });
          this.logger.log(`Uploaded inpainted frame to: ${storageUrl}`);
        } catch (uploadError) {
          this.logger.warn(`Failed to upload inpainted frame: ${uploadError.message}`);
        }
      }

      return {
        originalFrame: framePath,
        inpaintedFrame: inpaintedPath,
        textRegions,
        storageUrl,
      };
    } catch (error) {
      this.logger.error(`Failed to inpaint frame ${framePath}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 批量修复视频的所有关键帧
   * @param videoPath - 视频文件路径
   * @param userId - 用户 ID
   * @param projectId - 项目 ID
   * @param options - 修复配置选项
   * @returns 批量修复结果
   */
  async inpaintVideo(
    videoPath: string,
    userId?: string,
    projectId?: string,
    options?: InpaintingOptions,
  ): Promise<BatchInpaintingResult> {
    const startTime = Date.now();
    const {
      frameInterval = 1.0,
      keyframesOnly = false,
      onProgress,
    } = options || {};

    this.logger.log(
      `Starting batch inpainting for video: ${videoPath}, interval=${frameInterval}s`,
    );

    await this.ensureTempDir();

    try {
      // 1. 获取视频元数据
      const metadata = await this.ffmpeg.getVideoMetadata(videoPath);
      const totalDuration = metadata.duration;
      const totalFrames = Math.floor(totalDuration / frameInterval);

      this.logger.log(
        `Video duration: ${totalDuration}s, total frames to process: ${totalFrames}`,
      );

      // 2. 提取所有需要处理的帧
      const framePaths = await this.extractFramesForInpainting(
        videoPath,
        frameInterval,
        totalFrames,
      );

      // 3. 批量处理每一帧
      const frameResults: InpaintingResult[] = [];
      let successfulFrames = 0;

      for (let i = 0; i < framePaths.length; i++) {
        const framePath = framePaths[i];

        try {
          // 调用进度回调
          if (onProgress) {
            onProgress((i / framePaths.length) * 100, i + 1, framePaths.length);
          }

          this.logger.log(`Processing frame ${i + 1}/${framePaths.length}`);

          // 修复帧
          const result = await this.inpaintFrame(framePath, userId, projectId);
          frameResults.push(result);

          if (result.textRegions.length > 0) {
            successfulFrames++;
          }

          // 添加延迟以避免 API 速率限制
          if (i < framePaths.length - 1) {
            await this.sleep(500);
          }
        } catch (error) {
          this.logger.error(`Failed to process frame ${i + 1}: ${error.message}`);
          // 继续处理下一帧
          frameResults.push({
            originalFrame: framePath,
            inpaintedFrame: framePath,
            textRegions: [],
            storageUrl: undefined,
          });
        }
      }

      // 4. 重组修复后的帧为视频
      const outputVideoPath = await this.reassembleVideo(
        frameResults,
        videoPath,
        metadata,
      );

      // 5. 上传输出视频到存储
      let outputVideoUrl = '';
      if (userId && projectId) {
        try {
          const buffer = await fs.readFile(outputVideoPath);
          const storageKey = this.storage.generateStoragePath(
            userId,
            projectId,
            'inpainted-videos',
            `inpainting-${Date.now()}.mp4`,
          );
          outputVideoUrl = await this.storage.upload(buffer, storageKey, {
            'Content-Type': 'video/mp4',
          });
          this.logger.log(`Uploaded inpainted video to: ${outputVideoUrl}`);
        } catch (uploadError) {
          this.logger.warn(`Failed to upload inpainted video: ${uploadError.message}`);
        }
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `Batch inpainting completed: ${successfulFrames}/${frameResults.length} frames processed in ${duration}ms`,
      );

      return {
        videoPath,
        outputVideoUrl: outputVideoUrl || outputVideoPath,
        totalFrames: frameResults.length,
        successfulFrames,
        frameResults,
        duration,
      };
    } catch (error) {
      this.logger.error(`Batch inpainting failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 清理临时文件
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
      this.logger.log(`Cleaned up temp directory: ${this.tempDir}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup: ${error.message}`, error.stack);
    }
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 解析 AI 返回的文字区域 JSON
   */
  private parseTextRegions(text: string): TextRegion[] {
    try {
      // 尝试直接解析 JSON
      const parsed = JSON.parse(text);

      // 如果是数组，直接使用
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => item.bbox && Array.isArray(item.bbox))
          .map((item) => ({
            text: item.text || '',
            bbox: item.bbox as [number, number, number, number],
            confidence: item.confidence || 0.9,
          }));
      }

      // 如果是包含数组的对象
      if (parsed.regions && Array.isArray(parsed.regions)) {
        return parsed.regions
          .filter((item) => item.bbox && Array.isArray(item.bbox))
          .map((item) => ({
            text: item.text || '',
            bbox: item.bbox as [number, number, number, number],
            confidence: item.confidence || 0.9,
          }));
      }

      // 尝试从文本中提取 JSON 数组
      const jsonMatch = text.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const arrayParsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(arrayParsed)) {
          return arrayParsed
            .filter((item) => item.bbox && Array.isArray(item.bbox))
            .map((item) => ({
              text: item.text || '',
              bbox: item.bbox as [number, number, number, number],
              confidence: item.confidence || 0.9,
            }));
        }
      }

      return [];
    } catch (error) {
      this.logger.warn(`Failed to parse text regions from response: ${text}`);
      return [];
    }
  }

  /**
   * 提取用于修复的视频帧
   */
  private async extractFramesForInpainting(
    videoPath: string,
    interval: number,
    count: number,
  ): Promise<string[]> {
    const outputDir = path.join(this.tempDir, `frames-${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const timestamps: number[] = [];
      for (let i = 0; i < count; i++) {
        timestamps.push(i * interval);
      }

      const ffmpeg = require('fluent-ffmpeg');
      ffmpeg(videoPath)
        .screenshots({
          timestamps,
          filename: 'frame-%i.jpg',
          folder: outputDir,
          size: '1280x720',
        })
        .on('end', () => {
          const frames = timestamps.map(
            (_, i) => path.join(outputDir, `frame-${i + 1}.jpg`),
          );
          this.logger.log(`Extracted ${frames.length} frames for inpainting`);
          resolve(frames);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to extract frames: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * 保存修复后的帧
   */
  private async saveInpaintedFrame(
    originalPath: string,
    buffer: Buffer,
    userId?: string,
    projectId?: string,
  ): Promise<string> {
    const outputDir = path.join(this.tempDir, 'inpainted');
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = Date.now();
    const filename = `inpainted-${timestamp}.jpg`;
    const outputPath = path.join(outputDir, filename);

    await fs.writeFile(outputPath, buffer);
    this.logger.log(`Saved inpainted frame to: ${outputPath}`);

    return outputPath;
  }

  /**
   * 使用修复后的帧重组视频
   */
  private async reassembleVideo(
    frameResults: InpaintingResult[],
    originalVideoPath: string,
    metadata: {
      duration: number;
      width: number;
      height: number;
      fps: number;
    },
  ): Promise<string> {
    const outputDir = path.join(this.tempDir, 'output');
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `inpainting-${Date.now()}.mp4`);

    // 收集所有修复后的帧路径（使用修复后的帧，如果没有则使用原始帧）
    const framePaths = frameResults.map((result) =>
      result.textRegions.length > 0 ? result.inpaintedFrame : result.originalFrame,
    );

    // 使用 FFmpeg 重组视频
    const fps = metadata.fps || 25;
    const frameDuration = 1 / fps;

    return new Promise((resolve, reject) => {
      const ffmpeg = require('fluent-ffmpeg');

      // 从帧序列创建视频
      let command = ffmpeg();

      // 添加所有帧作为输入
      framePaths.forEach((framePath) => {
        command = command.addInput(framePath);
      });

      // 使用 filter_complex 将所有帧连接起来
      const filterInputs = framePaths.map((_, i) => `[${i}:v]`).join('');
      const filterComplex = `${filterInputs}concat=n=${framePaths.length}:v=1:a=0[out]`;

      command
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[out]',
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-r', String(fps),
        ])
        .save(outputPath)
        .on('end', () => {
          this.logger.log(`Reassembled video from ${framePaths.length} frames: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          this.logger.error(`Failed to reassemble video: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * 确保临时目录存在
   */
  private async ensureTempDir(): Promise<void> {
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  /**
   * 延迟执行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
