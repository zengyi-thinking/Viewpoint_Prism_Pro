import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseProvider } from './base.provider';
import { AITaskType } from '../ai-router.interface';

type VideoStatus = 'InQueue' | 'InProgress' | 'Succeed' | 'Failed' | string;

@Injectable()
export class SeedanceProvider extends BaseProvider {
  name = 'seedance';
  supportedTasks = [
    AITaskType.ASR,
    AITaskType.LLM_CHAT,
    AITaskType.MULTIMODAL,
    AITaskType.IMAGE_GEN,
    AITaskType.TTS,
    AITaskType.VOICE_CLONE,
    AITaskType.VIDEO_GEN,
    AITaskType.TRANSLATION,
  ];
  private readonly logger = new Logger(SeedanceProvider.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    switch (taskType) {
      case AITaskType.ASR:
        return this.executeASR(payload, apiKey);

      case AITaskType.LLM_CHAT:
      case AITaskType.MULTIMODAL:
      case AITaskType.TRANSLATION:
        return this.executeChat(taskType, payload, apiKey);

      case AITaskType.IMAGE_GEN:
        return this.executeImageGen(payload, apiKey);

      case AITaskType.VIDEO_GEN:
        return this.executeVideoGen(payload, apiKey);

      case AITaskType.TTS:
        return this.executeTTS(payload, apiKey);

      case AITaskType.VOICE_CLONE:
        return this.executeVoiceClone(payload, apiKey);

      default:
        throw new Error(`Seedance does not support ${taskType} yet`);
    }
  }

  private async executeChat(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    const baseUrl = this.resolveBaseUrl();
    const defaultModel =
      taskType === AITaskType.MULTIMODAL
        ? this.configService.get<string>('SILICONFLOW_MODEL_VLM')
        : this.configService.get<string>('SILICONFLOW_MODEL_LLM');
    const model = payload?.model || defaultModel || 'deepseek-ai/DeepSeek-V3';

    const messages: any[] = payload?.messages || [];

    if (messages.length === 0) {
      if (taskType === AITaskType.TRANSLATION) {
        messages.push({
          role: 'system',
          content: '你是一个专业的翻译助手。请将提供的文本翻译成目标语言，保持原文的语调和格式。',
        });
        messages.push({
          role: 'user',
          content: `请将以下文本翻译成${payload?.targetLang || '中文'}：\n\n${payload?.text || payload?.content || ''}`,
        });
      } else if (taskType === AITaskType.MULTIMODAL && (payload?.image || payload?.imageUrl)) {
        const imageUrl = await this.resolveMultimodalImage(payload);
        if (!imageUrl) {
          throw new Error('SiliconFlow multimodal requires a valid image/imageUrl payload');
        }
        this.logger.log(
          `Preparing multimodal image payload as ${imageUrl.startsWith('data:image/') ? 'data_url' : 'remote_url'}`,
        );
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
            {
              type: 'text',
              text: payload?.prompt || '请分析这张图片',
            },
          ],
        });
      } else {
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
    } else if (typeof payload?.maxTokens === 'number') {
      requestBody.max_tokens = payload.maxTokens;
    }
    if (typeof payload?.top_p === 'number') {
      requestBody.top_p = payload.top_p;
    }
    if (payload?.response_format) {
      requestBody.response_format = payload.response_format;
    } else if (payload?.responseFormat) {
      requestBody.response_format = payload.responseFormat;
    }

    this.logger.log(`Calling SiliconFlow chat API, model=${model}, messages=${messages.length}`);

    const response = await this.postJson(
      `${baseUrl}/chat/completions`,
      requestBody,
      apiKey,
    );

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
    const modelCandidates = this.resolveVideoModelCandidates(payload, Boolean(image));

    let submitResult: any = null;
    let selectedModel = '';
    let lastSubmitError: Error | null = null;

    for (const model of modelCandidates) {
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

      this.logger.log(`Submitting SiliconFlow video task, model=${model}`);

      try {
        submitResult = await this.postJson(`${baseUrl}/video/submit`, submitBody, apiKey);
        selectedModel = model;
        break;
      } catch (error: any) {
        lastSubmitError = error instanceof Error ? error : new Error(String(error));

        if (this.isModelNotExistsError(lastSubmitError)) {
          this.logger.warn(`Video model unavailable: ${model}, trying next candidate`);
          continue;
        }

        throw error;
      }
    }

    if (!submitResult) {
      throw (
        lastSubmitError ||
        new Error('SiliconFlow video submit failed: no available model')
      );
    }

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
          model: selectedModel,
          video_url: videoUrl,
          url: videoUrl,
          videos:
            statusResult?.results?.videos ||
            statusResult?.data?.results?.videos ||
            statusResult?.result?.videos ||
            [],
        };

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

  /**
   * 执行 ASR (语音识别)
   * 端点: /v1/audio/transcriptions
   */
  private async executeASR(payload: any, apiKey: string): Promise<any> {
    const baseUrl = this.resolveBaseUrl();
    const model =
      payload?.model ||
      this.configService.get<string>('SILICONFLOW_MODEL_ASR') ||
      'FunAudioLLM/SenseVoiceSmall';

    this.logger.log('Calling SiliconFlow ASR API, audioUrl=' + String((payload?.audioUrl || 'file').substring(0, 50)) + '...');

    try {
      const formData = new FormData();
      if (payload?.audioFile) {
        formData.append('file', payload.audioFile);
      } else if (payload?.audio) {
        const rawAudio = String(payload.audio).trim();
        const dataUrlMatch = rawAudio.match(/^data:([^;]+);base64,(.+)$/);
        const audioBase64 = dataUrlMatch ? dataUrlMatch[2] : rawAudio;
        const mimeType =
          dataUrlMatch?.[1] ||
          (payload?.format ? `audio/${String(payload.format).replace(/^\./, '')}` : 'audio/mpeg');
        const format = String(payload?.format || 'mp3').replace(/^\./, '');
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const arrayBuffer = audioBuffer.buffer.slice(
          audioBuffer.byteOffset,
          audioBuffer.byteOffset + audioBuffer.byteLength,
        ) as ArrayBuffer;
        formData.append('file', new Blob([arrayBuffer], { type: mimeType }), `audio.${format}`);
      } else if (payload?.audioUrl) {
        this.logger.log('Audio URL provided, downloading...');
        const audioBuffer = await this.downloadBinary(payload.audioUrl);
        const arrayBuffer = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer;
        formData.append('file', new Blob([arrayBuffer], { type: 'audio/mpeg' }), 'audio.mp3');
      } else {
        throw new Error('ASR payload missing audioFile/audio/audioUrl');
      }
      formData.append('model', model);
      if (payload?.language && String(payload.language).trim() && payload.language !== 'auto') {
        formData.append('language', String(payload.language).trim());
      }

      const response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `SiliconFlow ASR request failed (${response.status}): ${errText || 'empty body'}`,
        );
      }

      const result = await response.json();

      return {
        text: result?.text || result?.result?.text || '',
        segments: result?.segments || result?.result?.segments || [],
        language: result?.language || result?.result?.language || 'zh',
        duration: result?.duration || result?.result?.duration || 0,
        usage: result?.usage,
        model,
      };
    } catch (error: any) {
      this.logger.error(`SiliconFlow ASR request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 执行 TTS (文字转语音)
   * 端点: /v1/audio/speech
   * 注意: 此 API 返回二进制音频数据，不是 JSON
   */
  private async executeTTS(payload: any, apiKey: string): Promise<any> {
    const baseUrl = this.resolveBaseUrl();

    this.logger.log('Calling SiliconFlow TTS API, text=' + String((payload?.text || '').substring(0, 50)) + '...');

    try {
      const requestBody: Record<string, unknown> = {
        model: 'FunAudioLLM/CosyVoice2-0.5B',
        input: payload?.text || '',
        response_format: payload?.responseFormat || 'mp3',
        sample_rate: payload?.sampleRate || 32000,
        stream: payload?.stream || false,
        speed: payload?.speed || 1,
      };

      // 设置 voice 参数 - 必须提供
      if (payload?.voice && typeof payload.voice === 'string') {
        (requestBody as Record<string, any>).voice = payload.voice;
      } else {
        // 使用默认音色: FunAudioLLM/CosyVoice2-0.5B:anna (女声)
        (requestBody as Record<string, any>).voice = 'FunAudioLLM/CosyVoice2-0.5B:anna';
      }

      if (payload?.emotion && typeof payload.emotion === 'string') {
        (requestBody as Record<string, any>).emotion = payload.emotion;
      }

      // 直接调用 fetch 处理二进制响应
      const res = await fetch(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        throw new Error(`SiliconFlow TTS request failed (${res.status})`);
      }

      // 直接获取二进制音频数据
      const audioBuffer = Buffer.from(await res.arrayBuffer());
      const audioBase64 = audioBuffer.toString('base64');

      return {
        audioUrl: '',
        audioData: audioBase64,
        audio: audioBuffer,
        voice: payload?.voice || 'FunAudioLLM/CosyVoice2-0.5B:anna',
        usage: null,
        model: 'FunAudioLLM/CosyVoice2-0.5B',
      };
    } catch (error: any) {
      this.logger.error(`SiliconFlow TTS request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 执行音色克隆
   * 端点: POST /v1/audio/voice/upload
   */
  private async executeVoiceClone(payload: any, apiKey: string): Promise<any> {
    const baseUrl = this.resolveBaseUrl();

    this.logger.log('Calling SiliconFlow Voice Clone API');

    try {
      const formData = new FormData();

      if (payload?.referenceAudio) {
        formData.append('file', payload.referenceAudio);
      } else if (payload?.referenceAudioUrl) {
        const audioBuffer = await this.downloadBinary(payload.referenceAudioUrl);
        const arrayBuffer = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer;
        formData.append('file', new Blob([arrayBuffer], { type: 'audio/mpeg' }), 'reference_audio.mp3');
      }

      if (payload?.voiceName && typeof payload.voiceName === 'string') {
        formData.append('name', payload.voiceName);
      }
      if (payload?.description && typeof payload.description === 'string') {
        formData.append('description', payload.description);
      }

      const response = await fetch(`${baseUrl}/audio/voice/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`SiliconFlow Voice Clone upload failed (${response.status})`);
      }

      const result = await response.json();

      return {
        voiceId: result?.voice_id || result?.id || '',
        voiceName: payload?.voiceName || 'Custom Voice',
        status: result?.status || 'uploaded',
        usage: result?.usage,
      };
    } catch (error: any) {
      this.logger.error(`SiliconFlow Voice Clone request failed: ${error.message}`);
      throw error;
    }
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
    return `data:image/png;base64,${candidate}`;
  }

  private async resolveMultimodalImage(payload: any): Promise<string | undefined> {
    const image = typeof payload?.image === 'string' ? payload.image.trim() : '';
    const imageUrl = typeof payload?.imageUrl === 'string' ? payload.imageUrl.trim() : '';

    // Multimodal 优先使用 base64，避免云端服务无法访问本地/内网 URL。
    if (image) {
      return this.normalizeImageLikeInput(image, 'image/jpeg');
    }
    if (imageUrl) {
      return this.normalizeImageLikeInput(imageUrl, 'image/jpeg');
    }
    return undefined;
  }

  private async normalizeImageLikeInput(
    value: string,
    defaultMimeType = 'image/jpeg',
  ): Promise<string> {
    const normalized = String(value || '').trim();
    if (!normalized) {
      throw new Error('Empty image payload');
    }

    if (normalized.startsWith('data:image/')) {
      return normalized;
    }

    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      if (this.shouldEmbedAsDataUrl(normalized)) {
        return this.downloadAsDataUrl(normalized);
      }
      return normalized;
    }

    const base64Body = normalized
      .replace(/^data:[^;]+;base64,/i, '')
      .replace(/^base64,/i, '')
      .replace(/\s+/g, '');
    return `data:${defaultMimeType};base64,${base64Body}`;
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

  private resolveVideoModelCandidates(payload: any, hasImage: boolean): string[] {
    const explicitModel =
      typeof payload?.model === 'string' ? payload.model.trim() : '';
    if (explicitModel) return [explicitModel];

    const configuredCommon = this.readConfig('SILICONFLOW_MODEL_VIDEO');
    const configuredI2V = this.readConfig('SILICONFLOW_MODEL_VIDEO_I2V');
    const configuredT2V = this.readConfig('SILICONFLOW_MODEL_VIDEO_T2V');

    const candidates: string[] = [];
    const push = (model?: string) => {
      const normalized = (model || '').trim();
      if (!normalized) return;
      if (!candidates.includes(normalized)) candidates.push(normalized);
    };

    if (hasImage) {
      push(configuredI2V);
      push(this.swapVideoModelFamily(configuredCommon, 'i2v'));
      push(configuredCommon);
      push('Wan-AI/Wan2.2-I2V-A14B');
      push('Wan-AI/Wan2.2-T2V-A14B');
    } else {
      push(configuredT2V);
      push(this.swapVideoModelFamily(configuredCommon, 't2v'));
      push(configuredCommon);
      push('Wan-AI/Wan2.2-T2V-A14B');
      push('Wan-AI/Wan2.2-I2V-A14B');
    }

    return candidates;
  }

  private swapVideoModelFamily(model: string | undefined, target: 'i2v' | 't2v'): string | undefined {
    const normalized = (model || '').trim();
    if (!normalized) return undefined;

    if (target === 'i2v') {
      return normalized.replace(/-T2V-/i, '-I2V-');
    }

    return normalized.replace(/-I2V-/i, '-T2V-');
  }

  private isModelNotExistsError(error: Error): boolean {
    return /Model does not exist/i.test(error.message);
  }

  private readConfig(key: string): string {
    return this.configService.get<string>(key)?.trim() || '';
  }

  private isSuccessStatus(status: VideoStatus): boolean {
    return status === 'Succeed' || status === 'SUCCEED' || status === 'COMPLETED';
  }

  private isFailedStatus(status: VideoStatus): boolean {
    return status === 'Failed' || status === 'FAILED' || status === 'ERROR';
  }

  private async postJson(url: string, body: Record<string, unknown>, apiKey: string): Promise<any> {
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
