import { Injectable, Logger } from '@nestjs/common';
import { BaseProvider } from './base.provider';
import { AITaskType } from '../ai-router.interface';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  supportedTasks = [AITaskType.LLM_CHAT, AITaskType.MULTIMODAL, AITaskType.IMAGE_GEN, AITaskType.TTS];
  private readonly logger = new Logger(OpenAIProvider.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    const openai = new OpenAI({
      apiKey,
      baseURL:
        this.configService.get<string>('OPENAI_BASE_URL') ||
        this.configService.get<string>('SILICONFLOW_BASE_URL') ||
        this.configService.get<string>('OPENAI_PREMIUM_BASE_URL') ||
        undefined,
    });

    try {
      switch (taskType) {
        case AITaskType.LLM_CHAT:
          return await this.chat(openai, payload);
        case AITaskType.MULTIMODAL:
          return await this.multimodal(openai, payload);
        case AITaskType.IMAGE_GEN:
          return await this.generateImage(openai, payload);
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
      const openai = new OpenAI({ apiKey });
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
        this.configService.get<string>('OPENAI_MODEL_VISION') ||
        this.configService.get<string>('SILICONFLOW_MODEL_VLM') ||
        'gpt-4o',
    } = payload;

    // Build content array with text and image
    const content: any[] = [
      { type: 'text', text: prompt },
    ];

    // Add image if provided (base64 or URL)
    const finalImage = imageUrl || image;
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
}
