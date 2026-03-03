import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseProvider } from './base.provider';
import { AITaskType } from '../ai-router.interface';

type VideoStatus = 'InQueue' | 'InProgress' | 'Succeed' | 'Failed' | string;

@Injectable()
export class SeedanceProvider extends BaseProvider {
  name = 'seedance';
  supportedTasks = [
    AITaskType.LLM_CHAT,
    AITaskType.MULTIMODAL,
    AITaskType.IMAGE_GEN,
    AITaskType.VIDEO_GEN,
    AITaskType.TRANSLATION,
  ];
  private readonly logger = new Logger(SeedanceProvider.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    switch (taskType) {
      case AITaskType.LLM_CHAT:
      case AITaskType.MULTIMODAL:
      case AITaskType.TRANSLATION:
        return this.executeChat(taskType, payload, apiKey);

      case AITaskType.IMAGE_GEN:
        return this.executeImageGen(payload, apiKey);

      case AITaskType.VIDEO_GEN:
        return this.executeVideoGen(payload, apiKey);

      default:
        throw new Error(`Seedance does not support ${taskType} yet`);
    }
  }

  private async executeChat(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    const baseUrl = this.resolveBaseUrl();
    const model =
      payload?.model ||
      this.configService.get<string>('SILICONFLOW_MODEL_LLM') ||
      'deepseek-ai/DeepSeek-V3';

    // 构建消息列表
    const messages: any[] = payload?.messages || [];

    // 如果没有 messages，尝试从 payload 构建
    if (messages.length === 0) {
      // 处理不同任务的 payload
      if (taskType === AITaskType.TRANSLATION) {
        messages.push({
          role: 'system',
          content: '你是一个专业的翻译助手。请将提供的文本翻译成目标语言，保持原文的语调和格式。',
        });
        messages.push({
          role: 'user',
          content: `请将以下文本翻译成${payload?.targetLang || '中文'}：\n\n${payload?.text || payload?.content || ''}`,
        });
      } else if (taskType === AITaskType.MULTIMODAL && payload?.imageUrl) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: payload.imageUrl },
            },
            {
              type: 'text',
              text: payload?.prompt || '请分析这张图片',
            },
          ],
        });
      } else {
        // LLM_CHAT 默认处理
        if (payload?.systemPrompt) {
          messages.push({ role: 'system', content: payload.systemPrompt });
        }
        messages.push({
          role: 'user',
          content: payload?.prompt || payload?.content || '',
        });
      }
    }

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      stream: payload?.stream || false,
    };

    if (typeof payload?.temperature === 'number') {
      requestBody.temperature = payload.temperature;
    }
    if (typeof payload?.max_tokens === 'number') {
      requestBody.max_tokens = payload.max_tokens;
    }
    if (typeof payload?.top_p === 'number') {
      requestBody.top_p = payload.top_p;
    }

    this.logger.log(`Calling SiliconFlow chat API, model=${model}, messages=${messages.length}`);

    const response = await this.postJson(
      `${baseUrl}/chat/completions`,
      requestBody,
      apiKey,
    );

    // 提取生成的内容
    const content =
      response?.choices?.[0]?.message?.content ||
      response?.message?.content ||
      '';

    return {
      content,
      usage: response?.usage,
      model: response?.model,
      finishReason: response?.choices?.[0]?.finish_reason,
    };
  }

  private async executeImageGen(payload: any, apiKey: string): Promise<any> {
    const baseUrl = this.resolveBaseUrl();
    const model =
      payload?.model ||
      this.configService.get<string>('SILICONFLOW_MODEL_IMAGE') ||
      'black-forest-labs/FLUX.1-schnell';

    const requestBody: Record<string, unknown> = {
      model,
      prompt: payload?.prompt || '',
      image_size: payload?.image_size || payload?.imageSize || '1024x1024',
      num_inference_steps: payload?.num_inference_steps || payload?.steps || 4,
    };

    if (typeof payload?.seed === 'number') {
      requestBody.seed = payload.seed;
    }
    if (typeof payload?.guidance_scale === 'number') {
      requestBody.guidance_scale = payload.guidance_scale;
    }

    this.logger.log(`Calling SiliconFlow image generation API, model=${model}`);

    const response = await this.postJson(
      `${baseUrl}/images/generations`,
      requestBody,
      apiKey,
    );

    const imageUrl = response?.data?.[0]?.url || response?.images?.[0]?.url || '';
    if (!imageUrl) {
      throw new Error(`SiliconFlow image generation failed: no URL in response`);
    }

    return {
      url: imageUrl,
      imageUrl,
      images: response?.data || response?.images || [],
    };
  }

  private async executeVideoGen(payload: any, apiKey: string): Promise<any> {

    const baseUrl = this.resolveBaseUrl();
    const image = await this.resolveInputImage(payload);
    const model =
      payload?.model ||
      this.configService.get<string>('SILICONFLOW_MODEL_VIDEO') ||
      (image ? 'Wan-AI/Wan2.2-I2V-A14B' : 'Wan-AI/Wan2.2-T2V-A14B');

    const submitBody: Record<string, unknown> = {
      model,
      prompt: payload?.prompt || 'Generate a short cinematic video',
      image_size: payload?.image_size || payload?.imageSize || '1280x720',
    };

    if (image) submitBody.image = image;
    if (payload?.negative_prompt) submitBody.negative_prompt = payload.negative_prompt;
    if (typeof payload?.seed === 'number') submitBody.seed = payload.seed;
    if (typeof payload?.duration === 'number') submitBody.duration = payload.duration;
    if (typeof payload?.fps === 'number') submitBody.fps = payload.fps;

    this.logger.log(`Submitting SiliconFlow video task, model=${String(submitBody.model)}`);
    const submitResult = await this.postJson(`${baseUrl}/video/submit`, submitBody, apiKey);
    const requestId = this.extractRequestId(submitResult);
    if (!requestId) {
      throw new Error(`SiliconFlow video submit response missing requestId: ${JSON.stringify(submitResult)}`);
    }

    const pollIntervalMs = Number(
      payload?.pollIntervalMs || this.configService.get<string>('SEEDANCE_POLL_INTERVAL_MS') || 3000,
    );
    const maxPollAttempts = Number(
      payload?.maxPollAttempts || this.configService.get<string>('SEEDANCE_MAX_POLL_ATTEMPTS') || 80,
    );

    let statusResult: any = null;
    for (let i = 0; i < maxPollAttempts; i++) {
      await this.sleep(pollIntervalMs);
      statusResult = await this.postJson(
        `${baseUrl}/video/status`,
        { requestId },
        apiKey,
      );

      const status = this.extractStatus(statusResult);
      if (this.isSuccessStatus(status)) {
        const videoUrl = this.extractVideoUrl(statusResult);
        if (!videoUrl) {
          throw new Error(`SiliconFlow returned success but no video URL: ${JSON.stringify(statusResult)}`);
        }

        const result: Record<string, unknown> = {
          requestId,
          status,
          video_url: videoUrl,
          url: videoUrl,
          videos:
            statusResult?.results?.videos ||
            statusResult?.data?.results?.videos ||
            statusResult?.result?.videos ||
            [],
        };

        // Backward compatibility: queue render processor expects base64 field "video".
        if (payload?.returnBase64 || payload?.firstFrame || payload?.lastFrame) {
          const binary = await this.downloadBinary(videoUrl);
          result.video = binary.toString('base64');
        }

        return result;
      }

      if (this.isFailedStatus(status)) {
        const reason =
          statusResult?.reason ||
          statusResult?.error ||
          statusResult?.message ||
          statusResult?.data?.reason ||
          'Unknown error';
        throw new Error(`SiliconFlow video generation failed: ${reason}`);
      }
    }

    throw new Error(`SiliconFlow video generation timeout (requestId=${requestId})`);
  }

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const baseUrl = this.resolveBaseUrl();
      const res = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private resolveBaseUrl(): string {
    const raw =
      this.configService.get<string>('SEEDANCE_BASE_URL') ||
      this.configService.get<string>('SILICONFLOW_BASE_URL') ||
      'https://api.siliconflow.cn/v1';

    const trimmed = raw.replace(/\/+$/, '');
    return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
  }

  private async resolveInputImage(payload: any): Promise<string | undefined> {
    const candidate =
      payload?.image ||
      payload?.firstFrame ||
      payload?.firstFrameUrl ||
      payload?.imageUrl;

    if (!candidate || typeof candidate !== 'string') return undefined;

    if (candidate.startsWith('data:image/')) return candidate;

    if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
      if (this.shouldEmbedAsDataUrl(candidate)) {
        try {
          return await this.downloadAsDataUrl(candidate);
        } catch (error) {
          this.logger.warn(`Failed to embed image URL as data URL: ${(error as Error).message}`);
        }
      }
      return candidate;
    }

    // Assume base64 string.
    return `data:image/png;base64,${candidate}`;
  }

  private shouldEmbedAsDataUrl(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
      if (hostname.startsWith('10.')) return true;
      if (hostname.startsWith('192.168.')) return true;
      if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
      return false;
    } catch {
      return false;
    }
  }

  private async downloadAsDataUrl(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download image failed: ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  private async downloadBinary(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download video failed: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private extractRequestId(data: any): string | null {
    return (
      data?.requestId ||
      data?.request_id ||
      data?.id ||
      data?.data?.requestId ||
      data?.data?.request_id ||
      null
    );
  }

  private extractStatus(data: any): VideoStatus {
    return (
      data?.status ||
      data?.data?.status ||
      data?.result?.status ||
      ''
    );
  }

  private extractVideoUrl(data: any): string | null {
    return (
      data?.results?.videos?.[0]?.url ||
      data?.data?.results?.videos?.[0]?.url ||
      data?.result?.videos?.[0]?.url ||
      data?.video_url ||
      data?.url ||
      null
    );
  }

  private isSuccessStatus(status: VideoStatus): boolean {
    return status === 'Succeed' || status === 'SUCCEED' || status === 'COMPLETED';
  }

  private isFailedStatus(status: VideoStatus): boolean {
    return status === 'Failed' || status === 'FAILED' || status === 'ERROR';
  }

  private async postJson(url: string, body: Record<string, unknown>, apiKey: string) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const message = data?.message || data?.error || data?.reason || text;
      throw new Error(`SiliconFlow request failed (${res.status}): ${String(message)}`);
    }

    return data;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
