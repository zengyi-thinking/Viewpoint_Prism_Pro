import { Injectable } from '@nestjs/common';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { ScriptSplitDto } from '../dto';
import { PromptEngineService } from './prompt-engine.service';
import { PromptParserService } from './prompt-parser.service';

@Injectable()
export class CreationScriptService {
  constructor(
    private readonly aiRouter: AiRouterService,
    private readonly promptEngine: PromptEngineService,
    private readonly parser: PromptParserService,
  ) {}

  async splitScriptWithLLM(
    userId: string,
    scriptText: string,
    stylePreset?: ScriptSplitDto['stylePreset'],
    adjustInstruction?: string,
  ): Promise<Array<{ segment: string; prompt: string; estimatedDuration?: number }>> {
    try {
      const response = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          messages: [
            {
              role: 'system',
              content: this.promptEngine.buildMultishotSystemPrompt('script_split'),
            },
            {
              role: 'user',
              content: JSON.stringify(
                {
                  task: '将长文案拆分成多个镜头节点',
                  scriptText,
                  stylePreset: stylePreset || null,
                  adjustInstruction: adjustInstruction || null,
                  outputSchema: [
                    {
                      segment: '片段文案',
                      prompt: '专业画面提示词',
                      estimatedDuration: 3,
                    },
                  ],
                },
                null,
                2,
              ),
            },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        },
        userId,
      );

      const parsed = this.parser.extractJsonPayload(response);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray((parsed as any)?.segments)) return (parsed as any).segments;
      throw new Error('script_split 模型未返回有效 segments 数组');
    } catch {
      return [
        {
          segment: scriptText,
          prompt: '视频片段',
          estimatedDuration: 5,
        },
      ];
    }
  }
}
