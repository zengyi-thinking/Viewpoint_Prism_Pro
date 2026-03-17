import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseProvider } from './base.provider';
import { AITaskType } from '../ai-router.interface';
import OpenAI from 'openai';

@Injectable()
export class GeminiProvider extends BaseProvider {
  name = 'gemini';
  supportedTasks = [
    AITaskType.ASR,
    AITaskType.LLM_CHAT,
    AITaskType.MULTIMODAL,
    AITaskType.IMAGE_GEN,
    AITaskType.TTS,
    AITaskType.TRANSLATION,
  ];
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    const client = new OpenAI({
      apiKey,
      baseURL: this.resolveBaseUrl(payload?.baseUrl),
    });

    try {
      switch (taskType) {
        case AITaskType.ASR:
          return await this.asr(payload, apiKey);
        case AITaskType.LLM_CHAT:
          return await this.chat(client, payload);
        case AITaskType.MULTIMODAL:
          return await this.multimodal(client, payload);
        case AITaskType.IMAGE_GEN:
          return await this.imageGen(payload, apiKey);
        case AITaskType.TTS:
          return await this.tts(payload, apiKey);
        case AITaskType.TRANSLATION:
          return await this.translate(client, payload);
        default:
          throw new Error(`Unsupported Gemini task type: ${taskType}`);
      }
    } catch (error: any) {
      const wrapped = this.wrapNetworkError(error);
      this.logger.error(`Gemini API error for ${taskType}: ${wrapped.message}`);
      throw wrapped;
    }
  }

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const client = new OpenAI({
        apiKey,
        baseURL: this.resolveBaseUrl(),
      });
      const response = await client.models.list();
      return Array.isArray(response.data) && response.data.length > 0;
    } catch {
      return false;
    }
  }

  private async chat(client: OpenAI, payload: any) {
    const {
      messages,
      prompt,
      temperature = 0.4,
      maxTokens = 1600,
      model = payload?.model || this.configService.get<string>('GEMINI_MODEL_CHAT') || 'gemini-2.5-flash',
    } = payload || {};

    const response = await client.chat.completions.create({
      model,
      messages:
        messages && messages.length > 0 ? messages : [{ role: 'user', content: prompt || 'Hello' }],
      temperature,
      max_tokens: maxTokens,
      ...(payload?.response_format ? { response_format: payload.response_format } : {}),
    });

    const text = response.choices?.[0]?.message?.content || '';

    return {
      text,
      content: text,
      usage: response.usage,
      model: response.model,
      finishReason: response.choices?.[0]?.finish_reason,
    };
  }

  private async translate(client: OpenAI, payload: any) {
    const sourceLang = String(payload?.sourceLang || 'auto');
    const targetLang = String(payload?.targetLang || 'zh-CN');
    const text = String(payload?.text || payload?.content || '');
    const model =
      payload?.model ||
      this.configService.get<string>('GEMINI_MODEL_TRANSLATION') ||
      this.configService.get<string>('GEMINI_MODEL_CHAT') ||
      'gemini-2.5-flash';

    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content:
            '你是专业翻译引擎。直接返回译文，不要解释，不要加引号，不要添加额外内容。',
        },
        {
          role: 'user',
          content: `请把以下文本从 ${sourceLang} 翻译到 ${targetLang}：\n${text}`,
        },
      ],
    });

    const translated = String(response.choices?.[0]?.message?.content || '').trim();
    return {
      text: translated,
      translation: translated,
      model: response.model,
      usage: response.usage,
    };
  }

  private async multimodal(client: OpenAI, payload: any) {
    const prompt = String(payload?.prompt || '请分析这张图片');
    const image = payload?.image || payload?.imageUrl;
    const model =
      payload?.model ||
      this.configService.get<string>('GEMINI_MODEL_VISION') ||
      this.configService.get<string>('GEMINI_MODEL_CHAT') ||
      'gemini-2.5-flash';

    if (!image || typeof image !== 'string') {
      throw new Error('Gemini multimodal requires image or imageUrl');
    }

    const normalizedImage = await this.normalizeImageInput(image);
    const content: any[] = [{ type: 'text', text: prompt }];

    if (normalizedImage.startsWith('data:image/')) {
      content.push({ type: 'image_url', image_url: { url: normalizedImage } });
    } else {
      content.push({ type: 'image_url', image_url: { url: normalizedImage } });
    }

    const response = await client.chat.completions.create({
      model,
      max_tokens: 1200,
      temperature: 0.2,
      messages: [{ role: 'user', content }] as any,
    });

    const description = String(response.choices?.[0]?.message?.content || '').trim();
    return {
      description,
      text: description,
      content: description,
      model: response.model,
      usage: response.usage,
      confidence: 0.9,
    };
  }

  private async asr(payload: any, apiKey: string) {
    const model =
      payload?.model ||
      this.configService.get<string>('GEMINI_MODEL_ASR') ||
      this.configService.get<string>('GEMINI_MODEL_CHAT') ||
      'gemini-2.5-flash';

    const audio = await this.resolveAudioInput(payload);
    if (!audio) {
      throw new Error('Gemini ASR requires audioUrl or audio(base64)');
    }

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text:
                '请把这段音频转写成文本，并输出 JSON：{"text":"完整转写","segments":[{"start":0,"end":0,"text":"片段"}]}。若无法分段，segments 也要返回空数组。',
            },
            {
              inline_data: {
                mime_type: audio.mimeType,
                data: audio.base64,
              },
            },
          ],
        },
      ],
      generation_config: {
        response_mime_type: 'application/json',
      },
    };

    const data = await this.postNativeGenerateContent(model, requestBody, apiKey);
    const textPart = this.extractTextFromNativeResponse(data);
    const parsed = this.tryParseJson(textPart);

    if (parsed && typeof parsed === 'object') {
      const outputText = String((parsed as any).text || textPart || '').trim();
      const rawSegments = Array.isArray((parsed as any).segments) ? (parsed as any).segments : [];
      const segments = rawSegments
        .map((seg: any) => ({
          start: Number(seg?.start ?? 0),
          end: Number(seg?.end ?? 0),
          text: String(seg?.text ?? '').trim(),
        }))
        .filter((seg: any) => seg.text.length > 0);

      return {
        text: outputText,
        segments,
        language: String((parsed as any).language || 'auto'),
        model,
      };
    }

    return {
      text: textPart.trim(),
      segments: [],
      language: 'auto',
      model,
    };
  }

  private async imageGen(payload: any, apiKey: string) {
    const model =
      payload?.model ||
      this.configService.get<string>('GEMINI_MODEL_IMAGE') ||
      'gemini-2.5-flash-image';
    const prompt = String(payload?.prompt || 'Generate an image');

    const parts: any[] = [{ text: prompt }];
    const sourceImage = payload?.image || payload?.imageUrl;
    if (sourceImage && typeof sourceImage === 'string') {
      const normalized = await this.normalizeImageInput(sourceImage);
      const inline = await this.toInlineData(normalized, 'image/jpeg');
      parts.push({
        inline_data: {
          mime_type: inline.mimeType,
          data: inline.base64,
        },
      });
    }

    const requestBody = {
      contents: [{ parts }],
      generation_config: {
        response_modalities: ['TEXT', 'IMAGE'],
      },
    };

    const data = await this.postNativeGenerateContent(model, requestBody, apiKey, payload?.baseUrl);
    const generatedImage = this.extractInlineImageFromNativeResponse(data);
    if (!generatedImage) {
      const textFallback = this.extractTextFromNativeResponse(data);
      throw new Error(`Gemini image generation returned no image data: ${textFallback || 'empty response'}`);
    }

    const imageUrl = `data:${generatedImage.mimeType};base64,${generatedImage.base64}`;
    return {
      url: imageUrl,
      imageUrl,
      images: [{ url: imageUrl }],
      model,
    };
  }

  private async tts(payload: any, apiKey: string) {
    const model =
      payload?.model ||
      this.configService.get<string>('GEMINI_MODEL_TTS') ||
      'gemini-2.5-flash-preview-tts';
    const text = String(payload?.text || payload?.input || '').trim();
    if (!text) {
      throw new Error('Gemini TTS requires text');
    }

    const voiceName = String(payload?.voice || payload?.voiceName || 'Kore');
    const requestBody = {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      },
    };

    const data = await this.postNativeGenerateContent(model, requestBody, apiKey, payload?.baseUrl);
    const audio = this.extractInlineAudioFromNativeResponse(data);
    if (!audio) {
      throw new Error('Gemini TTS returned no audio data');
    }

    const pcmBuffer = Buffer.from(audio.base64, 'base64');
    const wavBuffer = this.wrapPcmAsWav(pcmBuffer, 24000, 1, 16);

    return {
      audio: wavBuffer,
      audioData: wavBuffer.toString('base64'),
      format: 'wav',
      mimeType: 'audio/wav',
      voice: voiceName,
      model,
    };
  }

  private resolveBaseUrl(override?: string) {
    const raw =
      (typeof override === 'string' ? override.trim() : '') ||
      this.configService.get<string>('GEMINI_BASE_URL') ||
      'https://generativelanguage.googleapis.com/v1beta/openai';
    return raw.replace(/\/+$/, '');
  }

  private resolveNativeBaseUrl(override?: string) {
    const fromOpenAICompat = this.resolveBaseUrl(override).replace(/\/openai\/?$/, '');
    const direct = this.configService.get<string>('GEMINI_NATIVE_BASE_URL');
    if (direct && direct.trim()) {
      return direct.trim().replace(/\/+$/, '');
    }
    return fromOpenAICompat;
  }

  private async normalizeImageInput(value: string): Promise<string> {
    if (value.startsWith('data:image/')) return value;

    if (value.startsWith('http://') || value.startsWith('https://')) {
      if (this.shouldEmbedAsDataUrl(value)) {
        try {
          return await this.downloadAsDataUrl(value);
        } catch (error: any) {
          this.logger.warn(`Failed to embed multimodal image as data URL: ${error?.message || error}`);
        }
      }
      return value;
    }

    return `data:image/jpeg;base64,${value}`;
  }

  private shouldEmbedAsDataUrl(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
      if (hostname.startsWith('10.')) return true;
      if (hostname.startsWith('192.168.')) return true;
      return /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    } catch {
      return false;
    }
  }

  private async downloadAsDataUrl(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download image failed: ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  private async resolveAudioInput(
    payload: any,
  ): Promise<{ base64: string; mimeType: string } | null> {
    const audioBase64 = payload?.audio;
    if (typeof audioBase64 === 'string' && audioBase64.trim()) {
      if (audioBase64.startsWith('data:audio/')) {
        const matches = audioBase64.match(/^data:([^;]+);base64,(.*)$/);
        if (matches?.[1] && matches?.[2]) {
          return { mimeType: matches[1], base64: matches[2] };
        }
      }

      return {
        mimeType: String(payload?.audioMimeType || 'audio/mpeg'),
        base64: audioBase64.trim(),
      };
    }

    const audioUrl = payload?.audioUrl;
    if (typeof audioUrl === 'string' && audioUrl.trim()) {
      const res = await fetch(audioUrl.trim());
      if (!res.ok) {
        throw new Error(`Download audio failed: ${res.status}`);
      }
      const contentType = res.headers.get('content-type') || this.guessAudioMimeType(audioUrl);
      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        mimeType: contentType || 'audio/mpeg',
        base64: buffer.toString('base64'),
      };
    }

    return null;
  }

  private guessAudioMimeType(url: string) {
    const lower = url.toLowerCase();
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.m4a')) return 'audio/mp4';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    if (lower.endsWith('.flac')) return 'audio/flac';
    return 'audio/mpeg';
  }

  private async toInlineData(
    input: string,
    defaultMimeType: string,
  ): Promise<{ base64: string; mimeType: string }> {
    if (input.startsWith('data:')) {
      const matches = input.match(/^data:([^;]+);base64,(.*)$/);
      if (matches?.[1] && matches?.[2]) {
        return {
          mimeType: matches[1],
          base64: matches[2],
        };
      }
    }

    if (input.startsWith('http://') || input.startsWith('https://')) {
      const res = await fetch(input);
      if (!res.ok) {
        throw new Error(`Download image failed: ${res.status}`);
      }
      const mimeType = res.headers.get('content-type') || defaultMimeType;
      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        mimeType,
        base64: buffer.toString('base64'),
      };
    }

    return {
      mimeType: defaultMimeType,
      base64: input,
    };
  }

  private async postNativeGenerateContent(
    model: string,
    body: Record<string, unknown>,
    apiKey: string,
    baseUrlOverride?: string,
  ) {
    const base = this.resolveNativeBaseUrl(baseUrlOverride);
    const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const message =
        data?.error?.message ||
        data?.message ||
        data?.error ||
        text;
      throw new Error(`Gemini native request failed (${res.status}): ${String(message)}`);
    }

    return data;
  }

  private extractTextFromNativeResponse(data: any) {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';

    const text = parts
      .map((part) => String(part?.text || ''))
      .filter(Boolean)
      .join('\n')
      .trim();

    return text;
  }

  private extractInlineImageFromNativeResponse(data: any): { base64: string; mimeType: string } | null {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;

    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      const mimeType = inline?.mimeType || inline?.mime_type || '';
      const base64 = inline?.data || '';
      if (mimeType.startsWith('image/') && base64) {
        return { base64, mimeType };
      }
    }
    return null;
  }

  private extractInlineAudioFromNativeResponse(data: any): { base64: string; mimeType: string } | null {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;

    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      const mimeType = inline?.mimeType || inline?.mime_type || '';
      const base64 = inline?.data || '';
      if (mimeType.startsWith('audio/') && base64) {
        return { base64, mimeType };
      }
    }
    return null;
  }

  private wrapPcmAsWav(
    pcm: Buffer,
    sampleRate: number,
    channels: number,
    bitDepth: number,
  ) {
    const blockAlign = channels * (bitDepth / 8);
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm.length;
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcm]);
  }

  private tryParseJson(text: string): unknown | null {
    const raw = text.trim();
    if (!raw) return null;

    const normalized = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim();
    try {
      return JSON.parse(normalized);
    } catch {
      return null;
    }
  }

  private wrapNetworkError(error: any): Error {
    const message = String(error?.message || error || 'Unknown Gemini error');
    const causeMessage = String(error?.cause?.message || '');
    const combined = `${message} ${causeMessage}`.toLowerCase();

    if (
      combined.includes('timed out') ||
      combined.includes('connect timeout') ||
      combined.includes('fetch failed') ||
      combined.includes('und_err_connect_timeout')
    ) {
      return new Error(
        'Gemini 网络连接超时：当前运行环境无法直连 Google API（generativelanguage.googleapis.com）。请检查本机网络/代理或在可访问 Google API 的网络下运行。',
      );
    }

    return error instanceof Error ? error : new Error(message);
  }
}
