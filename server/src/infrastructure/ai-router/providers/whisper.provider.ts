import { Injectable } from '@nestjs/common';
import { BaseProvider } from './base.provider';
import { AITaskType } from '../ai-router.interface';

@Injectable()
export class WhisperProvider extends BaseProvider {
  name = 'whisper';
  supportedTasks = [AITaskType.ASR];

  async execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    // TODO
    throw new Error('Not implemented');
  }
}
