import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AITaskType } from '../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../infrastructure/ai-router/ai-router.service';
import { FrameGenService } from './services/frame-gen.service';
import { VideoRenderService } from './services/video-render.service';
import { StitchService } from './services/stitch.service';
import { ExportService } from './services/export.service';
import {
  CreateBranchDto,
  CreateFlowNodeDto,
  UpdateFlowNodeDto,
  RenderFlowDto,
  StitchFlowDto,
  StitchExportDto,
  ExportProjectDto,
  TaskStatus,
  RenderQuality,
  ScriptSplitDto,
  GenerateFrameDto,
  LockFrameDto,
  FrameType,
} from './dto';

@Injectable()
export class CreationService {
  private readonly logger = new Logger(CreationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly frameGenService: FrameGenService,
    private readonly videoRenderService: VideoRenderService,
    private readonly stitchService: StitchService,
    private readonly exportService: ExportService,
  ) {}

  // ============================================================
  // Project Management
  // ============================================================

  /**
   * Get or create a PrismFlow project for a video
   */
  async getOrCreateProject(userId: string, videoId: string) {
    // Verify video access
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

    // Try to find existing project
    let project = await this.prisma.prismFlowProject.findFirst({
      where: { videoId },
    });

    if (!project) {
      // Create new project
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

  // ============================================================
  // Script Split
  // ============================================================

  /**
   * Split script text into segments using LLM and create FlowNodes
   */
  async scriptSplit(userId: string, videoId: string, dto: ScriptSplitDto) {
    const project = await this.getOrCreateProject(userId, videoId);

    this.logger.log(`Starting script split for project ${project.id}`);

    const shouldPersist = dto.persist === true;

    // 允许两种输入：
    // 1) scriptText -> 走 LLM 拆分
    // 2) segments -> 直接持久化（用于“确认生成节点”）
    let segments: Array<{ segment: string; prompt: string; estimatedDuration?: number }> = [];
    if (dto.segments?.length) {
      segments = dto.segments.map((seg) => ({
        segment: seg.segment,
        prompt: seg.prompt || seg.segment,
        estimatedDuration: seg.estimatedDuration,
      }));
    } else if (dto.scriptText?.trim()) {
      // Call LLM to split the script
      segments = await this.splitScriptWithLLM(userId, dto.scriptText, dto.stylePreset);
    } else {
      throw new BadRequestException('scriptText 或 segments 至少需要提供一个');
    }

    // 仅预览拆分，不写入节点
    if (!shouldPersist) {
      return {
        userId,
        videoId,
        projectId: project.id,
        persisted: false,
        segments,
      };
    }

    // Get current max order index
    const maxOrderIndex = await this.prisma.flowNode.aggregate({
      where: { flowProjectId: project.id },
      _max: { orderIndex: true },
    });
    let currentOrderIndex = (maxOrderIndex._max.orderIndex ?? -1) + 1;

    // Create nodes for each segment
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

      createdNodes.push(this.toNodeDto(node));
      currentOrderIndex++;
    }

    // Update project status
    await this.prisma.prismFlowProject.update({
      where: { id: project.id },
      data: { status: TaskStatus.PROCESSING },
    });

    this.logger.log(`Created ${createdNodes.length} nodes from script split`);

    return {
      userId,
      videoId,
      projectId: project.id,
      persisted: true,
      segments: createdNodes,
    };
  }

  /**
   * Split script text using LLM
   */
  private async splitScriptWithLLM(
    userId: string,
    scriptText: string,
    stylePreset?: ScriptSplitDto['stylePreset'],
  ): Promise<Array<{ segment: string; prompt: string; estimatedDuration?: number }>> {
    const styleContext = stylePreset
      ? `\n风格预设: ${JSON.stringify(stylePreset)}`
      : '';

    const prompt = `请将以下文案按镜头逻辑拆分为多个片段。每个片段应该是一个独立的场景或动作。

文案内容：
${scriptText}
${styleContext}

输出格式（JSON数组）：
[
  { "segment": "片段1文案", "prompt": "可用于生成视频的描述", "estimatedDuration": 3 },
  { "segment": "片段2文案", "prompt": "可用于生成视频的描述", "estimatedDuration": 5 },
  ...
]

请只返回JSON数组，不要包含其他文字。`;

    try {
      const response = await this.aiRouter.execute(AITaskType.LLM_CHAT, {
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
      }, userId);

      // Parse the JSON response
      const content = response.choices?.[0]?.message?.content || response.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed;
      }

      // Fallback: try to parse the entire response
      return JSON.parse(content);
    } catch (error) {
      this.logger.error('Failed to split script with LLM:', error);
      // Return a single segment as fallback
      return [
        {
          segment: scriptText,
          prompt: '视频片段',
          estimatedDuration: 5,
        },
      ];
    }
  }

  // ============================================================
  // Node Management
  // ============================================================

  /**
   * Get all nodes for a video's PrismFlow project
   */
  async getNodes(userId: string, videoId: string) {
    const project = await this.getOrCreateProject(userId, videoId);

    const nodes = await this.prisma.flowNode.findMany({
      where: { flowProjectId: project.id },
      orderBy: { orderIndex: 'asc' },
    });

    return {
      userId,
      videoId,
      projectId: project.id,
      projectName: project.name,
      items: nodes.map((node) => this.toNodeDto(node)),
    };
  }

  /**
   * Create a new node in the PrismFlow project
   */
  async createNode(userId: string, videoId: string, dto: CreateFlowNodeDto) {
    const project = await this.getOrCreateProject(userId, videoId);

    // If parentNodeId is provided, verify it belongs to this project
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

    // Update project status
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

  /**
   * Update an existing node
   */
  async updateNode(userId: string, videoId: string, nodeId: string, dto: UpdateFlowNodeDto) {
    const project = await this.getOrCreateProject(userId, videoId);

    // Verify node belongs to this project
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

  /**
   * Delete a node
   */
  async deleteNode(userId: string, videoId: string, nodeId: string) {
    const project = await this.getOrCreateProject(userId, videoId);

    // Verify node belongs to this project
    const existingNode = await this.prisma.flowNode.findFirst({
      where: {
        id: nodeId,
        flowProjectId: project.id,
      },
    });

    if (!existingNode) {
      throw new NotFoundException('Node not found in this project');
    }

    // Delete the node (cascade will handle child branches)
    await this.prisma.flowNode.delete({
      where: { id: nodeId },
    });

    // Check if project has any nodes left
    const remainingNodes = await this.prisma.flowNode.count({
      where: { flowProjectId: project.id },
    });

    // Update project status if no nodes left
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

  // ============================================================
  // Branch Management
  // ============================================================

  /**
   * Create a branch from an existing node
   */
  async createBranch(userId: string, videoId: string, dto: CreateBranchDto) {
    const project = await this.getOrCreateProject(userId, videoId);

    // Verify source node exists and belongs to this project
    const sourceNode = await this.prisma.flowNode.findFirst({
      where: {
        id: dto.sourceNodeId,
        flowProjectId: project.id,
      },
    });

    if (!sourceNode) {
      throw new NotFoundException('Source node not found in this project');
    }

    // Get the next order index for the branch
    const maxOrderIndex = await this.prisma.flowNode.aggregate({
      where: { flowProjectId: project.id },
      _max: { orderIndex: true },
    });

    const newOrderIndex = (maxOrderIndex._max.orderIndex || 0) + 1;

    // Create the branch node
    const branchNode = await this.prisma.flowNode.create({
      data: {
        flowProjectId: project.id,
        parentNodeId: dto.sourceNodeId,
        branchName: dto.branchName,
        prompt: dto.promptOverride || sourceNode.prompt,
        scriptSegment: sourceNode.scriptSegment,
        orderIndex: newOrderIndex,
        positionX: sourceNode.positionX + 200, // Offset for visual distinction
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

  /**
   * Merge a branch back to main flow
   */
  async mergeBranch(userId: string, videoId: string, branchNodeId: string) {
    const project = await this.getOrCreateProject(userId, videoId);

    // Verify branch node exists and belongs to this project
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

    // Mark the branch as merged
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

  // ============================================================
  // Rendering & Stitching
  // ============================================================

  /**
   * Queue a render task for a node
   */
  async render(userId: string, videoId: string, dto: RenderFlowDto) {
    const project = await this.getOrCreateProject(userId, videoId);

    // Verify node belongs to this project
    const node = await this.prisma.flowNode.findFirst({
      where: {
        id: dto.nodeId,
        flowProjectId: project.id,
      },
    });

    if (!node) {
      throw new NotFoundException('Node not found in this project');
    }

    // Update node status to processing
    await this.prisma.flowNode.update({
      where: { id: dto.nodeId },
      data: { renderStatus: TaskStatus.PROCESSING },
    });

    // Create task record for tracking
    const taskRecord = await this.prisma.taskRecord.create({
      data: {
        userId,
        type: 'PRISMFLOW_RENDER',
        payload: {
          nodeId: dto.nodeId,
          flowProjectId: project.id,
          videoId,
          quality: dto.quality || RenderQuality.DRAFT,
          stylePresetId: dto.stylePresetId,
        } as any,
        status: TaskStatus.PENDING,
      },
    });

    // Update project status
    await this.prisma.prismFlowProject.update({
      where: { id: project.id },
      data: { status: TaskStatus.PROCESSING },
    });

    this.logger.log(`Created render task ${taskRecord.id} for node ${dto.nodeId}`);
    return {
      taskId: taskRecord.id,
      nodeId: dto.nodeId,
      userId,
      videoId,
      projectId: project.id,
      quality: dto.quality || RenderQuality.DRAFT,
      status: 'queued',
    };
  }

  /**
   * Queue a stitch task to combine rendered nodes
   */
  async stitch(userId: string, videoId: string, dto: StitchFlowDto) {
    const project = await this.getOrCreateProject(userId, videoId);

    // 使用 StitchService 执行串联
    const result = await this.stitchService.stitch(
      project.id,
      userId,
      videoId,
      {
        includeNarration: dto.includeNarration ?? true,
        includeBgm: dto.includeBgm ?? true,
        bgmVolume: dto.bgmVolume ?? 50,
      },
    );

    return {
      taskId: result.taskId,
      projectId: result.projectId,
      userId,
      videoId,
      nodeCount: result.nodeCount,
      includeNarration: dto.includeNarration ?? true,
      includeBgm: dto.includeBgm ?? true,
      status: result.status,
    };
  }

  /**
   * 导出项目
   */
  async exportProject(userId: string, videoId: string, dto?: ExportProjectDto) {
    const project = await this.getOrCreateProject(userId, videoId);

    const format = (dto?.format as 'mp4' | 'webm' | 'json' | 'zip') || 'mp4';

    // 使用 ExportService 执行导出
    const result = await this.exportService.exportProject(
      project.id,
      userId,
      videoId,
      format,
    );

    return {
      taskId: result.taskId,
      projectId: result.projectId,
      userId,
      videoId,
      format: result.format,
      status: result.status,
    };
  }

  /**
   * 获取串联任务状态
   */
  async getStitchTaskStatus(taskId: string) {
    return this.stitchService.getTaskStatus(taskId);
  }

  /**
   * 获取导出任务状态
   */
  async getExportTaskStatus(taskId: string) {
    return this.exportService.getTaskStatus(taskId);
  }

  // ============================================================
  // Frame Generation
  // ============================================================

  /**
   * Generate a frame (first or last) for a node
   */
  async generateFrame(userId: string, nodeId: string, dto: GenerateFrameDto) {
    // Verify node exists and include flowProject with video and project for access check
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

    // Verify access to project
    if (node.flowProject.video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this node');
    }

    const result = await this.frameGenService.generateFrame(
      userId,
      nodeId,
      dto.frameType,
      dto.prompt,
    );

    this.logger.log(`Generated ${dto.frameType} frame for node ${nodeId}`);

    return {
      userId,
      nodeId,
      frameType: dto.frameType,
      frameUrl: result.frameUrl,
      status: 'generated',
    };
  }

  /**
   * Lock or unlock a frame
   */
  async lockFrame(userId: string, nodeId: string, dto: LockFrameDto) {
    // Verify node exists and include flowProject with video and project for access check
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

    // Verify access to project
    if (node.flowProject.video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this node');
    }

    const result = await this.frameGenService.lockFrame(
      userId,
      nodeId,
      dto.frameType,
      dto.locked,
    );

    this.logger.log(`${dto.locked ? 'Locked' : 'Unlocked'} ${dto.frameType} frame for node ${nodeId}`);

    return {
      userId,
      nodeId,
      frameType: dto.frameType,
      locked: dto.locked,
      status: 'updated',
    };
  }

  // ============================================================
  // Node Rendering
  // ============================================================

  /**
   * Render a single node (generate video from frames)
   */
  async renderNode(userId: string, nodeId: string, quality?: RenderQuality) {
    // Verify node exists and include flowProject with video and project for access check
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

    // Verify access to project
    if (node.flowProject.video.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this node');
    }

    const result = await this.videoRenderService.enqueueRender(
      userId,
      nodeId,
      quality || RenderQuality.DRAFT,
    );

    this.logger.log(`Enqueued render for node ${nodeId}`);

    return {
      userId,
      nodeId,
      taskId: result.taskId,
      status: result.status,
    };
  }

  // ============================================================
  // DTO Converters
  // ============================================================

  private toNodeDto(node: any) {
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
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      // Include parent node info if available
      parentNode: node.parentNode
        ? {
            id: node.parentNode.id,
            orderIndex: node.parentNode.orderIndex,
            branchName: node.parentNode.branchName,
          }
        : null,
      // Include child branches if available
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
