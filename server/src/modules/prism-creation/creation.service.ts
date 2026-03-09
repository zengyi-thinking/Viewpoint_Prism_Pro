import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IdeaPlannerAgent, IdeaPreviewOption } from './services/idea-planner.agent';
import { ScriptPlannerAgent, ScriptPlanResult } from './services/script-planner.agent';
import { StoryboardAgent, StoryboardCandidate } from './services/storyboard.agent';
import { PromptDirectorAgent } from './services/prompt-director.agent';
import { CreationRenderService } from './services/creation-render.service';
import {
  BootstrapCreationProjectDto,
  CreateChapterNodesDto,
  GenerateIdeaPreviewsDto,
  GenerateNextNodeCandidatesDto,
  GenerateNodeImageDto,
  GenerateScriptPlanDto,
  SelectIdeaPreviewDto,
  SelectNextNodeCandidateDto,
  UpdateCreationNodeDto,
} from './dto';

interface CreationNodeMeta {
  displayPromptCn?: string;
  imagePromptCn?: string;
  imagePromptModel?: string;
  videoPrompt?: string;
  continuityNotes?: string;
}

interface CreationProjectMeta {
  version: 'v2';
  mode?: 'idea' | 'script';
  backgroundVideoId?: string | null;
  ideaInput?: Record<string, unknown>;
  previews?: IdeaPreviewOption[];
  selectedPreviewId?: string;
  scriptPlan?: ScriptPlanResult;
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
    private readonly renderService: CreationRenderService,
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

    let flowProject = await this.prisma.prismFlowProject.findFirst({
      where: { projectId },
    });

    if (!flowProject) {
      flowProject = await this.prisma.prismFlowProject.create({
        data: {
          projectId,
          videoId: backgroundVideoId,
          name: dto.name?.trim() || `${project.name} · 创作工程`,
          stylePreset: {
            version: 'v2',
            mode: 'idea',
            backgroundVideoId,
            nodesMeta: {},
          },
          status: 'PENDING',
        },
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
          previews: meta.previews || [],
          selectedPreviewId: meta.selectedPreviewId || null,
          scriptPlan: meta.scriptPlan || null,
        },
      },
      nodes: nodes.map((node) => ({
        id: node.id,
        title: node.branchName || `节点 ${node.orderIndex + 1}`,
        scriptSegment: node.scriptSegment || '',
        modelPrompt: node.prompt || '',
        displayPromptCn: meta.nodesMeta?.[node.id]?.displayPromptCn || '',
        imagePromptCn: meta.nodesMeta?.[node.id]?.imagePromptCn || '',
        imagePromptModel: meta.nodesMeta?.[node.id]?.imagePromptModel || '',
        videoPrompt: meta.nodesMeta?.[node.id]?.videoPrompt || '',
        continuityNotes: meta.nodesMeta?.[node.id]?.continuityNotes || '',
        orderIndex: node.orderIndex,
        positionX: node.positionX,
        positionY: node.positionY,
        parentNodeId: node.parentNodeId,
        firstFrameUrl: node.firstFrameUrl,
        lastFrameUrl: node.lastFrameUrl,
        renderedVideoUrl: node.renderedVideoUrl,
        renderStatus: node.renderStatus,
      })),
    };
  }

  async generateIdeaPreviewsByProject(userId: string, projectId: string, dto: GenerateIdeaPreviewsDto) {
    const bootstrapped = await this.bootstrapByProject(userId, projectId, {
      backgroundVideoId: dto.backgroundVideoId,
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
    });
    const flowProject = await this.assertProjectAccess(userId, bootstrapped.project.id);
    const meta = this.getProjectMeta(flowProject.stylePreset);

    const plan = await this.scriptPlanner.generate(userId, dto.scriptText, dto.chaptersHint || 4);
    meta.mode = 'script';
    meta.backgroundVideoId = dto.backgroundVideoId || meta.backgroundVideoId || flowProject.videoId || null;
    meta.scriptPlan = plan;

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

  async createChapterNodes(userId: string, flowProjectId: string, dto: CreateChapterNodesDto) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    const chapter = meta.scriptPlan?.chapters?.find((item) => item.index === dto.chapterIndex);
    if (!chapter) throw new NotFoundException('未找到对应章节');

    const nodes = await this.storyboardAgent.createChapterNodes(userId, chapter, {
      projectIntent: flowProject.scriptText || '',
    });

    const existingCount = await this.prisma.flowNode.count({ where: { flowProjectId } });
    let prevNodeId: string | null = null;

    meta.nodesMeta = meta.nodesMeta || {};

    for (let i = 0; i < nodes.length; i += 1) {
      const candidate = nodes[i];
      const promptBundle = await this.promptDirector.compile(userId, {
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
      };

      prevNodeId = created.id;
    }

    await this.prisma.prismFlowProject.update({
      where: { id: flowProjectId },
      data: { stylePreset: meta as any, status: 'PROCESSING' },
    });

    return this.getGraph(userId, flowProjectId);
  }

  async updateNode(userId: string, nodeId: string, dto: UpdateCreationNodeDto) {
    const node = await this.assertNodeAccess(userId, nodeId);
    const flowProject = await this.assertProjectAccess(userId, node.flowProjectId);
    const meta = this.getProjectMeta(flowProject.stylePreset);
    meta.nodesMeta = meta.nodesMeta || {};
    const currentNodeMeta = meta.nodesMeta[node.id] || {};

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
    };

    await this.prisma.prismFlowProject.update({
      where: { id: flowProject.id },
      data: { stylePreset: meta as any },
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
    const candidate = meta.nextCandidatesByNode?.[node.id]?.find((item) => item.id === dto.candidateId);
    if (!candidate) throw new NotFoundException('未找到候选下一节点');

    const promptBundle = await this.promptDirector.compile(userId, {
      projectIntent: flowProject.scriptText || '',
      nodeTitle: candidate.title,
      scriptSegment: candidate.scriptSegment,
      visualDescription: candidate.visualDescription,
      previousNodeSummary: node.scriptSegment || '',
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
    const nodeMeta = meta.nodesMeta?.[node.id];

    if (!nodeMeta?.imagePromptModel && node.scriptSegment) {
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

    return this.renderService.enqueueNodeRender({
      userId,
      projectId: resolvedProjectId,
      flowProjectId: flowProject.id,
      nodeId: node.id,
    });
  }

  async stitchProject(userId: string, flowProjectId: string) {
    const flowProject = await this.assertProjectAccess(userId, flowProjectId);
    const resolvedProjectId = flowProject.projectId || flowProject.video?.projectId;
    if (!resolvedProjectId) {
      throw new Error('创作工程缺少 projectId，无法导出成片');
    }
    return this.renderService.enqueueProjectStitch({
      userId,
      projectId: resolvedProjectId,
      flowProjectId,
    });
  }

  async getTask(userId: string, taskId: string) {
    const task = await this.prisma.taskRecord.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new NotFoundException('任务不存在');
    return task;
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
      ideaInput: meta.ideaInput || {},
      previews: Array.isArray(meta.previews) ? meta.previews : [],
      selectedPreviewId: meta.selectedPreviewId,
      scriptPlan: meta.scriptPlan,
      nextCandidatesByNode: meta.nextCandidatesByNode || {},
      nodesMeta: meta.nodesMeta || {},
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
