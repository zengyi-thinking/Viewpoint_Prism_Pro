import { Injectable } from '@nestjs/common';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { CurrentNodeContext, FirstNodeIdeaPreview } from './creation-ai.types';
import { CreationAgentTraceService } from './creation-agent-trace.service';
import { PromptBundleFactoryService } from './prompt-bundle-factory.service';
import { PromptEngineService } from './prompt-engine.service';
import { PromptParserService } from './prompt-parser.service';

@Injectable()
export class StoryPlannerAgentService {
  constructor(
    private readonly aiRouter: AiRouterService,
    private readonly promptEngine: PromptEngineService,
    private readonly parser: PromptParserService,
    private readonly bundleFactory: PromptBundleFactoryService,
    private readonly trace: CreationAgentTraceService,
  ) {}

  async generateIdeaPreviews(params: {
    userId: string;
    idea: string;
    count: number;
    tone: string;
    strategies: Array<{
      label: string;
      openingMethod: string;
      openingInstruction: string;
      primaryValue: string;
      progressionMode: string;
      styleCue: string;
      scriptOpening: string;
      titleSeed: string;
    }>;
  }): Promise<FirstNodeIdeaPreview[]> {
    const { userId, idea, count, tone, strategies } = params;
    const response = await this.aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'system',
            content: [
              this.promptEngine.buildMultishotSystemPrompt('preview', tone),
              '你是 StoryPlannerAgent，负责先构思，再给用户看预览，再等待确认。',
              '绝对禁止重复用户原始输入。',
              '绝对禁止输出“我将如何写”“采用什么手法”这类元讨论。',
              '直接给结果，不解释写作方法。',
              '标题控制在 8 个字以内。',
              'openingScene 控制在 50 个字以内。',
              'progressionBeat 控制在 40 个字以内。',
              'styleNotes 控制在 24 个字以内。',
              '每个方向都要显著不同，至少在开场主体、冲突触发方式、镜头视角三项中体现差异。',
              '除 promptBundle 外，还要给出首节点的确认清单。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                task: '生成首节点预览，不要创建节点',
                idea,
                count,
                tone,
                strategies,
                outputSchema: {
                  previews: [
                    {
                      title: '8字内标题',
                      openingScene: '50字内直接画面描述',
                      progressionBeat: '40字内推进描述',
                      styleNotes: '24字内风格提示',
                      confirmationChecklist: ['问题1', '问题2', '问题3'],
                      promptBundle: {
                        scriptSegment: '中文首节点文案',
                        videoPrompt: '适合视频模型的中文分镜提示词',
                        sceneFramePrompt: '适合图片模型的中文场景提示词',
                        firstFramePrompt: '首帧提示词',
                        lastFramePrompt: '尾帧提示词',
                        subject: '主体锚点',
                        setting: '场景锚点',
                        action: '动作锚点',
                        camera: '镜头锚点',
                        lighting: '光线锚点',
                        style: '风格锚点',
                      },
                    },
                  ],
                },
              },
              null,
              2,
            ),
          },
        ],
        temperature: 0.9,
        maxTokens: 2600,
        response_format: { type: 'json_object' },
      },
      userId,
    );

    const parsed = this.parser.extractJsonPayload(response);
    const previews = Array.isArray((parsed as any)?.previews)
      ? (parsed as any).previews
      : Array.isArray(parsed)
        ? parsed
        : [];

    const normalized = previews.slice(0, count).map((item: any) => {
      const promptBundle = this.bundleFactory.create(
        item?.promptBundle || item || {},
        idea,
        null,
        tone,
      );
      return {
        title: this.parser.sanitizeShortText(String(item?.title || '').trim(), 8),
        openingScene: this.parser.sanitizeShortText(String(item?.openingScene || '').trim(), 50),
        progressionBeat: this.parser.sanitizeShortText(
          String(item?.progressionBeat || '').trim(),
          40,
        ),
        styleNotes: this.parser.sanitizeShortText(String(item?.styleNotes || '').trim(), 24),
        confirmationChecklist: Array.isArray(item?.confirmationChecklist)
          ? item.confirmationChecklist.map((entry: unknown) => String(entry || '').trim()).filter(Boolean).slice(0, 3)
          : [],
        promptBundle,
      } satisfies FirstNodeIdeaPreview;
    });

    await this.trace.record({
      userId,
      agent: 'StoryPlannerAgent',
      action: 'generateIdeaPreviews',
      payload: { idea, count, tone },
      result: {
        previewCount: normalized.length,
        titles: normalized.map((item) => item.title),
      },
    });

    return normalized;
  }
}
