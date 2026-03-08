import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateBranchDto,
  CreateFlowNodeDto,
  TaskStatus,
  UpdateFlowNodeDto,
} from '../dto';
import { PromptBundleFactoryService } from './prompt-bundle-factory.service';

@Injectable()
export class CreationFlowService {
  private readonly logger = new Logger(CreationFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleFactory: PromptBundleFactoryService,
  ) {}

  async getOrCreateProject(userId: string, videoId: string) {
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      include: { project: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this video');
    }

    let project = await this.prisma.prismFlowProject.findFirst({
      where: { videoId },
    });

    if (!project) {
      project = await this.prisma.prismFlowProject.create({
        data: {
          videoId,
          name: `PrismFlow - ${video.title}`,
          status: TaskStatus.PENDING,
        },
      });
      this.logger.log(`Created new PrismFlow project ${project.id} for video ${videoId}`);
    }

    return project;
  }

  async getNodes(userId: string, videoId: string) {
    const project = await this.getOrCreateProject(userId, videoId);

    const [nodes, renderTasks] = await Promise.all([
      this.prisma.flowNode.findMany({
        where: { flowProjectId: project.id },
        orderBy: { orderIndex: 'asc' },
      }),
      this.prisma.taskRecord.findMany({
        where: {
          userId,
          type: 'PRISMFLOW_NODE_RENDER',
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    const latestTaskByNodeId = new Map<string, any>();
    for (const task of renderTasks) {
      const nodeId = (task.payload as any)?.nodeId;
      if (!nodeId || latestTaskByNodeId.has(nodeId)) continue;
      latestTaskByNodeId.set(nodeId, task);
    }
    const firstMainNodeId =
      nodes
        .filter((n) => !n.parentNodeId && !n.branchName)
        .sort((a, b) => a.orderIndex - b.orderIndex)[0]?.id ?? null;

    return {
      userId,
      videoId,
      projectId: project.id,
      projectName: project.name,
      items: nodes.map((node) => ({
        ...this.toNodeDto(node, latestTaskByNodeId.get(node.id)),
        isFirstScene: firstMainNodeId === node.id,
      })),
    };
  }

  async createNode(userId: string, videoId: string, dto: CreateFlowNodeDto) {
    const project = await this.getOrCreateProject(userId, videoId);

    if (dto.parentNodeId) {
      const parentNode = await this.prisma.flowNode.findFirst({
        where: {
          id: dto.parentNodeId,
          flowProjectId: project.id,
        },
      });

      if (!parentNode) {
        throw new NotFoundException('Parent node not found in this project');
      }
    }

    const node = await this.prisma.flowNode.create({
      data: {
        flowProjectId: project.id,
        orderIndex: dto.orderIndex,
        prompt: dto.prompt,
        scriptSegment: dto.scriptSegment,
        parentNodeId: dto.parentNodeId,
        positionX: dto.positionX || 0,
        positionY: dto.positionY || 0,
        renderStatus: TaskStatus.PENDING,
      },
    });

    await this.prisma.prismFlowProject.update({
      where: { id: project.id },
      data: { status: TaskStatus.PROCESSING },
    });

    this.logger.log(`Created node ${node.id} in project ${project.id}`);
    return {
      userId,
      videoId,
      projectId: project.id,
      node: this.toNodeDto(node),
    };
  }

  async updateNode(userId: string, videoId: string, nodeId: string, dto: UpdateFlowNodeDto) {
    const project = await this.getOrCreateProject(userId, videoId);

    const existingNode = await this.prisma.flowNode.findFirst({
      where: {
        id: nodeId,
        flowProjectId: project.id,
      },
    });

    if (!existingNode) {
      throw new NotFoundException('Node not found in this project');
    }

    const updated = await this.prisma.flowNode.update({
      where: { id: nodeId },
      data: {
        prompt: dto.prompt ?? existingNode.prompt,
        scriptSegment: dto.scriptSegment ?? existingNode.scriptSegment,
        positionX: dto.positionX ?? existingNode.positionX,
        positionY: dto.positionY ?? existingNode.positionY,
        firstFrameUrl: dto.firstFrameUrl ?? existingNode.firstFrameUrl,
        lastFrameUrl: dto.lastFrameUrl ?? existingNode.lastFrameUrl,
        firstFrameLocked: dto.firstFrameLocked ?? existingNode.firstFrameLocked,
        lastFrameLocked: dto.lastFrameLocked ?? existingNode.lastFrameLocked,
        renderedVideoUrl: dto.renderedVideoUrl ?? existingNode.renderedVideoUrl,
        renderStatus: dto.renderStatus ?? existingNode.renderStatus,
        narrationUrl: dto.narrationUrl ?? existingNode.narrationUrl,
        bgmUrl: dto.bgmUrl ?? existingNode.bgmUrl,
      },
      include: {
        parentNode: true,
        childBranches: true,
      },
    });

    this.logger.log(`Updated node ${nodeId}`);
    return {
      userId,
      videoId,
      projectId: project.id,
      node: this.toNodeDto(updated),
    };
  }

  async deleteNode(userId: string, videoId: string, nodeId: string) {
    const project = await this.getOrCreateProject(userId, videoId);

    const existingNode = await this.prisma.flowNode.findFirst({
      where: {
        id: nodeId,
        flowProjectId: project.id,
      },
    });

    if (!existingNode) {
      throw new NotFoundException('Node not found in this project');
    }

    await this.prisma.flowNode.delete({
      where: { id: nodeId },
    });

    const remainingNodes = await this.prisma.flowNode.count({
      where: { flowProjectId: project.id },
    });

    if (remainingNodes === 0) {
      await this.prisma.prismFlowProject.update({
        where: { id: project.id },
        data: { status: TaskStatus.PENDING },
      });
    }

    this.logger.log(`Deleted node ${nodeId} from project ${project.id}`);
    return {
      success: true,
      userId,
      videoId,
      projectId: project.id,
    };
  }

  async createBranch(userId: string, videoId: string, dto: CreateBranchDto) {
    const project = await this.getOrCreateProject(userId, videoId);

    const sourceNode = await this.prisma.flowNode.findFirst({
      where: {
        id: dto.sourceNodeId,
        flowProjectId: project.id,
      },
    });

    if (!sourceNode) {
      throw new NotFoundException('Source node not found in this project');
    }

    const maxOrderIndex = await this.prisma.flowNode.aggregate({
      where: { flowProjectId: project.id },
      _max: { orderIndex: true },
    });

    const newOrderIndex = (maxOrderIndex._max.orderIndex || 0) + 1;

    const branchNode = await this.prisma.flowNode.create({
      data: {
        flowProjectId: project.id,
        parentNodeId: dto.sourceNodeId,
        branchName: dto.branchName,
        prompt: dto.promptOverride || sourceNode.prompt,
        scriptSegment: sourceNode.scriptSegment,
        orderIndex: newOrderIndex,
        positionX: sourceNode.positionX + 200,
        positionY: sourceNode.positionY + 100,
        renderStatus: TaskStatus.PENDING,
      },
      include: {
        parentNode: true,
      },
    });

    this.logger.log(`Created branch ${branchNode.id} from node ${dto.sourceNodeId}`);
    return {
      userId,
      videoId,
      projectId: project.id,
      branchId: branchNode.id,
      branchName: dto.branchName,
      sourceNodeId: dto.sourceNodeId,
      status: 'created',
      node: this.toNodeDto(branchNode),
    };
  }

  async mergeBranch(userId: string, videoId: string, branchNodeId: string) {
    const project = await this.getOrCreateProject(userId, videoId);

    const branchNode = await this.prisma.flowNode.findFirst({
      where: {
        id: branchNodeId,
        flowProjectId: project.id,
      },
    });

    if (!branchNode) {
      throw new NotFoundException('Branch node not found in this project');
    }

    if (!branchNode.branchName) {
      throw new ForbiddenException('This node is not a branch');
    }

    const merged = await this.prisma.flowNode.update({
      where: { id: branchNodeId },
      data: { isMerged: true },
      include: {
        parentNode: true,
        childBranches: true,
      },
    });

    this.logger.log(`Merged branch ${branchNodeId}`);
    return {
      userId,
      videoId,
      projectId: project.id,
      branchId: branchNodeId,
      status: 'merged',
      node: this.toNodeDto(merged),
    };
  }

  async getNodeWithProject(nodeId: string) {
    return this.prisma.flowNode.findUnique({
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
  }

  assertNodeAccess(node: any, userId: string) {
    const ownerId = node?.flowProject?.video?.project?.userId;
    if (!ownerId) {
      throw new NotFoundException(
        '节点关联的视频或工程不存在，请刷新节点列表后重试',
      );
    }
    if (ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this node');
    }
  }

  toNodeDto(node: any, renderTask?: any) {
    const taskPayload = (renderTask?.payload as any) || {};
    const taskResult = (renderTask?.result as any) || {};
    const bundle = this.bundleFactory.create(
      {
        scriptSegment: node.scriptSegment,
        videoPrompt: node.prompt,
      },
      String(node.scriptSegment || node.prompt || '当前镜头').trim(),
      node.parentNode
        ? {
            scriptSegment: node.parentNode.scriptSegment,
            prompt: node.parentNode.prompt,
            orderIndex: node.parentNode.orderIndex,
          }
        : null,
    );
    return {
      id: node.id,
      flowProjectId: node.flowProjectId,
      orderIndex: node.orderIndex,
      prompt: node.prompt,
      scriptSegment: node.scriptSegment,
      positionX: node.positionX,
      positionY: node.positionY,
      firstFrameUrl: node.firstFrameUrl,
      lastFrameUrl: node.lastFrameUrl,
      firstFrameLocked: node.firstFrameLocked,
      lastFrameLocked: node.lastFrameLocked,
      renderedVideoUrl: node.renderedVideoUrl,
      renderStatus: node.renderStatus,
      parentNodeId: node.parentNodeId,
      branchName: node.branchName,
      isMerged: node.isMerged,
      narrationUrl: node.narrationUrl,
      bgmUrl: node.bgmUrl,
      videoPrompt: bundle.videoPrompt || null,
      sceneFramePrompt: bundle.sceneFramePrompt || null,
      firstFramePrompt: bundle.firstFramePrompt || null,
      lastFramePrompt: bundle.lastFramePrompt || null,
      activeRenderTaskId:
        taskPayload?.nodeId === node.id &&
        (renderTask?.status === TaskStatus.PROCESSING || renderTask?.status === TaskStatus.PENDING)
          ? renderTask?.id
          : null,
      renderProgress:
        taskPayload?.nodeId === node.id ? (renderTask?.progress ?? 0) : 0,
      latestRenderTaskStatus:
        taskPayload?.nodeId === node.id ? renderTask?.status : null,
      latestRenderTaskVideoUrl:
        taskPayload?.nodeId === node.id ? (taskResult?.videoUrl ?? null) : null,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      parentNode: node.parentNode
        ? {
            id: node.parentNode.id,
            orderIndex: node.parentNode.orderIndex,
            branchName: node.parentNode.branchName,
          }
        : null,
      childBranches: node.childBranches
        ? node.childBranches.map((child: any) => ({
            id: child.id,
            orderIndex: child.orderIndex,
            branchName: child.branchName,
            isMerged: child.isMerged,
          }))
        : [],
    };
  }
}
