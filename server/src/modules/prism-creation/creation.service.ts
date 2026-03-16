import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IdeaPlannerAgent, IdeaPreviewOption } from './services/idea-planner.agent';
import { ScriptPlannerAgent, ScriptPlanResult } from './services/script-planner.agent';
import { StoryboardAgent, StoryboardCandidate } from './services/storyboard.agent';
import { CharacterAnchor, PromptDirectorAgent } from './services/prompt-director.agent';
import { CreationRenderService } from './services/creation-render.service';
import { ScenePlanPackage, ScenePlanScene, ScenePlannerAgent } from './services/scene-planner.agent';
import { CharacterAsset, CharacterAssetService } from './services/character-asset.service';
import { SceneAsset, SceneAssetService } from './services/scene-asset.service';
import { StoryboardSegment, StoryboardSegmentAgent } from './services/storyboard-segment.agent';
import { VoiceCasting, DialogueVoiceMapperAgent } from './services/dialogue-voice-mapper.agent';
import { PromptCompressionAgent } from './services/prompt-compression.agent';
import { VideoPromptCompilerAgent } from './services/video-prompt-compiler.agent';
import { FinalVideoComposeService } from './services/final-video-compose.service';
import { SegmentVideoRenderService } from './services/segment-video-render.service';
import {
  CreationConversationMessage,
  CreationConversationState,
  StoryConversationAgent,
} from './services/story-conversation.agent';
import {
  AppendConversationMessageDto,
  AdjustCreationDraftDto,
  BootstrapCreationProjectDto,
  ConfirmConversationWorkflowDto,
  CreateChapterNodesDto,
  CreateCreationSessionDto,
  CreationSessionSummaryDto,
  GenerateIdeaPreviewsDto,
  GenerateNextNodeCandidatesDto,
  GenerateNodeImageDto,
  GenerateProductionPackageDto,
  GenerateScriptPlanDto,
  MergeCreationNodesDto,
  SelectIdeaPreviewDto,
  StitchProjectDto,
  SelectNextNodeCandidateDto,
  UpdateScriptPlanChapterDto,
  UpdateCreationNodeDto,
  UpdateCreationSessionDto,
} from './dto';
import { CreationLlmService } from './services/creation-llm.service';

interface CreationNodeMeta {
  displayPromptCn?: string;
  imagePromptCn?: string;
  imagePromptModel?: string;
  videoPrompt?: string;
  continuityNotes?: string;
  characterAnchor?: CharacterAnchor;
  continuityLocked?: boolean;
  mergedFromNodeIds?: string[];
  sourceSegmentId?: string;
}

interface CreationProjectMeta {
  version: 'v2';
  mode?: 'idea' | 'script';
  backgroundVideoId?: string | null;
  conversationState?: CreationConversationState;
  scriptPackage?: { overallSummary: string; sourceScript: string };
  ideaInput?: Record<string, unknown>;
  previews?: IdeaPreviewOption[];
  selectedPreviewId?: string;
  scriptPlan?: ScriptPlanResult;
  scenePlan?: ScenePlanPackage;
  characterAssets?: CharacterAsset[];
  sceneAssets?: SceneAsset[];
  storyboardSegments?: StoryboardSegment[];
  voiceCasting?: VoiceCasting[];
  renderTasks?: Array<{
    taskId: string;
    type: 'node_render' | 'project_stitch';
    nodeId?: string;
    status: string;
    createdAt: string;
    videoUrl?: string;
    error?: string;
  }>;
  finalVideo?: {
    taskId: string;
    status: string;
    downloadUrl?: string;
    updatedAt: string;
  } | null;
  nextCandidatesByNode?: Record<string, StoryboardCandidate[]>;
  nodesMeta?: Record<string, CreationNodeMeta>;
}

@Injectable()
export class CreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ideaPlanner: IdeaPlannerAgent,
    private readonly scriptPlanner: ScriptPlannerAgent,
    private readonly storyboardAgent: StoryboardAgent,
    private readonly promptDirector: PromptDirectorAgent,
    private readonly storyConversation: StoryConversationAgent,
    private readonly scenePlanner: ScenePlannerAgent,
    private readonly characterAssetService: CharacterAssetService,
    private readonly sceneAssetService: SceneAssetService,
    private readonly storyboardSegmentAgent: StoryboardSegmentAgent,
    private readonly voiceMapper: DialogueVoiceMapperAgent,
    private readonly promptCompression: PromptCompressionAgent,
    private readonly videoPromptCompiler: VideoPromptCompilerAgent,
    private readonly renderService: CreationRenderService,
    private readonly segmentVideoRenderService: SegmentVideoRenderService,
    private readonly finalVideoComposeService: FinalVideoComposeService,
    private readonly llm: CreationLlmService,
  ) {}

  async bootstrapByProject(userId: string, projectId: string, dto: BootstrapCreationProjectDto) {
    const project = await this.assertProjectOwnership(userId, projectId);
    let backgroundVideoId: string | null = null;

    if (dto.backgroundVideoId) {
      const video = await this.assertVideoAccess(userId, dto.backgroundVideoId);
      if (video.projectId !== projectId) {
        throw new ForbiddenException('背景视频不属于当前工程');
      }
      backgroundVideoId = video.id;
    }

    let flowProject = dto.flowProjectId
      ? await this.prisma.prismFlowProject.findFirst({
          where: { id: dto.flowProjectId, projectId },
        })
      : await this.prisma.prismFlowProject.findFirst({
          where: { projectId },
          orderBy: { updatedAt: 'desc' },
        });

    if (!flowProject) {
      flowProject = await this.createFlowProject(projectId, project.name, {
        name: dto.name,
        backgroundVideoId,
      });
    } else if (backgroundVideoId && flowProject.videoId !== backgroundVideoId) {
      const meta = this.getProjectMeta(flowProject.stylePreset);
      meta.backgroundVideoId = backgroundVideoId;
      flowProject = await this.prisma.prismFlowProject.update({
        where: { id: flowProject.id },
        data: {
          videoId: backgroundVideoId,
          stylePreset: meta as any,
        },
      });
    }

    return this.getGraph(userId, flowProject.id);
  }

  async bootstrap(userId: string, videoId: string, dto: BootstrapCreationProjectDto) {
    const video = await this.assertVideoAccess(userId, videoId);
    return this.bootstrapByProject(userId, video.projectId, {
      ...dto,
      backgroundVideoId: video.id,
      name: dto.name?.trim() || `${video.project.name} · 创作工程`,
    });
  }

  async resetProject(userId: string, flowProjectId: string) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const resetMeta: CreationProjectMeta = {
      version: 'v2',
      mode: 'idea',
      backgroundVideoId: meta.backgroundVideoId || flowProject.videoId || null,
      ideaInput: {},
      previews: [],
      selectedPreviewId: undefined,
      scriptPlan: undefined,
      nextCandidatesByNode: {},
      conversationState: this.createEmptyConversationState(),
      scriptPackage: undefined,
      scenePlan: undefined,
      characterAssets: [],
      sceneAssets: [],
      storyboardSegments: [],
      voiceCasting: [],
      renderTasks: [],
      finalVideo: null,
      nodesMeta: {},
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.flowNode.deleteMany({
        where: { flowProjectId: flowProject.id },
      });

      await tx.prismFlowProject.update({
        where: { id: flowProject.id },
        data: {
          scriptText: null,
          status: 'PENDING',
          stylePreset: resetMeta as any,
        },
      });
    });

    return this.getGraph(userId, flowProject.id);
  }

  async listSessionsByProject(userId: string, projectId: string): Promise<CreationSessionSummaryDto[]> {
    await this.assertProjectOwnership(userId, projectId);
    const sessions = await this.prisma.prismFlowProject.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: {
        nodes: {
          select: { id: true },
          take: 1,
        },
      },
    });

    return sessions.map((session) => this.toSessionSummary(session));
  }

  async createSessionByProject(userId: string, projectId: string, dto: CreateCreationSessionDto = {}) {
    const project = await this.assertProjectOwnership(userId, projectId);
    let backgroundVideoId: string | null = null;
    if (dto.backgroundVideoId) {
      const video = await this.assertVideoAccess(userId, dto.backgroundVideoId);
      if (video.projectId !== projectId) {
        throw new ForbiddenException('背景视频不属于当前工程');
      }
      backgroundVideoId = video.id;
    }

    const flowProject = await this.createFlowProject(projectId, project.name, {
      name: dto.name,
      backgroundVideoId,
    });
    return this.getGraph(userId, flowProject.id);
  }

  async updateSession(userId: string, flowProjectId: string, dto: UpdateCreationSessionDto) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const nextName = String(dto.name || '').trim();
    if (!nextName) {
      throw new NotFoundException('会话名称不能为空');
    }

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: { name: nextName },
    });

    return this.getGraph(userId, flowProject.id);
  }

  async deleteSession(userId: string, flowProjectId: string) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const projectId = flowProject.projectId || flowProject.video?.projectId;
    await this.prisma.prismFlowProject.delete({
      where: { id: flowProject.id },
    });

    if (!projectId) {
      return { deleted: true, sessions: [] };
    }

    const sessions = await this.listSessionsByProject(userId, projectId);
    return { deleted: true, sessions };
  }

  async getGraph(userId: string, flowProjectId: string) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);

    const nodes = await this.prisma.flowNode.findMany({
      where: { flowProjectId },
      orderBy: { orderIndex: 'asc' },
    });

    return {
      project: {
        id: flowProject.id,
        videoId: flowProject.videoId || meta.backgroundVideoId || null,
        projectId: flowProject.projectId || flowProject.video?.projectId || null,
        name: flowProject.name,
        mode: meta.mode || 'idea',
        status: flowProject.status,
        scriptText: flowProject.scriptText,
        meta: {
          backgroundVideoId: meta.backgroundVideoId || null,
          conversationState: meta.conversationState,
          scriptPackage: meta.scriptPackage || null,
          previews: meta.previews || [],
          selectedPreviewId: meta.selectedPreviewId || null,
          scriptPlan: meta.scriptPlan || null,
          scenePlan: meta.scenePlan || null,
          characterAssets: meta.characterAssets || [],
          sceneAssets: meta.sceneAssets || [],
          storyboardSegments: meta.storyboardSegments || [],
          voiceCasting: meta.voiceCasting || [],
          renderTasks: meta.renderTasks || [],
          finalVideo: meta.finalVideo || null,
        },
      },
      nodes: nodes.map((node) => ({
        ...(this.getNodeMeta(meta, node.id)),
        id: node.id,
        title: node.branchName || `节点 ${node.orderIndex + 1}`,
        scriptSegment: node.scriptSegment || '',
        modelPrompt: node.prompt || '',
        orderIndex: node.orderIndex,
        positionX: node.positionX,
        positionY: node.positionY,
        parentNodeId: node.parentNodeId,
        firstFrameUrl: node.firstFrameUrl,
        lastFrameUrl: node.lastFrameUrl,
        renderedVideoUrl: node.renderedVideoUrl,
        renderStatus: node.renderStatus,
        isMerged: Boolean(node.isMerged),
      })),
    };
  }

  async generateIdeaPreviewsByProject(userId: string, projectId: string, dto: GenerateIdeaPreviewsDto) {
    const bootstrapped = await this.bootstrapByProject(userId, projectId, {
      backgroundVideoId: dto.backgroundVideoId,
      flowProjectId: dto.flowProjectId,
    });
    const flowProjectId = bootstrapped.project.id;
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);

    const result = await this.ideaPlanner.generate(userId, {
      idea: dto.idea,
      conflict: dto.conflict,
      setting: dto.setting,
      visualGoal: dto.visualGoal,
      constraints: dto.constraints,
      count: dto.count || 3,
    });

    meta.mode = 'idea';
    meta.backgroundVideoId = dto.backgroundVideoId || meta.backgroundVideoId || flowProject.videoId || null;
    meta.ideaInput = {
      idea: dto.idea,
      conflict: dto.conflict || '',
      setting: dto.setting || '',
      visualGoal: dto.visualGoal || '',
      constraints: dto.constraints || '',
    };
    meta.previews = result.previews;
    meta.selectedPreviewId = undefined;

    await this.prisma.prismFlowProject.update({
      where: { id: flowProjectId },
      data: {
        scriptText: dto.idea,
        videoId: meta.backgroundVideoId || undefined,
        stylePreset: meta as any,
      },
    });

    return {
      flowProjectId,
      previews: result.previews,
    };
  }

  async appendConversationMessageByProject(
    userId: string,
    projectId: string,
    dto: AppendConversationMessageDto,
  ) {
    const bootstrapped = await this.bootstrapByProject(userId, projectId, {
      backgroundVideoId: dto.backgroundVideoId,
      flowProjectId: dto.flowProjectId,
    });
    const flowProject = await this.assertProjectAccess(userId, bootstrapped.project.id);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const conversationState = meta.conversationState || this.createEmptyConversationState();
    const now = new Date().toISOString();
    const userMessage: CreationConversationMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: dto.content.trim(),
      createdAt: now,
    };

    const userMessages = [...conversationState.messages, userMessage].slice(-20);
    const summarized = await this.storyConversation.summarize(
      userId,
      userMessages.map(({ role, content }) => ({ role, content })),
    );

    const assistantMessage: CreationConversationMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: summarized.assistantReply,
      createdAt: new Date().toISOString(),
    };

    meta.mode = 'script';
    meta.backgroundVideoId = dto.backgroundVideoId || meta.backgroundVideoId || flowProject.videoId || null;
    meta.conversationState = {
      messages: [...userMessages, assistantMessage].slice(-24),
      summary: summarized.summary,
      scriptDraft: summarized.scriptDraft,
      chaptersHint: summarized.chaptersHint,
      lastUpdatedAt: assistantMessage.createdAt,
    };

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: {
        videoId: meta.backgroundVideoId || undefined,
        scriptText: summarized.scriptDraft || flowProject.scriptText,
        stylePreset: meta as any,
      },
    });

    return this.getGraph(userId, flowProject.id);
  }

  async confirmConversationWorkflow(
    userId: string,
    flowProjectId: string,
    dto: ConfirmConversationWorkflowDto = {},
  ) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const conversation = meta.conversationState || this.createEmptyConversationState();
    const storyIntent = String(conversation.summary.storyIntent || conversation.scriptDraft || flowProject.scriptText || '').trim();
    if (!storyIntent) {
      throw new NotFoundException('当前还没有足够的对话内容，请先完成导演对话');
    }

    const projectId = flowProject.projectId || flowProject.video?.projectId;
    if (!projectId) {
      throw new NotFoundException('创作工程缺少 projectId');
    }

    await this.generateIdeaPreviewsByProject(userId, projectId, {
      flowProjectId,
      idea: storyIntent,
      visualGoal: String(conversation.summary.visualStyle || '').trim() || undefined,
      constraints: String(conversation.summary.splitPreference || '').trim() || undefined,
      count: 3,
      backgroundVideoId: meta.backgroundVideoId || flowProject.videoId || undefined,
    });

    const latestAfterPreviews = await this.assertProjectAccess(userId, flowProjectId);
    const latestMeta = this.getProjectMeta(latestAfterPreviews.stylePreset);
    const scriptText = String(
      latestMeta.conversationState?.scriptDraft || latestAfterPreviews.scriptText || storyIntent,
    ).trim();

    await this.generateScriptPlanByProject(userId, projectId, {
      flowProjectId,
      scriptText,
      chaptersHint: latestMeta.conversationState?.chaptersHint || 4,
      backgroundVideoId: latestMeta.backgroundVideoId || latestAfterPreviews.videoId || undefined,
    });

    await this.generateProductionPackage(userId, flowProjectId, {
      artStyle: latestMeta.conversationState?.summary.visualStyle || undefined,
    });

    const refreshed = await this.assertProjectAccess(userId, flowProjectId);
    const refreshedMeta = this.getProjectMeta(refreshed.stylePreset);
    const previewChapterIndex =
      dto.previewChapterIndex ||
      refreshedMeta.scriptPlan?.chapters?.[0]?.index ||
      refreshedMeta.storyboardSegments?.[0]?.chapterIndex;
    const previewImageCount = Math.max(1, Math.min(9, Number(dto.previewImageCount || 9)));

    if (previewChapterIndex) {
      const segments = (refreshedMeta.storyboardSegments || [])
        .filter((item) => item.chapterIndex === previewChapterIndex)
        .slice(0, previewImageCount);

      for (const segment of segments) {
        if (segment.storyboardImageUrl) continue;
        await this.generateProductionAssetImage(userId, flowProjectId, 'segment', segment.id);
      }
    }

    return this.getGraph(userId, flowProjectId);
  }

  async generateIdeaPreviews(userId: string, videoId: string, dto: GenerateIdeaPreviewsDto) {
    const video = await this.assertVideoAccess(userId, videoId);
    return this.generateIdeaPreviewsByProject(userId, video.projectId, {
      ...dto,
      backgroundVideoId: video.id,
    });
  }

  async selectIdeaPreview(userId: string, flowProjectId: string, dto: SelectIdeaPreviewDto) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const preview = (meta.previews || []).find((item) => item.id === dto.previewId);
    if (!preview) throw new NotFoundException('未找到对应的故事方向');

    const promptBundle = await this.promptDirector.compile(userId, {
      projectIntent: String(meta.ideaInput?.idea || flowProject.scriptText || ''),
      nodeTitle: preview.title,
      scriptSegment: preview.firstNodeScript,
      visualDescription: preview.openingScene,
    });

    const count = await this.prisma.flowNode.count({ where: { flowProjectId } });
    const node = await this.prisma.flowNode.create({
      data: {
        flowProjectId,
        orderIndex: count,
        branchName: preview.title,
        scriptSegment: preview.firstNodeScript,
        prompt: promptBundle.videoPromptModel || promptBundle.imagePromptModel,
        positionX: 120 + count * 340,
        positionY: 180,
      },
    });

    meta.selectedPreviewId = dto.previewId;
    meta.mode = 'idea';
    meta.nodesMeta = meta.nodesMeta || {};
    meta.nodesMeta[node.id] = {
      displayPromptCn: promptBundle.displayPromptCn,
      imagePromptCn: promptBundle.imagePromptCn,
      imagePromptModel: promptBundle.imagePromptModel,
      videoPrompt: promptBundle.videoPromptModel,
      continuityNotes: promptBundle.continuityNotes,
      characterAnchor: promptBundle.characterAnchor,
      continuityLocked: false,
    };

    await this.prisma.prismFlowProject.update({
      where: { id: flowProjectId },
      data: { stylePreset: meta as any, status: 'PROCESSING' },
    });

    return this.getGraph(userId, flowProjectId);
  }

  async generateScriptPlanByProject(userId: string, projectId: string, dto: GenerateScriptPlanDto) {
    const bootstrapped = await this.bootstrapByProject(userId, projectId, {
      backgroundVideoId: dto.backgroundVideoId,
      flowProjectId: dto.flowProjectId,
    });
    const flowProject = await this.assertProjectAccess(userId, bootstrapped.project.id);
    const meta = this.getProjectMeta(flowProject.stylePreset);

    const plan = await this.scriptPlanner.generate(userId, dto.scriptText, dto.chaptersHint || 4);
    meta.mode = 'script';
    meta.backgroundVideoId = dto.backgroundVideoId || meta.backgroundVideoId || flowProject.videoId || null;
    meta.scriptPlan = plan;
    meta.conversationState = {
      ...(meta.conversationState || this.createEmptyConversationState()),
      scriptDraft: dto.scriptText,
      chaptersHint: dto.chaptersHint || meta.conversationState?.chaptersHint || 4,
      lastUpdatedAt: new Date().toISOString(),
    };

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: {
        scriptText: dto.scriptText,
        videoId: meta.backgroundVideoId || undefined,
        stylePreset: meta as any,
      },
    });

    return {
      flowProjectId: flowProject.id,
      scriptPlan: plan,
    };
  }

  async generateScriptPlan(userId: string, videoId: string, dto: GenerateScriptPlanDto) {
    const video = await this.assertVideoAccess(userId, videoId);
    return this.generateScriptPlanByProject(userId, video.projectId, {
      ...dto,
      backgroundVideoId: video.id,
    });
  }

  async updateScriptPlanChapter(
    userId: string,
    flowProjectId: string,
    chapterIndex: number,
    dto: UpdateScriptPlanChapterDto,
  ) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const plan = meta.scriptPlan;
    if (!plan?.chapters?.length) {
      throw new NotFoundException('当前工程还没有章节结构');
    }

    const chapter = plan.chapters.find((item) => item.index === chapterIndex);
    if (!chapter) {
      throw new NotFoundException('未找到对应章节');
    }

    const updatedPlan: ScriptPlanResult = {
      ...plan,
      chapters: plan.chapters.map((item) =>
        item.index === chapterIndex
          ? {
              ...item,
              ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
              ...(dto.summary !== undefined ? { summary: dto.summary.trim() } : {}),
              ...(dto.goal !== undefined ? { goal: dto.goal.trim() } : {}),
              ...(dto.storyboardCount !== undefined ? { storyboardCount: dto.storyboardCount } : {}),
            }
          : item,
      ),
    };

    meta.scriptPlan = updatedPlan;
    meta.conversationState = {
      ...(meta.conversationState || this.createEmptyConversationState()),
      lastUpdatedAt: new Date().toISOString(),
    };

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: {
        stylePreset: meta as any,
      },
    });

    return this.getGraph(userId, flowProject.id);
  }

  async generateProductionPackage(
    userId: string,
    flowProjectId: string,
    dto: GenerateProductionPackageDto = {},
  ) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const sourceScript = String(flowProject.scriptText || meta.conversationState?.scriptDraft || '').trim();
    if (!sourceScript) {
      throw new NotFoundException('当前工程还没有可用于生产的剧本文本');
    }
    if (!meta.scriptPlan?.chapters?.length) {
      throw new NotFoundException('当前工程还没有章节结构，请先生成章节结构');
    }

    const artStyle = String(
      dto.artStyle ||
        meta.conversationState?.summary.visualStyle ||
        meta.ideaInput?.visualGoal ||
        '电影化、连续分镜、写实质感',
    ).trim();

    const scenePlan = await this.scenePlanner.generate(userId, {
      scriptText: sourceScript,
      scriptPlan: meta.scriptPlan,
    });

    const [characterAssets, sceneAssets, rawSegments] = await Promise.all([
      this.characterAssetService.generate(userId, {
        scriptText: sourceScript,
        artStyle,
        scenes: scenePlan.scenes,
      }),
      this.sceneAssetService.generate(userId, {
        artStyle,
        scenes: scenePlan.scenes,
      }),
      this.storyboardSegmentAgent.generate(userId, {
        scenes: scenePlan.scenes,
      }),
    ]);

    const voiceCasting = await this.voiceMapper.generate(userId, { characters: characterAssets });

    const sceneAssetMap = new Map(sceneAssets.map((item) => [item.sceneId, item]));
    let previousPromptBundle: Awaited<ReturnType<VideoPromptCompilerAgent['compile']>> | null = null;

    const storyboardSegments: StoryboardSegment[] = [];
    for (const segment of rawSegments) {
      const bundle = await this.videoPromptCompiler.compile(userId, {
        projectIntent: scenePlan.overallSummary || sourceScript,
        segment,
        sceneAsset: sceneAssetMap.get(segment.sceneId) || null,
        characterAssets,
        previousPrompt: previousPromptBundle,
      });

      const compiledVideoPrompt =
        segment.contentType === 'action'
          ? `${bundle.videoPromptModel} Dynamic action emphasis, motion blur, impact rhythm, environmental feedback.`
          : segment.contentType === 'dialogue'
            ? `${bundle.videoPromptModel} Preserve performance beats, gaze direction, subtle breathing, conversational timing.`
            : `${bundle.videoPromptModel} Balance performance, motion, and environment continuity.`;

      const compressedVideoPrompt = this.promptCompression.compress(compiledVideoPrompt, 1800);

      storyboardSegments.push({
        ...segment,
        displayPromptCn: bundle.displayPromptCn,
        imagePromptCn: bundle.imagePromptCn,
        imagePromptModel: bundle.imagePromptModel,
        continuityNotes: bundle.continuityNotes,
        videoPrompt: compiledVideoPrompt,
        compressedVideoPrompt,
      });

      previousPromptBundle = bundle;
    }

    meta.scriptPackage = {
      overallSummary: scenePlan.overallSummary,
      sourceScript,
    };
    meta.scenePlan = scenePlan;
    meta.characterAssets = characterAssets;
    meta.sceneAssets = sceneAssets;
    meta.storyboardSegments = storyboardSegments;
    meta.voiceCasting = voiceCasting;

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: {
        stylePreset: meta as any,
      },
    });

    return this.getGraph(userId, flowProject.id);
  }

  async generateProductionAssetImage(
    userId: string,
    flowProjectId: string,
    assetType: 'character' | 'scene' | 'segment',
    assetId: string,
  ) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const resolvedProjectId = flowProject.projectId || flowProject.video?.projectId;
    if (!resolvedProjectId) {
      throw new Error('创作工程缺少 projectId，无法生成生产资产图片');
    }

    if (assetType === 'character') {
      const nextAssets = (meta.characterAssets || []).map((item) => ({ ...item }));
      const target = nextAssets.find((item) => item.id === assetId);
      if (!target) throw new NotFoundException('未找到对应角色资产');
      target.imageUrl = await this.renderService.generateProjectAssetImage({
        userId,
        projectId: resolvedProjectId,
        prompt: target.imagePrompt,
        category: 'character-assets',
        fileStem: target.id,
      });
      meta.characterAssets = nextAssets;
    } else if (assetType === 'scene') {
      const nextAssets = (meta.sceneAssets || []).map((item) => ({ ...item }));
      const target = nextAssets.find((item) => item.id === assetId);
      if (!target) throw new NotFoundException('未找到对应场景资产');
      target.imageUrl = await this.renderService.generateProjectAssetImage({
        userId,
        projectId: resolvedProjectId,
        prompt: target.imagePrompt,
        category: 'scene-assets',
        fileStem: target.id,
      });
      meta.sceneAssets = nextAssets;
    } else {
      const nextSegments = (meta.storyboardSegments || []).map((item) => ({ ...item }));
      const target = nextSegments.find((item) => item.id === assetId);
      if (!target) throw new NotFoundException('未找到对应分镜片段');
      const prompt =
        target.imagePromptModel ||
        target.imagePromptCn ||
        target.displayPromptCn ||
        target.summary;
      target.storyboardImageUrl = await this.renderService.generateProjectAssetImage({
        userId,
        projectId: resolvedProjectId,
        prompt,
        category: 'storyboard-assets',
        fileStem: target.id,
      });
      meta.storyboardSegments = nextSegments;
    }

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: {
        stylePreset: meta as any,
      },
    });

    return this.getGraph(userId, flowProject.id);
  }

  async createChapterNodes(userId: string, flowProjectId: string, dto: CreateChapterNodesDto) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const chapter = meta.scriptPlan?.chapters?.find((item) => item.index === dto.chapterIndex);
    if (!chapter) throw new NotFoundException('未找到对应章节');
    const precomputedSegments = (meta.storyboardSegments || []).filter((item) => item.chapterIndex === dto.chapterIndex);
    const nodes =
      precomputedSegments.length > 0
        ? precomputedSegments.map((item) => ({
            id: item.id,
            title: item.title,
            scriptSegment: item.summary,
            visualDescription: item.visualDescription,
          }))
        : await this.storyboardAgent.createChapterNodes(userId, chapter, {
            projectIntent: flowProject.scriptText || '',
          });

    const existingCount = await this.prisma.flowNode.count({ where: { flowProjectId } });
    const lastExistingNode = await this.prisma.flowNode.findFirst({
      where: { flowProjectId },
      orderBy: { orderIndex: 'desc' },
    });
    let prevNodeId: string | null = lastExistingNode?.id || null;

    meta.nodesMeta = meta.nodesMeta || {};
    const precomputedMap = new Map(precomputedSegments.map((item) => [item.id, item]));

    for (let i = 0; i < nodes.length; i += 1) {
      const candidate = nodes[i];
      const productionSegment = precomputedMap.get(candidate.id);
      const promptBundle = productionSegment
        ? {
            displayPromptCn: productionSegment.displayPromptCn || '',
            imagePromptCn: productionSegment.imagePromptCn || '',
            imagePromptModel: productionSegment.imagePromptModel || '',
            videoPromptModel: productionSegment.compressedVideoPrompt || productionSegment.videoPrompt || '',
            continuityNotes: productionSegment.continuityNotes || '',
            characterAnchor: this.buildCharacterAnchorFromSegment(productionSegment, meta.characterAssets || []),
          }
        : await this.promptDirector.compile(userId, {
            projectIntent: flowProject.scriptText || '',
            nodeTitle: candidate.title,
            scriptSegment: candidate.scriptSegment,
            visualDescription: candidate.visualDescription,
          });

      const created = await this.prisma.flowNode.create({
        data: {
          flowProjectId,
          orderIndex: existingCount + i,
          branchName: candidate.title,
          scriptSegment: candidate.scriptSegment,
          prompt: promptBundle.videoPromptModel || promptBundle.imagePromptModel,
          positionX: 120 + (existingCount + i) * 340,
          positionY: 180,
          parentNodeId: prevNodeId || undefined,
        },
      });

      meta.nodesMeta[created.id] = {
        displayPromptCn: promptBundle.displayPromptCn,
        imagePromptCn: promptBundle.imagePromptCn,
        imagePromptModel: promptBundle.imagePromptModel,
        videoPrompt: promptBundle.videoPromptModel,
        continuityNotes: promptBundle.continuityNotes,
        characterAnchor: promptBundle.characterAnchor,
        continuityLocked: false,
        sourceSegmentId: productionSegment?.id,
      };

      prevNodeId = created.id;
    }

    await this.prisma.prismFlowProject.update({
      where: { id: flowProjectId },
      data: { stylePreset: meta as any, status: 'PROCESSING' },
    });

    return this.getGraph(userId, flowProjectId);
  }

  async confirmSegmentPreview(userId: string, flowProjectId: string, segmentId: string) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const targetSegment = (meta.storyboardSegments || []).find((item) => item.id === segmentId);
    if (!targetSegment) {
      throw new NotFoundException('未找到对应的预览分镜片段');
    }

    let existingNode = await this.findNodeBySourceSegmentId(flowProjectId, segmentId);
    if (!existingNode) {
      await this.createChapterNodes(userId, flowProjectId, { chapterIndex: targetSegment.chapterIndex });
      existingNode = await this.findNodeBySourceSegmentId(flowProjectId, segmentId);
    }

    if (!existingNode) {
      throw new NotFoundException('无法将分镜片段接入短剧节点链路');
    }

    const refreshedNode = await this.prisma.flowNode.findUniqueOrThrow({ where: { id: existingNode.id } });
    if (!refreshedNode.lastFrameUrl && !refreshedNode.firstFrameUrl) {
      await this.generateNodeImage(userId, refreshedNode.id, {});
    }

    const renderTask = await this.renderNodeVideo(userId, refreshedNode.id);
    return {
      nodeId: refreshedNode.id,
      segmentId,
      renderTask,
      graph: await this.getGraph(userId, flowProjectId),
    };
  }

  async adjustDraft(userId: string, flowProjectId: string, dto: AdjustCreationDraftDto) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const targetType = String(dto.targetType || '').trim();
    const instruction = String(dto.instruction || '').trim();
    if (!instruction) {
      throw new NotFoundException('调整意见不能为空');
    }

    if (targetType === 'preview') {
      const previews = meta.previews || [];
      const target = previews.find((item) => item.id === dto.targetId);
      if (!target) {
        throw new NotFoundException('未找到对应故事方向');
      }

      const system = [
        '你是专业电影导演兼编剧顾问。',
        '请根据用户的调整意见，优化一个视频故事方向草案。',
        '你需要保留原方向的核心吸引力，但从导演视角增强人物关系、冲突、悬念、视觉亮点和可拍性。',
        '输出必须是 JSON，且字段完整。',
        '字段：{"title":"","openingScene":"","conflict":"","progression":"","whyItWorks":"","firstNodeScript":""}',
      ].join('\n');

      const adjusted = await this.llm.generateJson<IdeaPreviewOption>(
        userId,
        system,
        [
          `原故事方向：${JSON.stringify(target)}`,
          `当前剧本草稿：${String(meta.conversationState?.scriptDraft || flowProject.scriptText || '').trim()}`,
          `用户调整意见：${instruction}`,
        ].join('\n'),
        1800,
      );

      meta.previews = previews.map((item) =>
        item.id === dto.targetId
          ? {
              ...item,
              title: String(adjusted.title || item.title).trim(),
              openingScene: String(adjusted.openingScene || item.openingScene).trim(),
              conflict: String(adjusted.conflict || item.conflict).trim(),
              progression: String(adjusted.progression || item.progression).trim(),
              whyItWorks: String(adjusted.whyItWorks || item.whyItWorks).trim(),
              firstNodeScript: String(adjusted.firstNodeScript || item.firstNodeScript).trim(),
            }
          : item,
      );
    } else if (targetType === 'chapter') {
      const plan = meta.scriptPlan;
      if (!plan?.chapters?.length) {
        throw new NotFoundException('当前工程还没有章节结构');
      }
      const chapterIndex = Number(dto.targetId);
      const target = plan.chapters.find((item) => item.index === chapterIndex);
      if (!target) {
        throw new NotFoundException('未找到对应章节');
      }

      const system = [
        '你是专业电影导演兼剧本医生。',
        '请根据用户的调整意见，优化一个章节设计。',
        '从导演视角增强章节目标、戏剧张力、信息释放节奏、镜头可拆分性。',
        '输出必须是 JSON，字段：{"title":"","summary":"","goal":"","storyboardCount":4}',
        'storyboardCount 必须是 2 到 6 的整数。',
      ].join('\n');

      const adjusted = await this.llm.generateJson<{
        title?: string;
        summary?: string;
        goal?: string;
        storyboardCount?: number;
      }>(
        userId,
        system,
        [
          `原章节：${JSON.stringify(target)}`,
          `总剧情摘要：${String(plan.summary || meta.conversationState?.scriptDraft || '').trim()}`,
          `用户调整意见：${instruction}`,
        ].join('\n'),
        1400,
      );

      meta.scriptPlan = {
        ...plan,
        chapters: plan.chapters.map((item) =>
          item.index === chapterIndex
            ? {
                ...item,
                title: String(adjusted.title || item.title).trim(),
                summary: String(adjusted.summary || item.summary).trim(),
                goal: String(adjusted.goal || item.goal).trim(),
                storyboardCount: Math.max(2, Math.min(6, Number(adjusted.storyboardCount || item.storyboardCount))),
              }
            : item,
        ),
      };
    } else {
      throw new NotFoundException('不支持的调整目标');
    }

    meta.conversationState = {
      ...(meta.conversationState || this.createEmptyConversationState()),
      lastUpdatedAt: new Date().toISOString(),
    };

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: { stylePreset: meta as any },
    });

    return this.getGraph(userId, flowProject.id);
  }

  async mergeNodes(userId: string, flowProjectId: string, dto: MergeCreationNodesDto) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const sourceNodeIds = Array.from(
      new Set(dto.sourceNodeIds.map((item) => String(item || '').trim()).filter(Boolean)),
    );

    if (sourceNodeIds.length < 2) {
      throw new NotFoundException('至少需要两个节点才能合并');
    }

    const sourceNodes = await this.prisma.flowNode.findMany({
      where: {
        flowProjectId,
        id: { in: sourceNodeIds },
      },
      orderBy: { orderIndex: 'asc' },
    });

    if (sourceNodes.length !== sourceNodeIds.length) {
      throw new NotFoundException('部分待合并节点不存在或不属于当前工程');
    }

    const primaryNode = sourceNodes[0];
    const primaryMeta = this.getNodeMeta(meta, primaryNode.id);
    const mergedTitle =
      String(dto.title || '').trim() ||
      `合并镜头：${sourceNodes.map((item) => item.branchName || `节点${item.orderIndex + 1}`).join(' + ')}`;
    const mergedScript = sourceNodes
      .map(
        (item, index) =>
          `${index + 1}. ${String(item.scriptSegment || item.branchName || `节点${item.orderIndex + 1}`).trim()}`,
      )
      .join('\n');
    const visualDescription =
      String(dto.instructions || '').trim() ||
      `把以上多个分支镜头合并成一个新的收束镜头，保留人物锚点、场景色调和连续性，并自然衔接已有叙事。`;

    const promptBundle = await this.promptDirector.compile(userId, {
      projectIntent: flowProject.scriptText || '',
      nodeTitle: mergedTitle,
      scriptSegment: mergedScript,
      visualDescription,
      previousNodeTitle: primaryNode.branchName || '',
      previousNodeSummary: primaryNode.scriptSegment || '',
      previousNodeVisualPrompt:
        primaryMeta.imagePromptCn ||
        primaryMeta.displayPromptCn ||
        '',
      previousContinuityNotes: primaryMeta.continuityNotes || '',
      previousCharacterAnchor: primaryMeta.characterAnchor,
      previousContinuityLocked: true,
    });

    const nextOrder =
      (
        await this.prisma.flowNode.aggregate({
          where: { flowProjectId: flowProject.id },
          _max: { orderIndex: true },
        })
      )._max.orderIndex ?? 0;
    const averageY = sourceNodes.reduce((sum, item) => sum + Number(item.positionY || 0), 0) / sourceNodes.length;
    const maxX = Math.max(...sourceNodes.map((item) => Number(item.positionX || 0)));

    const created = await this.prisma.flowNode.create({
      data: {
        flowProjectId: flowProject.id,
        orderIndex: nextOrder + 1,
        branchName: mergedTitle,
        scriptSegment: mergedScript,
        prompt: promptBundle.videoPromptModel || promptBundle.imagePromptModel,
        positionX: maxX + 360,
        positionY: Number.isFinite(averageY) ? averageY : primaryNode.positionY,
        parentNodeId: primaryNode.id,
        isMerged: true,
      },
    });

    meta.nodesMeta = meta.nodesMeta || {};
    meta.nodesMeta[created.id] = {
      displayPromptCn: promptBundle.displayPromptCn,
      imagePromptCn: promptBundle.imagePromptCn,
      imagePromptModel: promptBundle.imagePromptModel,
      videoPrompt: promptBundle.videoPromptModel,
      continuityNotes: `${promptBundle.continuityNotes}\n合并来源：${sourceNodes
        .map((item) => item.branchName || `节点${item.orderIndex + 1}`)
        .join(' / ')}`.trim(),
      characterAnchor: promptBundle.characterAnchor,
      continuityLocked: true,
      mergedFromNodeIds: sourceNodeIds,
    };

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: { stylePreset: meta as any },
    });

    return this.getGraph(userId, flowProject.id);
  }

  async updateNode(userId: string, nodeId: string, dto: UpdateCreationNodeDto) {
    const node = await this.assertNodeAccess(userId, nodeId);
    const flowProject = await this.assertProjectAccess(userId, node.flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    meta.nodesMeta = meta.nodesMeta || {};
    const currentNodeMeta = this.getNodeMeta(meta, node.id);
    const hasCharacterPatch =
      dto.characterIdentity !== undefined ||
      dto.characterHair !== undefined ||
      dto.characterOutfit !== undefined ||
      dto.characterFace !== undefined ||
      dto.characterProp !== undefined;

    await this.prisma.flowNode.update({
      where: { id: nodeId },
      data: {
        branchName: dto.title ?? node.branchName,
        scriptSegment: dto.scriptSegment ?? node.scriptSegment,
        prompt: dto.modelPrompt ?? node.prompt,
        positionX: dto.positionX ?? node.positionX,
        positionY: dto.positionY ?? node.positionY,
      },
    });

    meta.nodesMeta[node.id] = {
      ...currentNodeMeta,
      ...(dto.displayPromptCn !== undefined ? { displayPromptCn: dto.displayPromptCn } : {}),
      ...(dto.imagePromptCn !== undefined ? { imagePromptCn: dto.imagePromptCn } : {}),
      ...(dto.modelPrompt !== undefined ? { imagePromptModel: dto.modelPrompt } : {}),
      ...(dto.videoPrompt !== undefined ? { videoPrompt: dto.videoPrompt } : {}),
      ...(hasCharacterPatch
        ? {
            characterAnchor: {
              identity: dto.characterIdentity ?? currentNodeMeta.characterAnchor.identity,
              hair: dto.characterHair ?? currentNodeMeta.characterAnchor.hair,
              outfit: dto.characterOutfit ?? currentNodeMeta.characterAnchor.outfit,
              face: dto.characterFace ?? currentNodeMeta.characterAnchor.face,
              prop: dto.characterProp ?? currentNodeMeta.characterAnchor.prop,
            },
          }
        : {}),
      ...(dto.continuityLocked !== undefined ? { continuityLocked: dto.continuityLocked } : {}),
    };

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: { stylePreset: meta as any },
    });

    return this.getGraph(userId, flowProject.id);
  }

  async deleteNode(userId: string, nodeId: string) {
    const node = await this.assertNodeAccess(userId, nodeId);
    const flowProject = await this.assertProjectAccess(userId, node.flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);

    const siblings = await this.prisma.flowNode.findMany({
      where: { flowProjectId: flowProject.id },
      orderBy: { orderIndex: 'asc' },
    });

    const children = siblings.filter((item) => item.parentNodeId === node.id);

    await this.prisma.$transaction(async (tx) => {
      for (const child of children) {
        await tx.flowNode.update({
          where: { id: child.id },
          data: { parentNodeId: node.parentNodeId || null },
        });
      }

      await tx.flowNode.delete({
        where: { id: node.id },
      });

      const remaining = siblings.filter((item) => item.id !== node.id);
      for (let index = 0; index < remaining.length; index += 1) {
        const item = remaining[index];
        if (item.orderIndex !== index) {
          await tx.flowNode.update({
            where: { id: item.id },
            data: { orderIndex: index },
          });
        }
      }

      if (meta.nodesMeta?.[node.id]) {
        delete meta.nodesMeta[node.id];
      }
      if (meta.nextCandidatesByNode?.[node.id]) {
        delete meta.nextCandidatesByNode[node.id];
      }

      await tx.prismFlowProject.update({
        where: { id: flowProject.id },
        data: { stylePreset: meta as any },
      });
    });

    return this.getGraph(userId, flowProject.id);
  }

  async generateNextNodeCandidates(userId: string, nodeId: string, dto: GenerateNextNodeCandidatesDto) {
    const node = await this.assertNodeAccess(userId, nodeId);
    const flowProject = await this.assertProjectAccess(userId, node.flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);

    const candidates = await this.storyboardAgent.generateNextCandidates(userId, {
      projectIntent: flowProject.scriptText || '',
      selectedNodeTitle: node.branchName || '',
      selectedNodeScript: node.scriptSegment || '',
      nextIntent: dto.intent,
      count: dto.count || 3,
    });

    meta.nextCandidatesByNode = meta.nextCandidatesByNode || {};
    meta.nextCandidatesByNode[node.id] = candidates;

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: { stylePreset: meta as any },
    });

    return { nodeId, candidates };
  }

  async selectNextNodeCandidate(userId: string, nodeId: string, dto: SelectNextNodeCandidateDto) {
    const node = await this.assertNodeAccess(userId, nodeId);
    const flowProject = await this.assertProjectAccess(userId, node.flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const previousNodeMeta = this.getNodeMeta(meta, node.id);
    const candidate = meta.nextCandidatesByNode?.[node.id]?.find((item) => item.id === dto.candidateId);
    if (!candidate) throw new NotFoundException('未找到候选下一节点');

    const promptBundle = await this.promptDirector.compile(userId, {
      projectIntent: flowProject.scriptText || '',
      nodeTitle: candidate.title,
      scriptSegment: candidate.scriptSegment,
      visualDescription: candidate.visualDescription,
      previousNodeTitle: node.branchName || '',
      previousNodeSummary: node.scriptSegment || '',
      previousNodeVisualPrompt:
        previousNodeMeta.imagePromptCn ||
        previousNodeMeta.displayPromptCn ||
        '',
      previousContinuityNotes: previousNodeMeta.continuityNotes || '',
      previousCharacterAnchor: previousNodeMeta.characterAnchor,
      previousContinuityLocked: previousNodeMeta.continuityLocked,
    });

    const nextOrder =
      (
        await this.prisma.flowNode.aggregate({
          where: { flowProjectId: flowProject.id },
          _max: { orderIndex: true },
        })
      )._max.orderIndex ?? 0;

    const created = await this.prisma.flowNode.create({
      data: {
        flowProjectId: flowProject.id,
        orderIndex: nextOrder + 1,
        branchName: candidate.title,
        scriptSegment: candidate.scriptSegment,
        prompt: promptBundle.videoPromptModel || promptBundle.imagePromptModel,
        positionX: node.positionX + 340,
        positionY: node.positionY,
        parentNodeId: node.id,
      },
    });

    meta.nodesMeta = meta.nodesMeta || {};
    meta.nodesMeta[created.id] = {
      displayPromptCn: promptBundle.displayPromptCn,
      imagePromptCn: promptBundle.imagePromptCn,
      imagePromptModel: promptBundle.imagePromptModel,
      videoPrompt: promptBundle.videoPromptModel,
      continuityNotes: promptBundle.continuityNotes,
      characterAnchor: promptBundle.characterAnchor,
      continuityLocked: this.getNodeMeta(meta, node.id).continuityLocked,
    };
    if (meta.nextCandidatesByNode?.[node.id]) {
      delete meta.nextCandidatesByNode[node.id];
    }

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: { stylePreset: meta as any },
    });

    return this.getGraph(userId, flowProject.id);
  }

  async generateNodeImage(userId: string, nodeId: string, _dto: GenerateNodeImageDto) {
    const node = await this.assertNodeAccess(userId, nodeId);
    const flowProject = await this.assertProjectAccess(userId, node.flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const nodeMeta = this.getNodeMeta(meta, node.id);

    if (!nodeMeta.imagePromptModel && node.scriptSegment) {
      const compiled = await this.promptDirector.compile(userId, {
        projectIntent: flowProject.scriptText || '',
        nodeTitle: node.branchName || '',
        scriptSegment: node.scriptSegment,
      });
      meta.nodesMeta = meta.nodesMeta || {};
      meta.nodesMeta[node.id] = {
        displayPromptCn: compiled.displayPromptCn,
        imagePromptCn: compiled.imagePromptCn,
        imagePromptModel: compiled.imagePromptModel,
        videoPrompt: compiled.videoPromptModel,
        continuityNotes: compiled.continuityNotes,
        characterAnchor: compiled.characterAnchor,
        continuityLocked: this.getNodeMeta(meta, node.id).continuityLocked,
      };
      await this.prisma.prismFlowProject.update({
        where: { id: flowProject.id },
        data: { stylePreset: meta as any },
      });
    }

    const refreshedMeta = this.getProjectMeta(
      (await this.prisma.prismFlowProject.findUniqueOrThrow({ where: { id: flowProject.id } })).stylePreset,
    );
    const prompt =
      refreshedMeta.nodesMeta?.[node.id]?.imagePromptModel ||
      refreshedMeta.nodesMeta?.[node.id]?.imagePromptCn ||
      node.prompt ||
      node.scriptSegment ||
      '生成一个清晰的电影分镜画面';

    const parentNode = node.parentNodeId
      ? await this.prisma.flowNode.findUnique({ where: { id: node.parentNodeId } })
      : null;

    const resolvedProjectId = flowProject.projectId || flowProject.video?.projectId;
    if (!resolvedProjectId) {
      throw new Error('创作工程缺少 projectId，无法生成节点图片');
    }

    return this.renderService.generateNodeImage({
      userId,
      projectId: resolvedProjectId,
      flowProjectId: flowProject.id,
      nodeId: node.id,
      prompt,
      parentLastFrameUrl: parentNode?.lastFrameUrl || null,
    });
  }

  async renderNodeVideo(userId: string, nodeId: string) {
    const node = await this.assertNodeAccess(userId, nodeId);
    const flowProject = await this.assertProjectAccess(userId, node.flowProjectId);
    const resolvedProjectId = flowProject.projectId || flowProject.video?.projectId;
    if (!resolvedProjectId) {
      throw new Error('创作工程缺少 projectId，无法提交视频渲染');
    }

    if (!node.lastFrameUrl && !node.firstFrameUrl) {
      throw new Error('当前节点还没有可用图片，请先生成节点图片');
    }
    if (!node.firstFrameUrl) {
      await this.prisma.flowNode.update({
        where: { id: node.id },
        data: { firstFrameUrl: node.lastFrameUrl },
      });
    }
    if (!node.lastFrameUrl && node.firstFrameUrl) {
      await this.prisma.flowNode.update({
        where: { id: node.id },
        data: { lastFrameUrl: node.firstFrameUrl },
      });
    }

    return this.segmentVideoRenderService.enqueueNodeRender({
      userId,
      projectId: resolvedProjectId,
      flowProjectId: flowProject.id,
      nodeId: node.id,
    });
  }

  async stitchProject(userId: string, flowProjectId: string, dto: StitchProjectDto = {}) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const resolvedProjectId = flowProject.projectId || flowProject.video?.projectId;
    if (!resolvedProjectId) {
      throw new Error('创作工程缺少 projectId，无法导出成片');
    }
    const composeOptions = await this.prepareComposeOptions(userId, resolvedProjectId, flowProject.id, dto);

    return this.segmentVideoRenderService.enqueueProjectStitch({
      userId,
      projectId: resolvedProjectId,
      flowProjectId,
      composeOptions,
    });
  }

  async getTask(userId: string, taskId: string) {
    const task = await this.prisma.taskRecord.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new NotFoundException('任务不存在');
    return task;
  }

  async retryTask(userId: string, taskId: string) {
    const task = await this.prisma.taskRecord.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new NotFoundException('任务不存在');

    if (task.type === 'creation_render') {
      const payload = (task.payload && typeof task.payload === 'object' && !Array.isArray(task.payload))
        ? (task.payload as Record<string, unknown>)
        : {};
      const nodeId = String(payload.nodeId || '').trim();
      const flowProjectId = String(payload.flowProjectId || '').trim();
      if (!nodeId || !flowProjectId) {
        throw new NotFoundException('原渲染任务缺少节点信息');
      }
      return this.renderNodeVideo(userId, nodeId);
    }

    if (task.type === 'creation_stitch') {
      const payload = (task.payload && typeof task.payload === 'object' && !Array.isArray(task.payload))
        ? (task.payload as Record<string, unknown>)
        : {};
      const flowProjectId = String(payload.flowProjectId || '').trim();
      if (!flowProjectId) {
        throw new NotFoundException('原导出任务缺少工程信息');
      }
      return this.stitchProject(userId, flowProjectId);
    }

    throw new NotFoundException('当前任务类型不支持重试');
  }

  async reextractCharacterAnchor(userId: string, nodeId: string) {
    const node = await this.assertNodeAccess(userId, nodeId);
    const flowProject = await this.assertProjectAccess(userId, node.flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const nodeMeta = this.getNodeMeta(meta, node.id);
    const parentNode = node.parentNodeId
      ? await this.prisma.flowNode.findUnique({ where: { id: node.parentNodeId } })
      : null;
    const parentNodeMeta = parentNode ? this.getNodeMeta(meta, parentNode.id) : null;

    const extracted = await this.promptDirector.reextractCharacterAnchor(userId, {
      nodeTitle: node.branchName || '',
      scriptSegment: node.scriptSegment || '',
      displayPromptCn: nodeMeta.displayPromptCn,
      imagePromptCn: nodeMeta.imagePromptCn,
      continuityNotes: nodeMeta.continuityNotes,
      previousCharacterAnchor: parentNodeMeta?.characterAnchor,
      continuityLocked: nodeMeta.continuityLocked,
    });

    meta.nodesMeta = meta.nodesMeta || {};
    meta.nodesMeta[node.id] = {
      ...nodeMeta,
      characterAnchor: extracted,
    };

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: { stylePreset: meta as any },
    });

    return this.getGraph(userId, flowProject.id);
  }

  private getProjectMeta(input: unknown): CreationProjectMeta {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { version: 'v2', mode: 'idea', backgroundVideoId: null, nodesMeta: {} };
    }
    const meta = input as CreationProjectMeta;
    return {
      version: 'v2',
      mode: meta.mode || 'idea',
      backgroundVideoId: meta.backgroundVideoId || null,
      scriptPackage: meta.scriptPackage || undefined,
      ideaInput: meta.ideaInput || {},
      previews: Array.isArray(meta.previews) ? meta.previews : [],
      selectedPreviewId: meta.selectedPreviewId,
      conversationState: meta.conversationState || this.createEmptyConversationState(),
      scriptPlan: meta.scriptPlan,
      scenePlan: meta.scenePlan || undefined,
      characterAssets: Array.isArray(meta.characterAssets) ? meta.characterAssets : [],
      sceneAssets: Array.isArray(meta.sceneAssets) ? meta.sceneAssets : [],
      storyboardSegments: Array.isArray(meta.storyboardSegments) ? meta.storyboardSegments : [],
      voiceCasting: Array.isArray(meta.voiceCasting) ? meta.voiceCasting : [],
      renderTasks: Array.isArray(meta.renderTasks) ? meta.renderTasks : [],
      finalVideo: meta.finalVideo || null,
      nextCandidatesByNode: meta.nextCandidatesByNode || {},
      nodesMeta: Object.fromEntries(
        Object.entries(meta.nodesMeta || {}).map(([nodeId, nodeMeta]) => [nodeId, this.normalizeNodeMeta(nodeMeta)]),
      ),
    };
  }

  private getNodeMeta(meta: CreationProjectMeta, nodeId: string): Required<CreationNodeMeta> {
    return this.normalizeNodeMeta(meta.nodesMeta?.[nodeId]);
  }

  private createEmptyConversationState(): CreationConversationState {
    return {
      messages: [],
      summary: {
        storyIntent: '',
        visualStyle: '',
        splitPreference: '',
      },
      scriptDraft: '',
      chaptersHint: 4,
      lastUpdatedAt: null,
    };
  }

  private normalizeNodeMeta(input: unknown): Required<CreationNodeMeta> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {
        displayPromptCn: '',
        imagePromptCn: '',
        imagePromptModel: '',
        videoPrompt: '',
        continuityNotes: '',
        characterAnchor: this.normalizeCharacterAnchor(undefined),
        continuityLocked: false,
        mergedFromNodeIds: [],
        sourceSegmentId: '',
      };
    }

    const nodeMeta = input as CreationNodeMeta;
    return {
      displayPromptCn: String(nodeMeta.displayPromptCn || '').trim(),
      imagePromptCn: String(nodeMeta.imagePromptCn || '').trim(),
      imagePromptModel: String(nodeMeta.imagePromptModel || '').trim(),
      videoPrompt: String(nodeMeta.videoPrompt || '').trim(),
      continuityNotes: String(nodeMeta.continuityNotes || '').trim(),
      characterAnchor: this.normalizeCharacterAnchor(nodeMeta.characterAnchor),
      continuityLocked: Boolean(nodeMeta.continuityLocked),
      mergedFromNodeIds: Array.isArray(nodeMeta.mergedFromNodeIds)
        ? nodeMeta.mergedFromNodeIds.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      sourceSegmentId: String(nodeMeta.sourceSegmentId || '').trim(),
    };
  }

  private async findNodeBySourceSegmentId(flowProjectId: string, segmentId: string) {
    const flowProject = await this.prisma.prismFlowProject.findUnique({
      where: { id: flowProjectId },
      select: { stylePreset: true },
    });
    if (!flowProject) return null;
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const nodeId = Object.entries(meta.nodesMeta || {}).find(([, nodeMeta]) => nodeMeta.sourceSegmentId === segmentId)?.[0];
    if (!nodeId) return null;
    return this.prisma.flowNode.findUnique({ where: { id: nodeId } });
  }

  private normalizeCharacterAnchor(input: unknown): CharacterAnchor {
    if (typeof input === 'string') {
      const value = input.trim();
      return {
        identity: value || '当前镜头无固定人物主体',
        hair: '',
        outfit: '',
        face: '',
        prop: '',
      };
    }

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {
        identity: '当前镜头无固定人物主体',
        hair: '',
        outfit: '',
        face: '',
        prop: '',
      };
    }

    const value = input as Partial<CharacterAnchor>;
    return {
      identity: String(value.identity || '').trim() || '当前镜头无固定人物主体',
      hair: String(value.hair || '').trim(),
      outfit: String(value.outfit || '').trim(),
      face: String(value.face || '').trim(),
      prop: String(value.prop || '').trim(),
    };
  }

  private buildCharacterAnchorFromSegment(segment: StoryboardSegment, assets: CharacterAsset[]): CharacterAnchor {
    const primary = segment.characterRefs
      .map((name) => assets.find((item) => item.name === name))
      .find(Boolean);

    if (!primary) {
      return this.normalizeCharacterAnchor(undefined);
    }

    return {
      identity: primary.identity || primary.name,
      hair: primary.appearance,
      outfit: primary.description,
      face: primary.appearance,
      prop: '',
    };
  }

  private async prepareComposeOptions(
    userId: string,
    projectId: string,
    flowProjectId: string,
    dto: StitchProjectDto,
  ) {
    const includeVoiceover = Boolean(dto.includeVoiceover);
    const includeBgm = Boolean(dto.includeBgm);
    if (!includeVoiceover && !includeBgm) {
      return {};
    }

    const flowProject = await this.prisma.prismFlowProject.findUniqueOrThrow({
      where: { id: flowProjectId },
      include: {
        nodes: {
          where: { isMerged: false },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const composeOptions: Record<string, unknown> = {
      includeVoiceover,
      includeBgm,
    };

    if (includeVoiceover) {
      const voiceoverText = String(dto.voiceoverText || this.buildVoiceoverText(flowProject.scriptText || '', meta, flowProject.nodes)).trim();
      if (voiceoverText) {
        composeOptions.voiceoverText = voiceoverText;
        composeOptions.narrationUrl = await this.finalVideoComposeService.generateNarrationAudio({
          userId,
          projectId,
          text: voiceoverText,
        });
      }
    }

    if (includeBgm) {
      const durationSec = Math.max(3, flowProject.nodes.length * 3);
      composeOptions.bgmUrl = await this.finalVideoComposeService.generateAmbientBgm({
        userId,
        projectId,
        durationSec,
      });
    }

    return composeOptions;
  }

  private buildVoiceoverText(
    scriptText: string,
    meta: CreationProjectMeta,
    nodes: Array<{ scriptSegment: string | null }>,
  ) {
    const chapterSummary = (meta.scriptPlan?.chapters || [])
      .slice(0, 2)
      .map((item) => item.summary)
      .filter(Boolean)
      .join('。');
    const nodeSummary = nodes
      .map((item) => String(item.scriptSegment || '').trim())
      .filter(Boolean)
      .slice(0, 3)
      .join('。');

    return (
      chapterSummary ||
      nodeSummary ||
      String(meta.scriptPackage?.overallSummary || '').trim() ||
      String(scriptText || '').trim().slice(0, 220)
    );
  }

  private async createFlowProject(
    projectId: string,
    projectName: string,
    options: { name?: string; backgroundVideoId?: string | null } = {},
  ) {
    const count = await this.prisma.prismFlowProject.count({ where: { projectId } });
    return this.prisma.prismFlowProject.create({
      data: {
        projectId,
        videoId: options.backgroundVideoId || null,
        name: options.name?.trim() || `${projectName} · 创作工程 ${count + 1}`,
        stylePreset: {
          version: 'v2',
          mode: 'idea',
          backgroundVideoId: options.backgroundVideoId || null,
          conversationState: this.createEmptyConversationState(),
          nodesMeta: {},
        } as any,
        status: 'PENDING',
      },
    });
  }

  private toSessionSummary(
    session: {
      id: string;
      name: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      videoId: string | null;
      stylePreset: unknown;
      scriptText: string | null;
      nodes?: Array<{ id: string }>;
    },
  ): CreationSessionSummaryDto {
    const meta = this.getProjectMeta(session.stylePreset);
    const summary =
      String(meta.conversationState?.summary.storyIntent || '').trim() ||
      String(meta.scriptPackage?.overallSummary || '').trim() ||
      String(session.scriptText || '').trim().slice(0, 80) ||
      '尚未开始创作';
    return {
      id: session.id,
      name: session.name,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      videoId: session.videoId || null,
      hasNodes: Boolean(session.nodes?.length),
      lastSummary: summary,
    };
  }

  private async assertProjectOwnership(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) throw new ForbiddenException('你无权访问这个工程');
    return project;
  }

  private async assertVideoAccess(userId: string, videoId: string) {
    const video = await this.prisma.videoSource.findFirst({
      where: { id: videoId, project: { userId } },
      include: { project: true },
    });
    if (!video) throw new ForbiddenException('你无权访问这个视频');
    return video;
  }

  private async assertProjectAccess(userId: string, flowProjectId: string) {
    const flowProject = await this.prisma.prismFlowProject.findFirst({
      where: {
        id: flowProjectId,
        OR: [{ project: { userId } }, { video: { project: { userId } } }],
      },
      include: { video: true, project: true },
    });
    if (!flowProject) throw new ForbiddenException('你无权访问这个创作工程');
    return flowProject;
  }

  private async assertNodeAccess(userId: string, nodeId: string) {
    const node = await this.prisma.flowNode.findFirst({
      where: {
        id: nodeId,
        flowProject: {
          OR: [{ project: { userId } }, { video: { project: { userId } } }],
        },
      },
    });
    if (!node) throw new ForbiddenException('你无权访问这个节点');
    return node;
  }
}
