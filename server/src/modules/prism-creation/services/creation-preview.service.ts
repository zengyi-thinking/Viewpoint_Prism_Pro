import { Injectable } from '@nestjs/common';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { CurrentNodeContext, FirstNodeIdeaPreview, PromptBundle } from './creation-ai.types';
import { CreationAgentModeService } from './creation-agent-mode.service';
import { PromptBundleFactoryService } from './prompt-bundle-factory.service';
import { PromptEngineService } from './prompt-engine.service';
import { PromptParserService } from './prompt-parser.service';
import { ShotDesignerAgentService } from './shot-designer-agent.service';
import { StoryPlannerAgentService } from './story-planner-agent.service';
import { TextSimilarityService } from './text-similarity.service';

type PreviewStrategy = {
  label: string;
  openingMethod: string;
  openingInstruction: string;
  primaryValue: string;
  progressionMode: string;
  styleCue: string;
  scriptOpening: string;
  titleSeed: string;
};

@Injectable()
export class CreationPreviewService {
  constructor(
    private readonly aiRouter: AiRouterService,
    private readonly agentMode: CreationAgentModeService,
    private readonly bundleFactory: PromptBundleFactoryService,
    private readonly promptEngine: PromptEngineService,
    private readonly parser: PromptParserService,
    private readonly similarity: TextSimilarityService,
    private readonly storyPlannerAgent: StoryPlannerAgentService,
    private readonly shotDesignerAgent: ShotDesignerAgentService,
  ) {}

  async generateFirstNodePreviewCandidatesWithLLM(
    userId: string,
    idea: string,
    count: number,
    tone: string,
  ): Promise<FirstNodeIdeaPreview[]> {
    const strategies = this.getPreviewStrategies(tone, count);
    const fallbackPromptBundle = this.normalizePromptBundle({}, idea, null);
    const buildFallback = (variantIndex: number): FirstNodeIdeaPreview => {
      const strategy = strategies[variantIndex] || strategies[0];
      return {
        title: String(strategy.titleSeed || this.compactIdeaTitle(idea)).slice(0, 8),
        openingScene: this.buildKnowledgeOpeningFallback(strategy),
        progressionBeat: this.buildKnowledgeProgressionFallback(strategy),
        styleNotes: this.buildKnowledgeStyleFallback(strategy),
        confirmationChecklist: [
          '这个开场气质是否符合你想要的作品调性？',
          '第一节点是否既承担开场，又埋下后续推进钩子？',
          '如果认可这个方向，再创建首节点。',
        ],
        promptBundle: this.applyPreviewStrategyToBundle(
          {
            ...fallbackPromptBundle,
            scriptSegment: `${this.buildKnowledgeScriptFallback(strategy)}\n${fallbackPromptBundle.scriptSegment}`,
          },
          strategy,
        ),
      };
    };
    const fallbackList = Array.from({ length: count }, (_, index) => buildFallback(index));

    if (this.agentMode.shouldUseAgents()) {
      try {
        const agentPreviews = await this.storyPlannerAgent.generateIdeaPreviews({
          userId,
          idea,
          count,
          tone,
          strategies,
        });
        const diversified = this.ensurePreviewListDiversity(
          agentPreviews.filter((item) => Boolean(item.title && item.promptBundle?.scriptSegment)),
          fallbackList,
          strategies,
        );
        if (diversified.length) {
          return diversified;
        }
      } catch (error) {
        if (!this.agentMode.shouldFallbackAfterAgentError()) {
          throw error;
        }
      }
    }

    try {
      const response = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          messages: [
            {
              role: 'system',
              content: this.promptEngine.buildMultishotSystemPrompt('preview', tone),
            },
            {
              role: 'user',
              content: JSON.stringify(
                {
                  task: '为快速模式生成多个首节点故事预览',
                  idea,
                  count,
                  tone,
                  strategies: strategies.map((strategy, index) => ({
                    index,
                    label: strategy.label,
                    openingMethod: strategy.openingMethod,
                    openingInstruction: strategy.openingInstruction,
                    primaryValue: strategy.primaryValue,
                    progressionMode: strategy.progressionMode,
                    styleCue: strategy.styleCue,
                    scriptOpening: strategy.scriptOpening,
                    titleSeed: strategy.titleSeed,
                  })),
                  requirement:
                    '先给预览，再让用户确认；不要直接创建节点；不要简单复制用户原话；三个方向必须一眼能看出不同开场法；不要写元讨论，直接给具体可拍的开场内容。',
                },
                null,
                2,
              ),
            },
          ],
          temperature: 0.85,
          maxTokens: 2200,
          response_format: { type: 'json_object' },
        },
        userId,
      );

      const parsed = this.parser.extractJsonPayload(response);
      const previewList = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as any)?.previews)
          ? (parsed as any).previews
          : Array.isArray((parsed as any)?.data)
            ? (parsed as any).data
            : [];
      if (!previewList.length) return fallbackList;

      const normalized = previewList
        .slice(0, count)
        .map((item: any, index: number) => {
          const strategy = strategies[index] || strategies[0];
          const promptBundle = this.applyPreviewStrategyToBundle(
            this.normalizePromptBundle(item, idea, null),
            strategy,
          );
          const checklist = Array.isArray(item?.confirmationChecklist)
            ? item.confirmationChecklist
                .map((entry: unknown) => String(entry || '').trim())
                .filter(Boolean)
                .slice(0, 3)
            : [];
          const fallback = fallbackList[index] || buildFallback(index);

          return {
            title: this.ensurePreviewFieldDiversity(
              this.parser.sanitizeShortText(String(item?.title || fallback.title).trim(), 8),
              fallback.title,
              String(strategy.titleSeed || strategy.label),
            ),
            openingScene: this.ensurePreviewFieldDiversity(
              this.parser.sanitizeShortText(
                String(item?.openingScene || fallback.openingScene).trim(),
                50,
              ),
              fallback.openingScene,
              String(strategy.primaryValue || ''),
            ),
            progressionBeat: this.ensurePreviewFieldDiversity(
              this.parser.sanitizeShortText(
                String(item?.progressionBeat || fallback.progressionBeat).trim(),
                40,
              ),
              fallback.progressionBeat,
              String(strategy.progressionMode || ''),
            ),
            styleNotes: this.ensurePreviewFieldDiversity(
              this.parser.sanitizeShortText(
                String(item?.styleNotes || fallback.styleNotes).trim(),
                24,
              ),
              fallback.styleNotes,
              strategy.styleCue,
            ),
            confirmationChecklist: checklist.length ? checklist : fallback.confirmationChecklist,
            promptBundle: {
              ...promptBundle,
              scriptSegment: this.ensurePreviewFieldDiversity(
                promptBundle.scriptSegment,
                fallback.promptBundle.scriptSegment,
                strategy.scriptOpening,
              ),
            },
          };
        })
        .filter((item) => Boolean(item.title && item.promptBundle.scriptSegment));

      const diversified = this.ensurePreviewListDiversity(
        normalized.length ? normalized : fallbackList,
        fallbackList,
        strategies,
      );
      return diversified.length ? diversified : fallbackList;
    } catch {
      return fallbackList;
    }
  }

  async generateNodeCandidatesWithLLM(
    userId: string,
    idea: string,
    current: CurrentNodeContext,
    count: number,
  ): Promise<PromptBundle[]> {
    const fallbackList = Array.from({ length: count }).map((_, idx) =>
      this.normalizePromptBundle(
        {
          scriptSegment: `候选${idx + 1}：延续当前节点并推进到新情节：${idea}`,
          videoPrompt: `${current.prompt || current.scriptSegment || '连续镜头'}，变体${idx + 1}，推进到：${idea}，电影感，16:9`,
        },
        idea,
        current,
      ),
    );

    if (this.agentMode.shouldUseAgents()) {
      try {
        const candidates = await this.shotDesignerAgent.generateNodeCandidates(
          userId,
          idea,
          current,
          count,
        );
        if (candidates.length) {
          return candidates;
        }
      } catch (error) {
        if (!this.agentMode.shouldFallbackAfterAgentError()) {
          throw error;
        }
      }
    }

    try {
      const response = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          messages: [
            {
              role: 'system',
              content: this.promptEngine.buildMultishotSystemPrompt('candidates'),
            },
            {
              role: 'user',
              content: JSON.stringify(
                {
                  task: '节点拓展候选',
                  count,
                  idea,
                  currentNode: current,
                },
                null,
                2,
              ),
            },
          ],
          temperature: 0.9,
          response_format: { type: 'json_object' },
        },
        userId,
      );

      const parsed = this.parser.extractJsonPayload(response);
      const candidateList = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as any)?.candidates)
          ? (parsed as any).candidates
          : Array.isArray((parsed as any)?.items)
            ? (parsed as any).items
            : [];
      if (!candidateList.length) return fallbackList;

      const normalized = candidateList
        .slice(0, count)
        .map((item: any) => this.normalizePromptBundle(item || {}, idea, current))
        .filter((item: PromptBundle) => Boolean(item.scriptSegment || item.videoPrompt));

      return normalized.length ? normalized : fallbackList;
    } catch {
      return fallbackList;
    }
  }

  private normalizePromptBundle(
    payload: any,
    idea: string,
    current: CurrentNodeContext | null,
  ): PromptBundle {
    return this.bundleFactory.create(payload, idea, current);
  }

  private buildKnowledgeOpeningFallback(strategy: PreviewStrategy) {
    if (strategy.label.includes('Concept First')) {
      return '黑底界面中核心公式骤然高亮，关键参数实时跳变。';
    }
    if (strategy.label.includes('Macro Overview')) {
      return '全景导图铺满屏幕，镜头迅速推进到今日目标模块。';
    }
    if (strategy.label.includes('Problem & Solution')) {
      return '左右分屏同时出现错误流程与优化方案，差距一眼可见。';
    }
    return '执行流从起点缓慢展开，节点依次点亮并形成闭环。';
  }

  private buildKnowledgeProgressionFallback(strategy: PreviewStrategy) {
    if (strategy.label.includes('Concept First')) {
      return '紧接着用一个真实案例拆解公式在业务中的作用路径。';
    }
    if (strategy.label.includes('Macro Overview')) {
      return '随后逐层下钻，先讲输入，再讲核心处理与输出。';
    }
    if (strategy.label.includes('Problem & Solution')) {
      return '先复盘失败原因，再逐步替换成可执行的改进步骤。';
    }
    return '按时间线展示每个阶段的状态变化与关键决策点。';
  }

  private buildKnowledgeStyleFallback(strategy: PreviewStrategy) {
    const cue = String(strategy.styleCue || '').trim();
    return cue ? cue.slice(0, 24) : '信息清晰、镜头稳健。';
  }

  private buildKnowledgeScriptFallback(strategy: PreviewStrategy) {
    return String(strategy.scriptOpening || '直接进入核心内容，不做冗余说明。');
  }

  private getPreviewStrategies(tone: string, count: number) {
    void tone;
    const base: PreviewStrategy[] = [
      {
        label: '核心概念直入型 (Concept First)',
        openingMethod: '直接抛出视频中最核心的理论概念或核心痛点',
        openingInstruction: '开场用极具视觉冲击力的图表、代码块或高对比画面，直击核心定义',
        primaryValue: '快速建立认知锚点',
        progressionMode: '从概念定义平滑过渡到具体案例分析',
        styleCue: '极简背景，主体（如公式、数据看板、架构图）居中高亮',
        scriptOpening: '不废话，直接亮出本节最核心的数据或公式',
        titleSeed: '概念锚定',
      },
      {
        label: '全景脉络型 (Macro Overview)',
        openingMethod: '先展示系统全貌（如思维导图、系统架构），再拉近到局部节点',
        openingInstruction: '开场是一个庞大复杂的结构图，随后镜头快速推进（Zoom In）到今天的主题模块',
        primaryValue: '建立全局知识脉络',
        progressionMode: '由宏观架构切入微观细节的深度解析',
        styleCue: '空间感强，强调元素之间的连线和逻辑关联',
        scriptOpening: '先给观众看整片森林，再聚焦到今天要砍的那棵树',
        titleSeed: '全景推进',
      },
      {
        label: '痛点对比型 (Problem & Solution)',
        openingMethod: '开场直接左右分屏或前后对比，展示“错误做法”与“正确解法”',
        openingInstruction: '画面强对比，左边是混乱的代码/低效流程，右边是优雅架构/清晰数据',
        primaryValue: '通过视觉反差制造学习动机',
        progressionMode: '抛出痛点后，紧接着拆解解决方案的第一步',
        styleCue: '高对比度，色彩区分明显（红与绿、暗与亮）',
        scriptOpening: '用最直观的失败案例开场，立刻给出正确路径的视觉暗示',
        titleSeed: '痛点反差',
      },
      {
        label: '动态演进型 (Process Evolution)',
        openingMethod: '展示一个事物从无到有、或从乱到治的动态过程',
        openingInstruction: '例如代码自动补全、编译执行流、数据图表实时生长',
        primaryValue: '展现知识的动态生命力',
        progressionMode: '顺着时间线或执行流，逐步讲解每个阶段',
        styleCue: '具有时间流动感，强调过程的丝滑过渡',
        scriptOpening: '让静态知识动起来，展示其演化过程',
        titleSeed: '动态演化',
      },
    ];

    return base.slice(0, Math.max(1, count));
  }

  private compactIdeaTitle(idea: string) {
    return (
      String(idea || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 18) || '故事开场'
    );
  }

  private ensurePreviewFieldDiversity(value: string, fallback: string, keyword: string) {
    const normalized = String(value || '').trim();
    if (!normalized) return fallback;
    const tooCloseToFallback = this.previewSimilarity(normalized, fallback) >= 0.82;
    const missingKeyword = keyword && !normalized.includes(keyword);
    if (tooCloseToFallback || missingKeyword) {
      return `${normalized}${missingKeyword ? `；核心开场法：${keyword}` : ''}`;
    }
    return normalized;
  }

  private ensurePreviewListDiversity(
    previews: FirstNodeIdeaPreview[],
    fallbackList: FirstNodeIdeaPreview[],
    strategies: PreviewStrategy[],
  ) {
    return previews.map((preview, index) => {
      const strategy = strategies[index] || strategies[0];
      const fallback = fallbackList[index] || fallbackList[0];
      const previousItems = previews.slice(0, index);
      const openingTooSimilar = previousItems.some(
        (item) => this.previewSimilarity(item.openingScene, preview.openingScene) >= 0.72,
      );
      const titleTooSimilar = previousItems.some(
        (item) => this.previewSimilarity(item.title, preview.title) >= 0.8,
      );

      if (!openingTooSimilar && !titleTooSimilar) {
        return preview;
      }

      return {
        ...preview,
        title: fallback.title,
        openingScene: fallback.openingScene,
        progressionBeat: fallback.progressionBeat,
        styleNotes: `${fallback.styleNotes}。当前方向强制与其它方向区分：${strategy.openingMethod}`,
        confirmationChecklist: fallback.confirmationChecklist,
        promptBundle: {
          ...this.applyPreviewStrategyToBundle(preview.promptBundle, strategy),
          ...fallback.promptBundle,
        },
      };
    });
  }

  private applyPreviewStrategyToBundle(bundle: PromptBundle, strategy: PreviewStrategy) {
    return {
      ...bundle,
      scriptSegment: this.prefixIfMissing(bundle.scriptSegment, `${strategy.label}：${strategy.scriptOpening}`),
      videoPrompt: this.prefixIfMissing(
        bundle.videoPrompt,
        `开场法：${strategy.openingMethod}。导演重点：${strategy.styleCue}。优先传达${strategy.primaryValue}，后续将推进到${strategy.progressionMode}。`,
      ),
      sceneFramePrompt: this.prefixIfMissing(
        bundle.sceneFramePrompt,
        `【开场法】\n${strategy.openingMethod}\n\n【导演重点】\n${strategy.styleCue}\n\n【首镜头价值】\n${strategy.primaryValue}`,
      ),
      firstFramePrompt: this.prefixIfMissing(
        bundle.firstFramePrompt,
        `【开场法】\n${strategy.openingMethod}\n\n【进入方式】\n${strategy.openingInstruction}`,
      ),
      lastFramePrompt: this.prefixIfMissing(
        bundle.lastFramePrompt,
        `【推进目标】\n${strategy.progressionMode}\n\n【尾部钩子】\n为第二节点留下明确推进入口`,
      ),
    };
  }

  private prefixIfMissing(text: string, prefix: string) {
    const value = String(text || '').trim();
    if (!value) return String(prefix || '').trim();
    if (value.includes(prefix)) return value;
    return `${prefix}\n\n${value}`;
  }

  private previewSimilarity(a: string, b: string) {
    return this.similarity.jaccard(a, b);
  }
}
