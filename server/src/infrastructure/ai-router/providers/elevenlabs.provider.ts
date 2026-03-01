import { Injectable } from '@nestjs/common';
import { BaseProvider } from './base.provider';
import { AITaskType } from '../ai-router.interface';

@Injectable()
export class ElevenLabsProvider extends BaseProvider {
  name = 'elevenlabs';
  supportedTasks = [AITaskType.TTS, AITaskType.VOICE_CLONE];

  async execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    // TODO
    throw new Error('Not implemented');
  }
}
