import { Injectable } from '@nestjs/common';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';

@Injectable()
export class CreationLlmService {
  constructor(private readonly aiRouter: AiRouterService) {}

  async generateJson<T>(userId: string, system: string, user: string, maxTokens = 2200): Promise<T> {
    const response = await this.aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        temperature: 0.85,
        maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      userId,
    );

    const content = String(response?.content || response?.text || '').trim();
    return this.parseJson<T>(content);
  }

  private parseJson<T>(content: string): T {
    try {
      return JSON.parse(content) as T;
    } catch {
      const objectMatch = content.match(/\{[\s\S]*\}$/);
      if (objectMatch) return JSON.parse(objectMatch[0]) as T;
      const arrayMatch = content.match(/\[[\s\S]*\]$/);
      if (arrayMatch) return JSON.parse(arrayMatch[0]) as T;
      throw new Error(`LLM 未返回有效 JSON：${content.slice(0, 240)}`);
    }
  }
}
