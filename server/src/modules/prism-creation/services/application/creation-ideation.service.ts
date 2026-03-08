import { BadRequestException, Injectable } from '@nestjs/common';
import { AITaskType } from '../../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../../infrastructure/ai-router/ai-router.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { GenerateIdeaPreviewDto, ScriptSplitDto, TaskStatus } from '../../dto';
import { FirstNodeIdeaPreview } from '../foundation/creation-ai.types';
import { CreationAgentModeService } from '../foundation/creation-agent-mode.service';
import { CreationFlowService } from './creation-flow.service';
import { CreationKnowledgeAssetService } from './creation-knowledge-asset.service';
import { PromptBundleFactoryService } from '../foundation/prompt-bundle-factory.service';
import { PromptEngineService } from '../foundation/prompt-engine.service';
import { PromptParserService } from '../foundation/prompt-parser.service';
import { ScriptBreakdownAgentService } from '../agents/script-breakdown-agent.service';
import { StoryPlannerAgentService } from '../agents/story-planner-agent.service';
import { TextSimilarityService } from '../foundation/text-similarity.service';

@Injectable()
export class CreationIdeationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly flowService: CreationFlowService,
    private readonly agentMode: CreationAgentModeService,
    private readonly bundleFactory: PromptBundleFactoryService,
    private readonly promptEngine: PromptEngineService,
    private readonly parser: PromptParserService,
    private readonly similarity: TextSimilarityService,
    private readonly scriptBreakdownAgent: ScriptBreakdownAgentService,
    private readonly storyPlannerAgent: StoryPlannerAgentService,
    private readonly knowledgeAssetService: CreationKnowledgeAssetService,
  ) {}

  async scriptSplit(userId: string, videoId: string, dto: ScriptSplitDto) {
    const project = await this.flowService.getOrCreateProject(userId, videoId);
    const shouldPersist = dto.persist === true;

    let segments: Array<{ segment: string; prompt: string; estimatedDuration?: number }> = [];
    if (dto.segments?.length) {
      segments = dto.segments.map((seg) => ({
        segment: seg.segment,
        prompt: seg.prompt || seg.segment,
        estimatedDuration: seg.estimatedDuration,
      }));
    } else if (dto.scriptText?.trim()) {
      segments = await this.scriptBreakdownAgent.splitScriptWithLLM(
        userId,
        dto.scriptText,
        dto.stylePreset,
        dto.adjustInstruction,
      );
    } else {
      throw new BadRequestException('scriptText 或 segments 至少需要提供一个');
    }

    const bundles = segments.map((item) =>
      this.bundleFactory.create(
        {
          scriptSegment: item.segment,
          videoPrompt: item.prompt,
          sceneFramePrompt: '',
          firstFramePrompt: '',
          lastFramePrompt: '',
        },
        item.segment || item.prompt,
        null,
      ),
    );

    if (!shouldPersist) {
      return {
        userId,
        videoId,
        projectId: project.id,
        persisted: false,
        segments,
        knowledgeAssets: await Promise.all(
          bundles.map((bundle, index) =>
            this.knowledgeAssetService.buildFromBundle(bundle, `split-${index + 1}`, userId),
          ),
        ),
      };
    }

    const maxOrderIndex = await this.prisma.flowNode.aggregate({
      where: { flowProjectId: project.id },
      _max: { orderIndex: true },
    });
    let currentOrderIndex = (maxOrderIndex._max.orderIndex ?? -1) + 1;

    const createdNodes: any[] = [];
    for (const segment of segments) {
      const node = await this.prisma.flowNode.create({
        data: {
          flowProjectId: project.id,
          orderIndex: currentOrderIndex,
          prompt: segment.prompt,
          scriptSegment: segment.segment,
          positionX: 100 + (currentOrderIndex % 4) * 250,
          positionY: 100 + Math.floor(currentOrderIndex / 4) * 200,
          renderStatus: TaskStatus.PENDING,
        },
      });
      createdNodes.push(this.flowService.toNodeDto(node));
      currentOrderIndex++;
    }

    await this.prisma.prismFlowProject.update({
      where: { id: project.id },
      data: { status: TaskStatus.PROCESSING },
    });

    return {
      userId,
      videoId,
      projectId: project.id,
      persisted: true,
      segments: createdNodes,
      knowledgeAssets: await Promise.all(
        bundles.map((bundle, index) =>
          this.knowledgeAssetService.buildFromBundle(bundle, `split-${index + 1}`, userId),
        ),
      ),
    };
  }

  async generateIdeaPreview(userId: string, videoId: string, dto: GenerateIdeaPreviewDto) {
    const project = await this.flowService.getOrCreateProject(userId, videoId);
    const idea = dto.idea?.trim();
    if (!idea) {
      throw new BadRequestException('idea is required');
    }
    const count = Math.max(1, Math.min(4, Number(dto.count || 3)));
    const tone = dto.tone?.trim() || 'cinematic';

    const existingNodeCount = await this.prisma.flowNode.count({
      where: { flowProjectId: project.id },
    });

    const previews = await this.generatePreviewCandidates(userId, idea, count, tone);

    return {
      userId,
      videoId,
      projectId: project.id,
      mode: 'idea_preview',
      existingNodeCount,
      tone,
      count,
      previews,
      knowledgeAssets: await Promise.all(
        previews.map((item, index) =>
          this.knowledgeAssetService.buildFromBundle(
            item.promptBundle,
            `preview-${index + 1}`,
            userId,
          ),
        ),
      ),
    };
  }

  private async generatePreviewCandidates(
    userId: string,
    idea: string,
    count: number,
    tone: string,
  ): Promise<FirstNodeIdeaPreview[]> {
    if (this.agentMode.shouldUseAgents()) {
      try {
        const previews = await this.storyPlannerAgent.generateIdeaPreviews({
          userId,
          idea,
          count,
          tone,
        });
        const normalized = this.normalizePreviewList(previews, count);
        if (normalized.length) return normalized;
      } catch (error) {
        if (!this.agentMode.shouldFallbackAfterAgentError()) {
          throw error;
        }
      }
    }

    const response = await this.aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'system',
            content: [
              this.promptEngine.buildMultishotSystemPrompt('preview', tone),
              '你负责先给用户看 3 个真正不同的开场方向，再等待确认。',
              '禁止使用固定模板标题，禁止复读用户原话，禁止元讨论。',
              '不要写“我会这样做”“采用这种策略”。直接给可拍的内容。',
              '标题必须像真实分镜代号或片段名，禁止输出“世界观建立型、人物钩子型、事件闯入型、方向1、方案A”这类抽象分类名。',
              'openingScene 必须是具体镜头，不要写“大战一触即发、悬念渐增、冲突升级”这种空泛总结。',
              'progressionBeat 必须写清楚下一拍的动作推进，不要写写作术语。',
              '每个方向都必须显著不同，差异必须体现在开场主体、触发事件、镜头视角、信息密度、情绪节奏中的至少三项。',
              '标题 <= 8 字，openingScene <= 50 字，progressionBeat <= 40 字，styleNotes <= 24 字。',
              '必须输出完整 promptBundle，且 promptBundle 里的字段要是中文、可直接展示给用户的版本。',
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
        temperature: 0.92,
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

    const normalized = this.normalizePreviewList(
      previews.map((item: any) => this.normalizePreviewItem(item, idea, tone)),
      count,
    );

    if (!normalized.length) {
      throw new Error('Story preview model returned no valid previews');
    }

    return normalized;
  }

  private normalizePreviewItem(item: any, idea: string, tone: string): FirstNodeIdeaPreview {
    const promptBundle = this.bundleFactory.create(item?.promptBundle || item || {}, idea, null, tone);
    return {
      title: this.parser.sanitizeShortText(String(item?.title || '').trim(), 8),
      openingScene: this.parser.sanitizeShortText(String(item?.openingScene || '').trim(), 50),
      progressionBeat: this.parser.sanitizeShortText(
        String(item?.progressionBeat || '').trim(),
        40,
      ),
      styleNotes: this.parser.sanitizeShortText(String(item?.styleNotes || '').trim(), 24),
      confirmationChecklist: Array.isArray(item?.confirmationChecklist)
        ? item.confirmationChecklist
            .map((entry: unknown) => String(entry || '').trim())
            .filter(Boolean)
            .slice(0, 3)
        : [],
      promptBundle,
    };
  }

  private normalizePreviewList(previews: FirstNodeIdeaPreview[], count: number) {
    const valid = previews.filter(
      (item) =>
        Boolean(item.title) &&
        Boolean(item.openingScene) &&
        Boolean(item.progressionBeat) &&
        Boolean(item.promptBundle?.scriptSegment),
    );

    const deduped: FirstNodeIdeaPreview[] = [];
    for (const preview of valid) {
      const duplicated = deduped.some(
        (item) =>
          this.similarity.jaccard(item.title, preview.title) >= 0.8 ||
          this.similarity.jaccard(item.openingScene, preview.openingScene) >= 0.68,
      );
      if (!duplicated) {
        deduped.push(preview);
      }
      if (deduped.length >= count) break;
    }

    return deduped.slice(0, count);
  }
}
