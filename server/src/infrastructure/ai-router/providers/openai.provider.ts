import { Injectable, Logger } from '@nestjs/common';
import { BaseProvider } from './base.provider';
import { AITaskType } from '../ai-router.interface';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  supportedTasks = [
    AITaskType.LLM_CHAT,
    AITaskType.MULTIMODAL,
    AITaskType.IMAGE_GEN,
    AITaskType.VIDEO_GEN,
    AITaskType.TTS,
  ];
  private readonly logger = new Logger(OpenAIProvider.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    const openai = new OpenAI({
      apiKey,
      baseURL: this.resolveBaseUrl(payload?.baseUrl),
    });

    try {
      switch (taskType) {
        case AITaskType.LLM_CHAT:
          return await this.chat(openai, payload);
        case AITaskType.MULTIMODAL:
          return await this.multimodal(openai, payload);
        case AITaskType.IMAGE_GEN:
          return await this.generateImage(openai, payload);
        case AITaskType.VIDEO_GEN:
          return await this.generateVideo(payload, apiKey);
        case AITaskType.TTS:
          return await this.textToSpeech(openai, payload);
        default:
          throw new Error(`Unsupported task type: ${taskType}`);
      }
    } catch (error) {
      this.logger.error(`OpenAI API error for ${taskType}: ${error.message}`);
      throw error;
    }
  }

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const openai = new OpenAI({
        apiKey,
        baseURL: this.resolveBaseUrl(),
      });
      const response = await openai.models.list();
      return response.data.length > 0;
    } catch {
      return false;
    }
  }

  private async chat(openai: OpenAI, payload: any) {
    const {
      messages,
      model =
        this.configService.get<string>('CREATION_AI_CHAT_MODEL') ||
        this.configService.get<string>('OPENAI_MODEL_CHAT') ||
        this.configService.get<string>('SILICONFLOW_MODEL_LLM') ||
        'gpt-4o',
      temperature = 0.7,
      maxTokens = 2000,
    } = payload;

    const response = await openai.chat.completions.create({
      model,
      messages: messages || [{ role: 'user', content: payload.prompt || 'Hello' }],
      temperature,
      max_tokens: maxTokens,
      ...(payload?.response_format ? { response_format: payload.response_format } : {}),
    });

    return {
      text: response.choices[0]?.message?.content || '',
      usage: response.usage,
      model: response.model,
    };
  }

  private async multimodal(openai: OpenAI, payload: any) {
    const {
      prompt,
      image,
      imageUrl,
      model =
        this.configService.get<string>('CREATION_AI_VISION_MODEL') ||
        this.configService.get<string>('OPENAI_MODEL_VISION') ||
        this.configService.get<string>('SILICONFLOW_MODEL_VLM') ||
        'gpt-4o',
    } = payload;

    // Build content array with text and image
    const content: any[] = [
      { type: 'text', text: prompt },
    ];

    // Add image if provided (base64 or URL)
    // Prefer base64 image payload; localhost URLs are unreachable from cloud providers.
    const finalImage = image || imageUrl;
    if (finalImage) {
      if (finalImage.startsWith('http')) {
        content.push({ type: 'image_url', image_url: { url: finalImage } });
      } else {
        // Base64 image
        content.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${finalImage}` },
        });
      }
    }

    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content }] as any,
      max_tokens: 1000,
    });

    return {
      description: response.choices[0]?.message?.content || '',
      usage: response.usage,
      confidence: 0.9,
    };
  }

  private async generateImage(openai: OpenAI, payload: any) {
    const {
      prompt,
      model =
        this.configService.get<string>('CREATION_AI_IMAGE_MODEL') ||
        this.configService.get<string>('OPENAI_MODEL_DALLE') ||
        this.configService.get<string>('SILICONFLOW_MODEL_IMAGE') ||
        'dall-e-3',
      size = '1024x1024',
      quality = 'standard',
    } = payload;

    const response = await openai.images.generate({
      model,
      prompt,
      size,
      quality,
      n: 1,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No image data returned');
    }

    const imageData = response.data[0];

    return {
      imageUrl: imageData.url || null,
      revisedPrompt: imageData.revised_prompt || null,
    };
  }

  private async textToSpeech(openai: OpenAI, payload: any) {
    const {
      text,
      model =
        this.configService.get<string>('CREATION_AI_TTS_MODEL') ||
        this.configService.get<string>('OPENAI_MODEL_TTS') ||
        this.configService.get<string>('SILICONFLOW_MODEL_TTS') ||
        'tts-1',
      voice = 'alloy',
    } = payload;

    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text,
    });

    // Convert buffer to base64
    const buffer = Buffer.from(await response.arrayBuffer());
    const audioBase64 = buffer.toString('base64');

    return {
      audio: audioBase64,
      format: 'mp3',
    };
  }

  private async generateVideo(payload: any, apiKey: string) {
    const baseUrl = this.resolveBaseUrl(payload?.baseUrl);
    const model =
      payload?.model ||
      this.configService.get<string>('CREATION_AI_VIDEO_MODEL') ||
      'chat_fast_video';
    const firstFrame = await this.resolveVideoImage(payload?.firstFrame || payload?.image || payload?.imageUrl);
    const isVeoModel = /veo/i.test(model);
    const prompt = payload?.prompt || 'Generate a short cinematic video';
    const imageSize = payload?.image_size || payload?.imageSize || payload?.size || '1280x720';

    const submitResponse = await fetch(
      `${baseUrl}/video/generations`,
      isVeoModel
        ? {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            body: this.buildVeoFormData({
              model,
              prompt,
              imageSize,
              firstFrame,
              duration: payload?.duration,
              fps: payload?.fps,
              negativePrompt: payload?.negative_prompt,
              seed: payload?.seed,
            }),
          }
        : {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              prompt,
              image_size: imageSize,
              ...(typeof payload?.duration === 'number' ? { duration: payload.duration } : {}),
              ...(typeof payload?.fps === 'number' ? { fps: payload.fps } : {}),
              ...(payload?.negative_prompt ? { negative_prompt: payload.negative_prompt } : {}),
              ...(typeof payload?.seed === 'number' ? { seed: payload.seed } : {}),
              ...(firstFrame ? { image: firstFrame } : {}),
            }),
          },
    );

    const submitText = await submitResponse.text();
    const submitResult = this.safeParseJson(submitText);
    if (!submitResponse.ok) {
      throw new Error(
        `OpenAI video submit failed (${submitResponse.status}): ${this.stringifyError(submitResult, submitText)}`,
      );
    }

    const taskId = this.extractVideoTaskId(submitResult);
    if (!taskId) {
      throw new Error(`OpenAI video submit response missing task id: ${submitText}`);
    }

    const pollIntervalMs = Number(payload?.pollIntervalMs || this.configService.get<string>('CREATION_AI_VIDEO_POLL_INTERVAL_MS') || 4000);
    const maxPollAttempts = Number(payload?.maxPollAttempts || this.configService.get<string>('CREATION_AI_VIDEO_MAX_POLL_ATTEMPTS') || 90);

    let finalResult: any = submitResult;
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      const immediateUrl = this.extractVideoUrl(finalResult);
      if (immediateUrl) {
        return await this.buildVideoResult(taskId, model, finalResult, immediateUrl);
      }

      await this.sleep(pollIntervalMs);
      const statusResponse = await fetch(`${baseUrl}/video/generations/${taskId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      const statusText = await statusResponse.text();
      finalResult = this.safeParseJson(statusText);

      if (!statusResponse.ok) {
        throw new Error(
          `OpenAI video poll failed (${statusResponse.status}): ${this.stringifyError(finalResult, statusText)}`,
        );
      }

      const status = this.extractVideoStatus(finalResult);
      const videoUrl = this.extractVideoUrl(finalResult);
      if (videoUrl || this.isVideoSuccessStatus(status)) {
        if (!videoUrl) {
          throw new Error(`OpenAI video generation succeeded but no URL returned: ${statusText}`);
        }
        return await this.buildVideoResult(taskId, model, finalResult, videoUrl);
      }
      if (this.isVideoFailureStatus(status)) {
        throw new Error(`OpenAI video generation failed: ${this.stringifyError(finalResult, statusText)}`);
      }
    }

    throw new Error(`OpenAI video generation timeout (taskId=${taskId})`);
  }

  private async buildVideoResult(taskId: string, model: string, raw: any, videoUrl: string) {
    const videoBuffer = await this.downloadBinary(videoUrl);
    return {
      taskId,
      model,
      status: this.extractVideoStatus(raw),
      url: videoUrl,
      video_url: videoUrl,
      video: videoBuffer.toString('base64'),
      raw,
    };
  }

  private resolveBaseUrl(override?: string) {
    const raw =
      (typeof override === 'string' ? override.trim() : '') ||
      this.configService.get<string>('CREATION_AI_BASE_URL') ||
      this.configService.get<string>('OPENAI_BASE_URL') ||
      this.configService.get<string>('SILICONFLOW_BASE_URL') ||
      this.configService.get<string>('OPENAI_PREMIUM_BASE_URL') ||
      'https://api.openai.com/v1';
    return raw.replace(/\/+$/, '');
  }

  private async resolveVideoImage(input?: string) {
    const value = String(input || '').trim();
    if (!value) return undefined;
    if (value.startsWith('data:image/')) return value;
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    return `data:image/png;base64,${value}`;
  }

  private safeParseJson(text: string) {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { raw: text };
    }
  }

  private stringifyError(data: any, fallback: string) {
    return (
      data?.error?.message ||
      data?.message ||
      data?.msg ||
      data?.code ||
      fallback
    );
  }

  private extractVideoTaskId(data: any): string | null {
    return (
      data?.id ||
      data?.task_id ||
      data?.taskId ||
      data?.data?.id ||
      data?.data?.task_id ||
      data?.data?.taskId ||
      null
    );
  }

  private extractVideoStatus(data: any): string {
    return String(
      data?.status ||
      data?.state ||
      data?.task_status ||
      data?.data?.status ||
      data?.data?.state ||
      data?.data?.task_status ||
      data?.data?.data?.status ||
      data?.data?.data?.state ||
      '',
    ).toLowerCase();
  }

  private isVideoSuccessStatus(status: string) {
    return ['succeeded', 'success', 'completed', 'done'].includes(status);
  }

  private isVideoFailureStatus(status: string) {
    return ['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status);
  }

  private extractVideoUrl(data: any): string | null {
    return (
      data?.url ||
      data?.video_url ||
      data?.videoUrl ||
      data?.data?.url ||
      data?.data?.video_url ||
      data?.data?.videoUrl ||
      data?.data?.output?.url ||
      data?.data?.data?.url ||
      data?.data?.data?.video_url ||
      data?.output?.url ||
      data?.results?.videos?.[0]?.url ||
      data?.data?.results?.videos?.[0]?.url ||
      null
    );
  }

  private buildVeoFormData(input: {
    model: string;
    prompt: string;
    imageSize: string;
    firstFrame?: string;
    duration?: number;
    fps?: number;
    negativePrompt?: string;
    seed?: number;
  }) {
    const form = new FormData();
    form.append('model', input.model);
    form.append('prompt', input.prompt);

    // Veo 对提交参数更敏感，保守起见仅传明确验证过的字段。
    if (input.firstFrame) {
      form.append('image', input.firstFrame);
    }
    if (typeof input.duration === 'number') {
      form.append('seconds', String(input.duration));
    }

    return form;
  }

  private async downloadBinary(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download generated video failed (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
