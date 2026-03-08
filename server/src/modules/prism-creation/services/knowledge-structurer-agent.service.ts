import { Injectable } from '@nestjs/common';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { KnowledgeAssetBlock, KnowledgeAssetDto } from '../dto';
import { CreationAgentTraceService } from './creation-agent-trace.service';
import { PromptBundle } from './creation-ai.types';
import { PromptParserService } from './prompt-parser.service';

@Injectable()
export class KnowledgeStructurerAgentService {
  constructor(
    private readonly aiRouter: AiRouterService,
    private readonly parser: PromptParserService,
    private readonly trace: CreationAgentTraceService,
  ) {}

  async extract(userId: string, bundle: PromptBundle): Promise<KnowledgeAssetDto> {
    const response = await this.aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'system',
            content: [
              '你是 KnowledgeStructurerAgent，负责从创作节点中抽取结构化知识资产。',
              '输入是中文分镜文案与提示词，输出是严格 JSON。',
              '不要输出 markdown，不要写多余解释。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                task: '从节点提示词中提取结构化知识块',
                bundle,
                outputSchema: {
                  version: 'agent-v1',
                  summaryBlocks: ['一句话总结'],
                  codeBlocks: ['代码或伪代码'],
                  tableBlocks: ['表格或字段结构'],
                  formulaBlocks: ['公式'],
                  actionSteps: ['步骤1', '步骤2'],
                },
              },
              null,
              2,
            ),
          },
        ],
        temperature: 0.25,
        maxTokens: 1400,
        response_format: { type: 'json_object' },
      },
      userId,
    );

    const parsed = this.parser.extractJsonPayload(response) || {};
    const result: KnowledgeAssetDto = {
      version: String((parsed as any)?.version || 'agent-v1'),
      summaryBlocks: this.toBlocks((parsed as any)?.summaryBlocks, 'summary'),
      codeBlocks: this.toBlocks((parsed as any)?.codeBlocks, 'code'),
      tableBlocks: this.toBlocks((parsed as any)?.tableBlocks, 'table'),
      formulaBlocks: this.toBlocks((parsed as any)?.formulaBlocks, 'formula'),
      actionSteps: this.toBlocks((parsed as any)?.actionSteps, 'step'),
    };

    await this.trace.record({
      userId,
      agent: 'KnowledgeStructurerAgent',
      action: 'extract',
      payload: {
        scriptSegmentLength: bundle.scriptSegment.length,
      },
      result: {
        summaryCount: result.summaryBlocks.length,
        codeCount: result.codeBlocks.length,
        tableCount: result.tableBlocks.length,
        formulaCount: result.formulaBlocks.length,
        actionStepCount: result.actionSteps.length,
      },
    });

    return result;
  }

  private toBlocks(value: unknown, prefix: string): KnowledgeAssetBlock[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 12)
      .map((text, index) => ({
        id: `${prefix}-${index + 1}`,
        text,
        source: 'mixed' as const,
      }));
  }
}
