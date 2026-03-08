import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AITaskType } from '../../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../../infrastructure/ai-router/ai-router.service';
import {
  GenerateNextNodeDto,
  GenerateNodeCandidatesDto,
  RefineCopyDto,
  TaskStatus,
} from '../../dto';
import { CreationFlowService } from './creation-flow.service';
import { CurrentNodeContext, PromptBundle } from '../foundation/creation-ai.types';
import { CreationAgentModeService } from '../foundation/creation-agent-mode.service';
import { CreationKnowledgeAssetService } from './creation-knowledge-asset.service';
import { PromptBundleFactoryService } from '../foundation/prompt-bundle-factory.service';
import { PromptEngineService } from '../foundation/prompt-engine.service';
import { PromptParserService } from '../foundation/prompt-parser.service';
import { ShotDesignerAgentService } from '../agents/shot-designer-agent.service';

@Injectable()
export class CreationNodeAuthoringService {
  private readonly logger = new Logger(CreationNodeAuthoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly flowService: CreationFlowService,
    private readonly agentMode: CreationAgentModeService,
    private readonly bundleFactory: PromptBundleFactoryService,
    private readonly promptEngine: PromptEngineService,
    private readonly parser: PromptParserService,
    private readonly knowledgeAssetService: CreationKnowledgeAssetService,
    private readonly shotDesignerAgent: ShotDesignerAgentService,
  ) {}

  async generateNextNode(userId: string, videoId: string, dto: GenerateNextNodeDto) {
    const project = await this.flowService.getOrCreateProject(userId, videoId);

    const idea = dto.idea?.trim();
    if (!idea) {
      throw new BadRequestException('idea is required');
    }

    const currentNode = await this.resolveCurrentNode(project.id, dto.currentNodeId);

    const maxOrderIndex = await this.prisma.flowNode.aggregate({
      where: { flowProjectId: project.id },
      _max: { orderIndex: true },
    });
    const newOrderIndex = (maxOrderIndex._max.orderIndex ?? -1) + 1;

    const generated =
      dto.scriptSegment?.trim() || dto.videoPrompt?.trim()
        ? this.normalizePromptBundle(
            {
              scriptSegment: dto.scriptSegment || '',
              videoPrompt: dto.videoPrompt || '',
              sceneFramePrompt: dto.sceneFramePrompt || '',
              firstFramePrompt: dto.firstFramePrompt || '',
              lastFramePrompt: dto.lastFramePrompt || '',
            },
            idea,
            this.toCurrentNodeContext(currentNode),
          )
        : await this.generateNextNodeWithLLM(
            userId,
            idea,
            this.toCurrentNodeContext(currentNode),
          );

    const baseX = Number(currentNode?.positionX ?? 80);
    const baseY = Number(currentNode?.positionY ?? 120);
    const nextX = baseX + 260;
    const nextY = baseY + (currentNode ? 0 : (newOrderIndex % 3) * 110);

    const node = await this.prisma.flowNode.create({
      data: {
        flowProjectId: project.id,
        orderIndex: newOrderIndex,
        prompt: generated.videoPrompt,
        scriptSegment: generated.scriptSegment,
        parentNodeId: currentNode?.id ?? null,
        branchName: dto.branchName?.trim() || null,
        positionX: nextX,
        positionY: nextY,
        renderStatus: TaskStatus.PENDING,
      },
      include: {
        parentNode: true,
      },
    });

    await this.prisma.prismFlowProject.update({
      where: { id: project.id },
      data: { status: TaskStatus.PROCESSING },
    });

    return {
      userId,
      videoId,
      projectId: project.id,
      mode: 'simple',
      sourceNodeId: currentNode?.id ?? null,
      node: this.flowService.toNodeDto(node),
      promptBundle: generated,
      knowledgeAsset: await this.knowledgeAssetService.buildFromBundle(
        generated,
        node.id,
        userId,
      ),
    };
  }

  async generateNodeCandidates(userId: string, videoId: string, dto: GenerateNodeCandidatesDto) {
    const project = await this.flowService.getOrCreateProject(userId, videoId);
    const idea = dto.idea?.trim();
    if (!idea) {
      throw new BadRequestException('idea is required');
    }

    const currentNode = await this.prisma.flowNode.findFirst({
      where: {
        id: dto.currentNodeId,
        flowProjectId: project.id,
      },
    });
    if (!currentNode) {
      throw new NotFoundException('Current node not found in this project');
    }

    const count = Math.max(1, Math.min(5, Number(dto.count || 3)));
    const sourceContext = this.toCurrentNodeContext(currentNode);
    const candidates = await this.generateNodeCandidatesWithLLM(
      userId,
      idea,
      sourceContext!,
      count,
    );

    return {
      userId,
      videoId,
      projectId: project.id,
      sourceNodeId: currentNode.id,
      count,
      candidates: await Promise.all(
        candidates.map(async (candidate, index) => ({
          index,
          ...candidate,
          knowledgeAsset: await this.knowledgeAssetService.buildFromBundle(
            candidate,
            `candidate-${index + 1}`,
            userId,
          ),
        })),
      ),
    };
  }

  async refineNodeCopy(userId: string, nodeId: string, dto: RefineCopyDto) {
    const requirement = dto.requirement?.trim();
    if (!requirement) {
      throw new BadRequestException('requirement is required');
    }

    const node = await this.prisma.flowNode.findUnique({
      where: { id: nodeId },
      include: {
        flowProject: {
          include: {
            video: {
              include: {
                project: true,
              },
            },
          },
        },
      },
    });

    if (!node) {
      throw new NotFoundException('Node not found');
    }
    this.flowService.assertNodeAccess(node, userId);

    const currentSegment = node.scriptSegment || '';
    const currentPrompt = node.prompt || '';
    const currentContext = this.toCurrentNodeContext(node);
    const currentBundle = this.normalizePromptBundle(
      {
        scriptSegment: currentSegment,
        videoPrompt: currentPrompt,
      },
      currentSegment || currentPrompt || requirement,
      currentContext,
    );

    let parsed: PromptBundle;
    if (this.agentMode.shouldUseAgents()) {
      try {
        parsed = await this.shotDesignerAgent.refineNodeCopy(
          userId,
          requirement,
          currentBundle,
          currentContext,
        );
      } catch (error: any) {
        if (!this.agentMode.shouldFallbackAfterAgentError()) {
          throw error;
        }
        this.logger.warn(
          `Refine copy agent fallback for node ${nodeId}: ${error?.message || 'unknown error'}`,
        );
        parsed = this.normalizePromptBundle(
          {
            scriptSegment: currentSegment || `按要求调整：${requirement}`,
            videoPrompt: `${currentPrompt || currentSegment || requirement}。额外要求：${requirement}`,
          },
          requirement,
          currentContext,
        );
      }
    } else {
      try {
        const aiResponse = await this.aiRouter.execute(
          AITaskType.LLM_CHAT,
          {
            messages: [
              {
                role: 'system',
                content: this.promptEngine.buildMultishotSystemPrompt('refine'),
              },
              {
                role: 'user',
                content: JSON.stringify(
                  {
                    requirement,
                    current: {
                      scriptSegment: currentSegment,
                      prompt: currentPrompt,
                      bundle: currentBundle,
                    },
                  },
                  null,
                  2,
                ),
              },
            ],
            temperature: 0.5,
            response_format: { type: 'json_object' },
          },
          userId,
        );

        const content = this.parser.extractResponseContent(aiResponse);
        parsed = this.parseRefineCopyResult(content, currentSegment, currentPrompt);
      } catch (error: any) {
        this.logger.warn(
          `Refine copy fallback for node ${nodeId}: ${error?.message || 'unknown error'}`,
        );
        parsed = this.normalizePromptBundle(
          {
            scriptSegment: currentSegment || `按要求调整：${requirement}`,
            videoPrompt: `${currentPrompt || currentSegment || requirement}。额外要求：${requirement}`,
          },
          requirement,
          currentContext,
        );
      }
    }

    const updated = await this.prisma.flowNode.update({
      where: { id: nodeId },
      data: {
        scriptSegment: parsed.scriptSegment,
        prompt: parsed.videoPrompt,
      },
      include: {
        parentNode: true,
        childBranches: true,
      },
    });

    return {
      userId,
      nodeId,
      requirement,
      node: this.flowService.toNodeDto(updated),
      promptBundle: parsed,
      knowledgeAsset: await this.knowledgeAssetService.buildFromBundle(
        parsed,
        nodeId,
        userId,
      ),
    };
  }

  private async generateNextNodeWithLLM(
    userId: string,
    idea: string,
    current: CurrentNodeContext | null,
  ): Promise<PromptBundle> {
    const fallback = this.normalizePromptBundle({}, idea, current);

    if (this.agentMode.shouldUseAgents()) {
      try {
        return await this.shotDesignerAgent.designNextNode(userId, idea, current);
      } catch (error) {
        if (!this.agentMode.shouldFallbackAfterAgentError()) {
          throw error;
        }
      }
    }

    const userPayload = {
      task: '基于当前节点续写下一个视频节点',
      idea,
      currentNode: current
        ? {
            orderIndex: current.orderIndex,
            scriptSegment: current.scriptSegment,
            prompt: current.prompt,
          }
        : null,
    };

    try {
      const response = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          messages: [
            {
              role: 'system',
              content: this.promptEngine.buildMultishotSystemPrompt('next_node'),
            },
            {
              role: 'user',
              content: JSON.stringify(userPayload, null, 2),
            },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        },
        userId,
      );

      const parsed = this.parser.extractJsonPayload(response);
      const nextPayload =
        parsed && typeof parsed === 'object' && (parsed as any).node
          ? (parsed as any).node
          : parsed;
      return this.normalizePromptBundle(nextPayload || {}, idea, current);
    } catch {
      return fallback;
    }
  }

  private async generateNodeCandidatesWithLLM(
    userId: string,
    idea: string,
    current: CurrentNodeContext,
    count: number,
  ): Promise<PromptBundle[]> {
    if (this.agentMode.shouldUseAgents()) {
      try {
        const candidates = await this.shotDesignerAgent.generateNodeCandidates(
          userId,
          idea,
          current,
          count,
        );
        if (candidates.length) return candidates;
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
              this.promptEngine.buildMultishotSystemPrompt('candidates'),
              '你负责生成多个真正不同的下一镜头候选。',
              '禁止同义改写式伪差异，禁止模板化复述。',
              '每个候选都要有完整 promptBundle，并保持和当前镜头连续。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                task: '节点拓展候选',
                count,
                idea,
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
              },
              null,
              2,
            ),
          },
        ],
        temperature: 0.88,
        response_format: { type: 'json_object' },
      },
      userId,
    );

    const parsed = this.parser.extractJsonPayload(response);
    const candidateList = Array.isArray((parsed as any)?.candidates)
      ? (parsed as any).candidates
      : Array.isArray(parsed)
        ? parsed
        : [];

    const normalized = candidateList
      .slice(0, count)
      .map((item: any) => this.normalizePromptBundle(item || {}, idea, current))
      .filter((item: PromptBundle) => Boolean(item.scriptSegment || item.videoPrompt));

    if (!normalized.length) {
      throw new Error('Node candidate model returned no valid candidates');
    }

    return normalized;
  }

  private parseRefineCopyResult(
    content: string,
    fallbackSegment: string,
    fallbackPrompt: string,
  ): PromptBundle {
    const parsed = this.parser.parseJsonLoose(content);
    if (parsed && typeof parsed === 'object') {
      return this.normalizePromptBundle(
        {
          ...parsed,
          videoPrompt: (parsed as any)?.videoPrompt || (parsed as any)?.prompt || fallbackPrompt,
          scriptSegment: (parsed as any)?.scriptSegment || fallbackSegment,
        },
        fallbackSegment || fallbackPrompt,
        null,
      );
    }

    return this.normalizePromptBundle(
      {
        scriptSegment: fallbackSegment,
        videoPrompt: fallbackPrompt || fallbackSegment,
      },
      fallbackSegment || fallbackPrompt,
      null,
    );
  }

  private normalizePromptBundle(
    payload: any,
    idea: string,
    current: CurrentNodeContext | null,
  ): PromptBundle {
    return this.bundleFactory.create(payload, idea, current);
  }

  private async resolveCurrentNode(projectId: string, requestedNodeId?: string) {
    if (requestedNodeId) {
      const found = await this.prisma.flowNode.findFirst({
        where: {
          id: requestedNodeId,
          flowProjectId: projectId,
        },
      });
      if (found) return found;
    }

    return this.prisma.flowNode.findFirst({
      where: { flowProjectId: projectId },
      orderBy: { orderIndex: 'desc' },
    });
  }

  private toCurrentNodeContext(node: any | null): CurrentNodeContext | null {
    if (!node) return null;
    return {
      scriptSegment: node.scriptSegment || '',
      prompt: node.prompt || '',
      orderIndex: node.orderIndex,
    };
  }
}
