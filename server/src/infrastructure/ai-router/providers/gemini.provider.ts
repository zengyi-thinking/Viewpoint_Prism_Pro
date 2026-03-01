import { Injectable } from '@nestjs/common';
import { BaseProvider } from './base.provider';
import { AITaskType } from '../ai-router.interface';

@Injectable()
export class GeminiProvider extends BaseProvider {
  name = 'gemini';
  supportedTasks = [AITaskType.LLM_CHAT, AITaskType.MULTIMODAL];

  async execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    // TODO
    throw new Error('Not implemented');
  }
}
