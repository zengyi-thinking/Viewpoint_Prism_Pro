import { Injectable, Logger } from '@nestjs/common';
import { BaseProvider } from './base.provider';
import { AITaskType } from '../ai-router.interface';
import OpenAI from 'openai';

@Injectable()
export class WhisperProvider extends BaseProvider {
  name = 'whisper';
  supportedTasks = [AITaskType.ASR];
  private readonly logger = new Logger(WhisperProvider.name);

  async execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    if (taskType !== AITaskType.ASR) {
      throw new Error(`Whisper only supports ASR, got ${taskType}`);
    }

    const openai = new OpenAI({ apiKey });

    try {
      const { audio, language = 'auto', format = 'mp3' } = payload;

      // Convert base64 audio to buffer
      const audioBuffer = Buffer.from(audio, 'base64');
      const audioFile = new File([audioBuffer], `audio.${format}`, { type: `audio/${format}` });

      // Call Whisper API
      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: language === 'auto' ? undefined : language,
        response_format: 'verbose_json', // Get timestamps
      });

      // Parse segments
      const segments = response.segments?.map(seg => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
      })) || [];

      return {
        text: response.text,
        language: response.language,
        duration: response.duration,
        segments,
        words: response.words, // Word-level timestamps if available
        provider: 'whisper',
      };
    } catch (error) {
      this.logger.error(`Whisper API error: ${error.message}`);
      throw error;
    }
  }

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const openai = new OpenAI({ apiKey });
      // Try a minimal API call
      await openai.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
