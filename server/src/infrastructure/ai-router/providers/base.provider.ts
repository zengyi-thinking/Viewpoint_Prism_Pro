import { AIProvider, AITaskType } from '../ai-router.interface';

export abstract class BaseProvider implements AIProvider {
  abstract name: string;
  abstract supportedTasks: AITaskType[];
  abstract execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any>;

  async testConnection(apiKey: string): Promise<boolean> {
    // Default: try a minimal request
    return true;
  }
}
