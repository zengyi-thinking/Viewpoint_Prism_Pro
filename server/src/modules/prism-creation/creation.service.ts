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
  RefineCopyDto,
  GenerateNextNodeDto,
  GenerateNodeCandidatesDto,
} from './dto';

type PromptBundle = {
  scriptSegment: string;
  videoPrompt: string;
  sceneFramePrompt: string;
  firstFramePrompt: string;
  lastFramePrompt: string;
};

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
      segments = await this.splitScriptWithLLM(
        userId,
        dto.scriptText,
        dto.stylePreset,
        dto.adjustInstruction,
      );
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
    adjustInstruction?: string,
  ): Promise<Array<{ segment: string; prompt: string; estimatedDuration?: number }>> {
    const styleContext = stylePreset
      ? `\n风格预设: ${JSON.stringify(stylePreset)}`
      : '';
    const adjustContext = adjustInstruction?.trim()
      ? `\n额外调整要求：${adjustInstruction.trim()}`
      : '';

    const prompt = `请将以下文案按镜头逻辑拆分为多个片段。每个片段应该是一个独立的场景或动作。

文案内容：
${scriptText}
${styleContext}
${adjustContext}

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
   * 基于当前节点 + idea 自动生成下一个节点（Simple 模式）
   */
  async generateNextNode(userId: string, videoId: string, dto: GenerateNextNodeDto) {
    const project = await this.getOrCreateProject(userId, videoId);

    const idea = dto.idea?.trim();
    if (!idea) {
      throw new BadRequestException('idea is required');
    }

    let currentNode: any = null;
    if (dto.currentNodeId) {
      currentNode = await this.prisma.flowNode.findFirst({
        where: {
          id: dto.currentNodeId,
          flowProjectId: project.id,
        },
      });
      if (!currentNode) {
        this.logger.warn(
          `generateNextNode received invalid currentNodeId=${dto.currentNodeId} for project=${project.id}, fallback to latest node`,
        );
        currentNode = await this.prisma.flowNode.findFirst({
          where: { flowProjectId: project.id },
          orderBy: { orderIndex: 'desc' },
        });
      }
    } else {
      currentNode = await this.prisma.flowNode.findFirst({
        where: { flowProjectId: project.id },
        orderBy: { orderIndex: 'desc' },
      });
    }

    const maxOrderIndex = await this.prisma.flowNode.aggregate({
      where: { flowProjectId: project.id },
      _max: { orderIndex: true },
    });
    const newOrderIndex = (maxOrderIndex._max.orderIndex ?? -1) + 1;

    const generated = dto.scriptSegment?.trim() || dto.videoPrompt?.trim()
      ? this.normalizePromptBundle({
          scriptSegment: dto.scriptSegment || '',
          videoPrompt: dto.videoPrompt || '',
          sceneFramePrompt: dto.sceneFramePrompt || '',
          firstFramePrompt: dto.firstFramePrompt || '',
          lastFramePrompt: dto.lastFramePrompt || '',
        }, idea, currentNode
          ? {
              scriptSegment: currentNode.scriptSegment || '',
              prompt: currentNode.prompt || '',
              orderIndex: currentNode.orderIndex,
            }
          : null)
      : await this.generateNextNodeWithLLM(
          userId,
          idea,
          currentNode
            ? {
                scriptSegment: currentNode.scriptSegment || '',
                prompt: currentNode.prompt || '',
                orderIndex: currentNode.orderIndex,
              }
            : null,
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

    this.logger.log(
      `Generated next node ${node.id} from ${currentNode?.id ?? 'project-start'} in project ${project.id}`,
    );

    return {
      userId,
      videoId,
      projectId: project.id,
      mode: 'simple',
      sourceNodeId: currentNode?.id ?? null,
      node: this.toNodeDto(node),
      promptBundle: generated,
    };
  }

  /**
   * 生成节点拓展候选（不落库）
   */
  async generateNodeCandidates(userId: string, videoId: string, dto: GenerateNodeCandidatesDto) {
    const project = await this.getOrCreateProject(userId, videoId);
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
    const candidates = await this.generateNodeCandidatesWithLLM(
      userId,
      idea,
      {
        scriptSegment: currentNode.scriptSegment || '',
        prompt: currentNode.prompt || '',
        orderIndex: currentNode.orderIndex,
      },
      count,
    );

    return {
      userId,
      videoId,
      projectId: project.id,
      sourceNodeId: currentNode.id,
      count,
      candidates: candidates.map((candidate, index) => ({
        index,
        ...candidate,
      })),
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

  /**
   * 获取单节点渲染任务状态
   */
  async getRenderTaskStatus(userId: string, taskId: string) {
    const task = await this.prisma.taskRecord.findUnique({
      where: { id: taskId },
    });

    if (!task || task.type !== 'PRISMFLOW_NODE_RENDER') {
      throw new NotFoundException('Render task not found');
    }
    if (task.userId !== userId) {
      throw new ForbiddenException('You do not have access to this render task');
    }

    const payload = (task.payload as any) || {};
    const nodeId = payload.nodeId as string | undefined;
    const node = nodeId
      ? await this.prisma.flowNode.findUnique({
          where: { id: nodeId },
          select: {
            id: true,
            renderedVideoUrl: true,
            renderStatus: true,
          },
        })
      : null;

    const result = (task.result as any) || {};

    return {
      taskId: task.id,
      nodeId: nodeId ?? null,
      status: task.status,
      progress: task.progress ?? 0,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      videoUrl: result.videoUrl ?? node?.renderedVideoUrl ?? null,
      renderStatus: node?.renderStatus ?? null,
      error: task.error ?? null,
    };
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

    this.assertNodeAccess(node, userId);

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

    this.assertNodeAccess(node, userId);

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

    this.assertNodeAccess(node, userId);

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

  /**
   * 根据用户追加需求，让 AI 重新调整节点文案与提示词
   */
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
    this.assertNodeAccess(node, userId);

    const currentSegment = node.scriptSegment || '';
    const currentPrompt = node.prompt || '';

    let parsed: { scriptSegment: string; prompt: string };
    try {
      const aiResponse = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          messages: [
            {
              role: 'system',
              content:
                '你是视频分镜文案优化助手。请仅返回 JSON 对象，字段为 scriptSegment 和 prompt，不要输出 markdown 代码块。',
            },
            {
              role: 'user',
              content: JSON.stringify(
                {
                  requirement,
                  current: {
                    scriptSegment: currentSegment,
                    prompt: currentPrompt,
                  },
                },
                null,
                2,
              ),
            },
          ],
          temperature: 0.5,
        },
        userId,
      );

      const content =
        (aiResponse as any)?.choices?.[0]?.message?.content ??
        (aiResponse as any)?.content ??
        '';
      parsed = this.parseRefineCopyResult(content, currentSegment, currentPrompt);
    } catch (error: any) {
      this.logger.warn(`Refine copy fallback for node ${nodeId}: ${error?.message || 'unknown error'}`);
      const fallbackSegment =
        (currentSegment || `按要求调整：${requirement}`).trim();
      const fallbackPrompt =
        `${currentPrompt || fallbackSegment}。额外要求：${requirement}`.trim();
      parsed = {
        scriptSegment: fallbackSegment,
        prompt: fallbackPrompt,
      };
    }

    const updated = await this.prisma.flowNode.update({
      where: { id: nodeId },
      data: {
        scriptSegment: parsed.scriptSegment,
        prompt: parsed.prompt,
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
      node: this.toNodeDto(updated),
    };
  }

  // ============================================================
  // Precheck / Quality / Branch Compare
  // ============================================================

  async precheckNode(userId: string, nodeId: string) {
    const node = await this.getNodeWithProject(nodeId);
    if (!node) {
      throw new NotFoundException('Node not found');
    }
    this.assertNodeAccess(node, userId);

    const parentNode = node.parentNodeId
      ? await this.prisma.flowNode.findUnique({ where: { id: node.parentNodeId } })
      : null;

    const result = this.evaluateNodeReadiness(node, parentNode);
    return {
      userId,
      nodeId,
      ...result,
    };
  }

  async assessNodeQuality(userId: string, nodeId: string) {
    const node = await this.getNodeWithProject(nodeId);
    if (!node) {
      throw new NotFoundException('Node not found');
    }
    this.assertNodeAccess(node, userId);

    const parentNode = node.parentNodeId
      ? await this.prisma.flowNode.findUnique({ where: { id: node.parentNodeId } })
      : null;

    const readiness = this.evaluateNodeReadiness(node, parentNode);
    return {
      userId,
      nodeId,
      quality: readiness.quality,
      precheckLevel: readiness.level,
      issueCount: readiness.issues.length,
    };
  }

  async compareBranch(userId: string, branchNodeId: string) {
    const branchNode = await this.getNodeWithProject(branchNodeId);
    if (!branchNode) {
      throw new NotFoundException('Branch node not found');
    }
    this.assertNodeAccess(branchNode, userId);

    if (!branchNode.parentNodeId) {
      throw new BadRequestException('Current node is not a branch node');
    }

    const mainNode = await this.prisma.flowNode.findUnique({
      where: { id: branchNode.parentNodeId },
    });

    if (!mainNode) {
      throw new NotFoundException('Main node for this branch is missing');
    }

    const branchReadiness = this.evaluateNodeReadiness(branchNode, mainNode);
    const mainReadiness = this.evaluateNodeReadiness(mainNode, null);

    const branchOverall = branchReadiness.quality.overall;
    const mainOverall = mainReadiness.quality.overall;
    const delta = branchOverall - mainOverall;

    const recommendation =
      delta >= 6
        ? 'merge_branch'
        : delta <= -6
          ? 'keep_main'
          : 'manual_review';

    const reasons: string[] = [];
    if (delta >= 6) {
      reasons.push('分支综合质量显著高于主干，建议合并。');
    } else if (delta <= -6) {
      reasons.push('分支综合质量显著低于主干，建议保留主干并继续迭代分支。');
    } else {
      reasons.push('分支与主干质量接近，建议人工对比视觉结果后决定。');
    }

    if (branchReadiness.quality.continuity < mainReadiness.quality.continuity) {
      reasons.push('分支在连续性评分上低于主干，注意前后镜头衔接。');
    }

    if (branchReadiness.quality.renderStability < 60) {
      reasons.push('分支渲染稳定性偏低，建议先补全尾帧或优化提示词。');
    }

    return {
      userId,
      branchNodeId,
      mainNodeId: mainNode.id,
      recommendation,
      reasons,
      compare: {
        branch: {
          nodeId: branchNode.id,
          quality: branchReadiness.quality,
          issues: branchReadiness.issues,
        },
        main: {
          nodeId: mainNode.id,
          quality: mainReadiness.quality,
          issues: mainReadiness.issues,
        },
        delta: {
          overall: delta,
          promptCompleteness:
            branchReadiness.quality.promptCompleteness -
            mainReadiness.quality.promptCompleteness,
          continuity:
            branchReadiness.quality.continuity -
            mainReadiness.quality.continuity,
          renderStability:
            branchReadiness.quality.renderStability -
            mainReadiness.quality.renderStability,
        },
      },
    };
  }

  // ============================================================
  // DTO Converters
  // ============================================================

  private async getNodeWithProject(nodeId: string) {
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

  private evaluateNodeReadiness(node: any, parentNode: any | null) {
    const issues: Array<{
      code: string;
      severity: 'low' | 'medium' | 'high';
      message: string;
      suggestion: string;
    }> = [];

    const prompt = String(node?.prompt || '').trim();
    const segment = String(node?.scriptSegment || '').trim();
    const baseText = `${prompt} ${segment}`.trim();

    const hasSubject =
      /(人物|主角|角色|人群|产品|场景|城市|房间|街道|画面|subject|character|person|scene)/i.test(
        baseText,
      );
    const hasAction =
      /(走|跑|看|转|推进|拉远|跟拍|移动|旋转|进入|离开|升起|下降|转场|move|pan|zoom|track|follow)/i.test(
        baseText,
      );
    const hasCamera =
      /(特写|近景|中景|远景|俯拍|仰拍|跟拍|推镜|拉镜|摇镜|航拍|镜头|close-up|wide shot|pan|tilt|zoom|pov)/i.test(
        baseText,
      );

    if (!prompt) {
      issues.push({
        code: 'missing_prompt',
        severity: 'high',
        message: '缺少画面提示词，模型无法稳定生成镜头。',
        suggestion: '至少补充主体 + 动作 + 镜头语言。',
      });
    }
    if (!hasSubject) {
      issues.push({
        code: 'missing_subject',
        severity: 'medium',
        message: '提示词缺少明确主体，可能导致画面焦点漂移。',
        suggestion: '在提示词里显式写出主角/物体/场景主体。',
      });
    }
    if (!hasAction) {
      issues.push({
        code: 'missing_action',
        severity: 'medium',
        message: '提示词缺少动作描述，动态镜头会变弱。',
        suggestion: '增加动作动词，例如推进、转身、入场、跟随等。',
      });
    }
    if (!hasCamera) {
      issues.push({
        code: 'missing_camera_language',
        severity: 'medium',
        message: '提示词缺少镜头语言，构图和运动可能不稳定。',
        suggestion: '补充近景/远景/俯拍/推镜等镜头语义。',
      });
    }

    const hasLastFrame = Boolean(node?.lastFrameUrl);
    const hasFirstFrame = Boolean(node?.firstFrameUrl);
    const parentHasFrame = Boolean(parentNode?.lastFrameUrl || parentNode?.firstFrameUrl);

    if (!hasLastFrame) {
      issues.push({
        code: 'missing_last_frame_anchor',
        severity: 'high',
        message: '当前节点缺少尾帧锚点，渲染稳定性会显著下降。',
        suggestion: '先生成并锁定尾帧，再执行视频渲染。',
      });
    }

    if (parentNode && !parentHasFrame) {
      issues.push({
        code: 'continuity_parent_anchor_missing',
        severity: 'medium',
        message: '上一节点缺少帧锚点，当前节点连续性风险较高。',
        suggestion: '补全上一节点尾帧，或为当前节点补充首帧锚点。',
      });
    }

    if (parentNode && hasFirstFrame && parentNode?.lastFrameUrl) {
      const parentKeywords = this.extractKeywords(String(parentNode.prompt || parentNode.scriptSegment || ''));
      const currentKeywords = this.extractKeywords(baseText);
      const overlap = parentKeywords.filter((kw) => currentKeywords.includes(kw));
      if (overlap.length === 0) {
        issues.push({
          code: 'style_drift_risk',
          severity: 'low',
          message: '当前节点与上一节点关键词关联较弱，可能出现风格漂移。',
          suggestion: '在当前提示词复用上一节点的主体/风格关键词。',
        });
      }
    }

    const promptCompleteness = this.scorePromptCompleteness(prompt, hasSubject, hasAction, hasCamera);
    const continuity = this.scoreContinuity(parentNode, hasFirstFrame, hasLastFrame, issues);
    const renderStability = this.scoreRenderStability(hasLastFrame, prompt, issues.length);
    const subjectConsistency = this.scoreSubjectConsistency(parentNode, baseText);
    const overall = Math.round(
      (promptCompleteness + continuity + renderStability + subjectConsistency) / 4,
    );

    const hasHighRisk = issues.some((item) => item.severity === 'high');
    const hasMediumRisk = issues.some((item) => item.severity === 'medium');
    const level = hasHighRisk
      ? 'high_risk'
      : hasMediumRisk || overall < 70
        ? 'suggest_improve'
        : 'ready';

    return {
      level,
      issues,
      quality: {
        promptCompleteness,
        continuity,
        renderStability,
        subjectConsistency,
        overall,
      },
    };
  }

  private extractKeywords(text: string): string[] {
    const cleaned = String(text || '').toLowerCase();
    const words = cleaned
      .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2);
    return Array.from(new Set(words)).slice(0, 24);
  }

  private scorePromptCompleteness(
    prompt: string,
    hasSubject: boolean,
    hasAction: boolean,
    hasCamera: boolean,
  ) {
    let score = 30;
    if (prompt.length >= 12) score += 15;
    if (prompt.length >= 28) score += 10;
    if (hasSubject) score += 15;
    if (hasAction) score += 15;
    if (hasCamera) score += 15;
    return Math.max(0, Math.min(100, score));
  }

  private scoreContinuity(
    parentNode: any | null,
    hasFirstFrame: boolean,
    hasLastFrame: boolean,
    issues: Array<{ code: string }>,
  ) {
    if (!parentNode) {
      return hasLastFrame ? 88 : 68;
    }
    let score = 70;
    if (hasFirstFrame) score += 10;
    if (hasLastFrame) score += 10;
    if (issues.some((i) => i.code === 'continuity_parent_anchor_missing')) score -= 20;
    if (issues.some((i) => i.code === 'style_drift_risk')) score -= 8;
    return Math.max(0, Math.min(100, score));
  }

  private scoreRenderStability(hasLastFrame: boolean, prompt: string, issueCount: number) {
    let score = hasLastFrame ? 82 : 46;
    if (prompt.length >= 24) score += 10;
    if (prompt.length >= 40) score += 6;
    score -= Math.min(18, issueCount * 3);
    return Math.max(0, Math.min(100, score));
  }

  private scoreSubjectConsistency(parentNode: any | null, currentText: string) {
    if (!parentNode) return 80;
    const parentText = String(parentNode.prompt || parentNode.scriptSegment || '');
    const parentKeywords = this.extractKeywords(parentText);
    const currentKeywords = this.extractKeywords(currentText);
    if (!parentKeywords.length || !currentKeywords.length) return 55;
    const overlap = parentKeywords.filter((kw) => currentKeywords.includes(kw)).length;
    const ratio = overlap / Math.max(1, Math.min(parentKeywords.length, currentKeywords.length));
    return Math.max(35, Math.min(96, Math.round(40 + ratio * 56)));
  }

  private toNodeDto(node: any, renderTask?: any) {
    const taskPayload = (renderTask?.payload as any) || {};
    const taskResult = (renderTask?.result as any) || {};
    const basePrompt = String(node.prompt || node.scriptSegment || '').trim();
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
      videoPrompt: basePrompt || null,
      sceneFramePrompt: basePrompt ? `${basePrompt}，关键画面帧，主体清晰，16:9` : null,
      firstFramePrompt: basePrompt ? `${basePrompt}，开场首帧，电影感构图，16:9` : null,
      lastFramePrompt: basePrompt ? `${basePrompt}，收束尾帧，结尾定格，16:9` : null,
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

  private parseRefineCopyResult(content: string, fallbackSegment: string, fallbackPrompt: string) {
    const raw = String(content || '').trim();
    const candidates = [
      raw,
      raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim(),
      raw.replace(/```json/gi, '').replace(/```/g, '').trim(),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate);
        const scriptSegment = String(parsed?.scriptSegment || fallbackSegment).trim();
        const prompt = String(parsed?.prompt || fallbackPrompt || scriptSegment).trim();
        return { scriptSegment, prompt };
      } catch {
        // noop
      }
    }

    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]);
        return {
          scriptSegment: String(parsed?.scriptSegment || fallbackSegment).trim(),
          prompt: String(parsed?.prompt || fallbackPrompt || fallbackSegment).trim(),
        };
      } catch {
        // noop
      }
    }

    return {
      scriptSegment: fallbackSegment,
      prompt: fallbackPrompt || fallbackSegment,
    };
  }

  private async generateNextNodeWithLLM(
    userId: string,
    idea: string,
    current: { scriptSegment: string; prompt: string; orderIndex: number } | null,
  ): Promise<PromptBundle> {
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

    const fallback = this.normalizePromptBundle({}, idea, current);

    try {
      const response = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          messages: [
            {
              role: 'system',
              content:
                '你是短视频分镜导演助手。请只返回 JSON 对象，不要 markdown 代码块。必须包含字段：scriptSegment, videoPrompt, sceneFramePrompt, firstFramePrompt, lastFramePrompt。所有字段都要是中文高质量提示词/文案。',
            },
            {
              role: 'user',
              content: JSON.stringify(userPayload, null, 2),
            },
          ],
          temperature: 0.7,
        },
        userId,
      );

      const content =
        (response as any)?.choices?.[0]?.message?.content ??
        (response as any)?.content ??
        '';

      const parsed = this.parseJsonLoose(content);
      return this.normalizePromptBundle(parsed || {}, idea, current);
    } catch (error: any) {
      this.logger.warn(
        `Generate next node fallback: ${error?.message || 'unknown error'}`,
      );
      return fallback;
    }
  }

  private async generateNodeCandidatesWithLLM(
    userId: string,
    idea: string,
    current: { scriptSegment: string; prompt: string; orderIndex: number },
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

    try {
      const response = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          messages: [
            {
              role: 'system',
              content:
                '你是分镜拓展助手。请基于当前节点生成多个“下一个节点”候选。只返回 JSON 数组，不要 markdown。每个数组元素必须包含字段：scriptSegment, videoPrompt, sceneFramePrompt, firstFramePrompt, lastFramePrompt。',
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
        },
        userId,
      );

      const content =
        (response as any)?.choices?.[0]?.message?.content ??
        (response as any)?.content ??
        '';
      const parsed = this.parseJsonLoose(content);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return fallbackList;
      }

      const normalized = parsed
        .slice(0, count)
        .map((item: any) => this.normalizePromptBundle(item || {}, idea, current))
        .filter((item: PromptBundle) => Boolean(item.scriptSegment || item.videoPrompt));

      return normalized.length ? normalized : fallbackList;
    } catch (error: any) {
      this.logger.warn(
        `Generate node candidates fallback: ${error?.message || 'unknown error'}`,
      );
      return fallbackList;
    }
  }

  private normalizePromptBundle(
    payload: any,
    idea: string,
    current: { scriptSegment: string; prompt: string; orderIndex: number } | null,
  ): PromptBundle {
    const fallbackSegment = current
      ? `延续上一节点并推进剧情：${idea}`
      : `故事开场：${idea}`;
    const fallbackVideoPrompt = current
      ? `${current.prompt || current.scriptSegment || '连续镜头'}，推进到新场景：${idea}，电影感，16:9`
      : `${idea}，电影感镜头，16:9`;
    const scriptSegment = String(payload?.scriptSegment || fallbackSegment).trim();
    const videoPrompt = String(
      payload?.videoPrompt || payload?.prompt || payload?.sceneFramePrompt || fallbackVideoPrompt,
    ).trim();

    const sceneFramePrompt = String(
      payload?.sceneFramePrompt || `${videoPrompt}，关键画面帧，主体清晰，16:9`,
    ).trim();
    const firstFramePrompt = String(
      payload?.firstFramePrompt || `${videoPrompt}，开场首帧，电影感构图，16:9`,
    ).trim();
    const lastFramePrompt = String(
      payload?.lastFramePrompt || `${videoPrompt}，收束尾帧，结尾定格，16:9`,
    ).trim();

    return {
      scriptSegment,
      videoPrompt,
      sceneFramePrompt,
      firstFramePrompt,
      lastFramePrompt,
    };
  }

  private parseJsonLoose(content: string): any {
    const raw = String(content || '').trim();
    if (!raw) return null;

    const candidates = [
      raw,
      raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim(),
      raw.replace(/```json/gi, '').replace(/```/g, '').trim(),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        return JSON.parse(candidate);
      } catch {
        // noop
      }
    }

    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        // noop
      }
    }

    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        // noop
      }
    }

    return null;
  }

  private assertNodeAccess(node: any, userId: string) {
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
}
