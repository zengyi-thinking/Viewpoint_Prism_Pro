import { Injectable } from '@nestjs/common';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { CreationAgentTraceService } from './creation-agent-trace.service';
import { PromptParserService } from './prompt-parser.service';

export type AgentQualityJudgeResult = {
  promptCompleteness: number;
  continuity: number;
  renderStability: number;
  subjectConsistency: number;
  overall: number;
  issues: Array<{
    code: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    suggestion: string;
  }>;
  summary: string;
};

@Injectable()
export class QualityJudgeAgentService {
  constructor(
    private readonly aiRouter: AiRouterService,
    private readonly parser: PromptParserService,
    private readonly trace: CreationAgentTraceService,
  ) {}

  async judgeNode(userId: string, node: any, parentNode: any | null): Promise<AgentQualityJudgeResult> {
    const response = await this.aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'system',
            content: [
              '你是 QualityJudgeAgent，负责评估视频创作节点的专业度。',
              '基于分镜文案、视频提示词、首尾帧锚点和父节点承接关系，输出严格 JSON。',
              '不要写解释性前言，不要输出 markdown。',
              '评分范围 0-100。',
              'issues 只保留真正影响质量的项，不要堆废话。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                task: '评估创作节点质量',
                node: {
                  scriptSegment: node?.scriptSegment || '',
                  prompt: node?.prompt || '',
                  firstFrameUrl: node?.firstFrameUrl || null,
                  lastFrameUrl: node?.lastFrameUrl || null,
                },
                parentNode: parentNode
                  ? {
                      scriptSegment: parentNode?.scriptSegment || '',
                      prompt: parentNode?.prompt || '',
                      firstFrameUrl: parentNode?.firstFrameUrl || null,
                      lastFrameUrl: parentNode?.lastFrameUrl || null,
                    }
                  : null,
                outputSchema: {
                  promptCompleteness: 0,
                  continuity: 0,
                  renderStability: 0,
                  subjectConsistency: 0,
                  overall: 0,
                  summary: '一句总评',
                  issues: [
                    {
                      code: 'example_issue',
                      severity: 'medium',
                      message: '问题描述',
                      suggestion: '修正建议',
                    },
                  ],
                },
              },
              null,
              2,
            ),
          },
        ],
        temperature: 0.2,
        maxTokens: 1600,
        response_format: { type: 'json_object' },
      },
      userId,
    );

    const parsed = this.parser.extractJsonPayload(response) || {};
    const result: AgentQualityJudgeResult = {
      promptCompleteness: this.toScore((parsed as any)?.promptCompleteness),
      continuity: this.toScore((parsed as any)?.continuity),
      renderStability: this.toScore((parsed as any)?.renderStability),
      subjectConsistency: this.toScore((parsed as any)?.subjectConsistency),
      overall: this.toScore((parsed as any)?.overall),
      summary: String((parsed as any)?.summary || '').trim(),
      issues: Array.isArray((parsed as any)?.issues)
        ? (parsed as any).issues
            .map((item: any) => ({
              code: String(item?.code || 'agent_issue').trim(),
              severity:
                item?.severity === 'high' || item?.severity === 'medium' ? item.severity : 'low',
              message: String(item?.message || '').trim(),
              suggestion: String(item?.suggestion || '').trim(),
            }))
            .filter((item: any) => item.message)
            .slice(0, 6)
        : [],
    };

    await this.trace.record({
      userId,
      agent: 'QualityJudgeAgent',
      action: 'judgeNode',
      payload: {
        nodeId: node?.id || null,
        hasParentNode: Boolean(parentNode),
      },
      result: {
        overall: result.overall,
        issueCount: result.issues.length,
      },
    });

    return result;
  }

  private toScore(value: unknown) {
    const score = Number(value);
    if (!Number.isFinite(score)) return 0;
    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
