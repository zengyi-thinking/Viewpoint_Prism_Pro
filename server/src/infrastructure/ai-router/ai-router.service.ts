import { Injectable } from '@nestjs/common';
import { AITaskType } from './ai-router.interface';

@Injectable()
export class AiRouterService {
  async execute(taskType: AITaskType, payload: any, userId: string): Promise<any> {
    // TODO: resolve provider based on user settings + taskType, execute
    throw new Error('Not implemented');
  }
}
