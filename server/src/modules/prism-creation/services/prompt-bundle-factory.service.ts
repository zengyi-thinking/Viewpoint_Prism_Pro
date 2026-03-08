import { Injectable } from '@nestjs/common';
import { CurrentNodeContext, PromptBundle } from './creation-ai.types';
import { PromptEngineService } from './prompt-engine.service';

@Injectable()
export class PromptBundleFactoryService {
  constructor(private readonly promptEngine: PromptEngineService) {}

  create(
    payload: Record<string, any> | null | undefined,
    idea: string,
    current: CurrentNodeContext | null,
    tone?: string,
  ): PromptBundle {
    return this.promptEngine.normalizeBundle({
      payload: payload || {},
      idea,
      tone,
      current: current
        ? {
            scriptSegment: current.scriptSegment,
            prompt: current.prompt,
            orderIndex: current.orderIndex,
          }
        : null,
    });
  }

  toImageModelPrompt(prompt: string, targetModel?: string) {
    return this.promptEngine.toImageModelPrompt(prompt, targetModel);
  }

  toVideoModelPrompt(prompt: string, targetModel?: string) {
    return this.promptEngine.toVideoModelPrompt(prompt, targetModel);
  }

  compactForModel(prompt: string) {
    return this.promptEngine.compactForModel(prompt);
  }
}
