import { Injectable } from '@nestjs/common';
import { AITaskType } from '../../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../../infrastructure/ai-router/ai-router.service';
import { CreationAgentTraceService } from '../foundation/creation-agent-trace.service';
import { CurrentNodeContext, PromptBundle } from '../foundation/creation-ai.types';
import { PromptBundleFactoryService } from '../foundation/prompt-bundle-factory.service';
import { PromptEngineService } from '../foundation/prompt-engine.service';
import { PromptParserService } from '../foundation/prompt-parser.service';

@Injectable()
export class ShotDesignerAgentService {
  constructor(
    private readonly aiRouter: AiRouterService,
    private readonly promptEngine: PromptEngineService,
    private readonly parser: PromptParserService,
    private readonly bundleFactory: PromptBundleFactoryService,
    private readonly trace: CreationAgentTraceService,
  ) {}

  async designNextNode(userId: string, idea: string, current: CurrentNodeContext | null) {
    const payload = await this.callDesigner(userId, {
      task: '基于当前节点续写下一个节点',
      idea,
      currentNode: current,
    });
    return this.bundleFactory.create(payload, idea, current);
  }

  async generateNodeCandidates(
    userId: string,
    idea: string,
    current: CurrentNodeContext,
    count: number,
  ) {
    const payload = await this.callDesigner(userId, {
      task: '生成多个明显不同的下一节点候选',
      idea,
      count,
      currentNode: current,
      outputSchema: {
        candidates: [
          {
            scriptSegment: '中文分镜文案',
            videoPrompt: '中文视频提示词',
            sceneFramePrompt: '中文场景提示词',
            firstFramePrompt: '首帧提示词',
            lastFramePrompt: '尾帧提示词',
            subject: '主体锚点',
            setting: '空间锚点',
            action: '动作锚点',
            camera: '镜头锚点',
            lighting: '光线锚点',
            style: '风格锚点',
          },
        ],
      },
    });

    const candidates = Array.isArray((payload as any)?.candidates)
      ? (payload as any).candidates
      : Array.isArray(payload)
        ? payload
        : [];

    return candidates
      .slice(0, count)
      .map((item: any) => this.bundleFactory.create(item, idea, current));
  }

  async refineNodeCopy(
    userId: string,
    requirement: string,
    currentBundle: PromptBundle,
    current: CurrentNodeContext | null,
  ) {
    const payload = await this.callDesigner(userId, {
      task: '根据用户要求重写当前节点',
      requirement,
      currentNode: current,
      currentBundle,
      outputSchema: {
        scriptSegment: '中文重写文案',
        videoPrompt: '中文视频提示词',
        sceneFramePrompt: '中文场景提示词',
        firstFramePrompt: '首帧提示词',
        lastFramePrompt: '尾帧提示词',
        subject: '主体锚点',
        setting: '空间锚点',
        action: '动作锚点',
        camera: '镜头锚点',
        lighting: '光线锚点',
        style: '风格锚点',
      },
    });

    return this.bundleFactory.create(
      payload,
      requirement || currentBundle.scriptSegment || currentBundle.videoPrompt,
      current,
    );
  }

  private async callDesigner(userId: string, payload: Record<string, unknown>) {
    const response = await this.aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'system',
            content: [
              this.promptEngine.buildMultishotSystemPrompt('next_node'),
              '你是 ShotDesignerAgent，负责将故事意图转换为专业分镜与提示词。',
              '禁止元讨论，禁止复述用户原话，直接输出可拍内容。',
              '输出中文可读提示词，同时保持结构化字段完整。',
              '显式给出 subject / setting / action / camera / lighting / style 六个视觉锚点。',
              '如果有上一镜头，必须承接人物、空间、视线方向、光色和节奏。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(payload, null, 2),
          },
        ],
        temperature: 0.72,
        maxTokens: 2600,
        response_format: { type: 'json_object' },
      },
      userId,
    );

    const parsed = this.parser.extractJsonPayload(response);

    await this.trace.record({
      userId,
      agent: 'ShotDesignerAgent',
      action: String(payload.task || 'design'),
      payload: {
        idea: payload.idea,
        count: payload.count,
        hasCurrentNode: Boolean(payload.currentNode),
      },
      result: {
        keys: parsed && typeof parsed === 'object' ? Object.keys(parsed as object) : [],
      },
    });

    return parsed && typeof parsed === 'object' && (parsed as any).node
      ? (parsed as any).node
      : parsed;
  }
}
