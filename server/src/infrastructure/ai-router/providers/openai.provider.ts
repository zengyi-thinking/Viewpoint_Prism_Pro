import { Injectable } from '@nestjs/common';
import { BaseProvider } from './base.provider';
import { AITaskType } from '../ai-router.interface';

@Injectable()
export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  supportedTasks = [AITaskType.LLM_CHAT, AITaskType.MULTIMODAL, AITaskType.IMAGE_GEN, AITaskType.TTS];

  async execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any> {
    // TODO
    throw new Error('Not implemented');
  }
}
