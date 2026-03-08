import { Injectable } from '@nestjs/common';
import {
  CreateBranchDto,
  CreateFlowNodeDto,
  ExportProjectDto,
  GenerateFrameDto,
  GenerateIdeaPreviewDto,
  GenerateNextNodeDto,
  GenerateNodeCandidatesDto,
  LockFrameDto,
  RefineCopyDto,
  RenderFlowDto,
  RenderNodeDto,
  RenderQuality,
  ScriptSplitDto,
  StitchFlowDto,
  UpdateFlowNodeDto,
} from './dto';
import { CreationAiService } from './services/creation-ai.service';
import { CreationFlowService } from './services/creation-flow.service';
import { CreationTaskOrchestratorService } from './services/creation-task-orchestrator.service';
import { NodeEvaluationService } from './services/node-evaluation.service';

@Injectable()
export class CreationService {
  constructor(
    private readonly flowService: CreationFlowService,
    private readonly aiService: CreationAiService,
    private readonly evalService: NodeEvaluationService,
    private readonly taskOrchestrator: CreationTaskOrchestratorService,
  ) {}

  // Flow CRUD
  getOrCreateProject(userId: string, videoId: string) {
    return this.flowService.getOrCreateProject(userId, videoId);
  }

  getNodes(userId: string, videoId: string) {
    return this.flowService.getNodes(userId, videoId);
  }

  createNode(userId: string, videoId: string, dto: CreateFlowNodeDto) {
    return this.flowService.createNode(userId, videoId, dto);
  }

  updateNode(userId: string, videoId: string, nodeId: string, dto: UpdateFlowNodeDto) {
    return this.flowService.updateNode(userId, videoId, nodeId, dto);
  }

  deleteNode(userId: string, videoId: string, nodeId: string) {
    return this.flowService.deleteNode(userId, videoId, nodeId);
  }

  createBranch(userId: string, videoId: string, dto: CreateBranchDto) {
    return this.flowService.createBranch(userId, videoId, dto);
  }

  mergeBranch(userId: string, videoId: string, branchNodeId: string) {
    return this.flowService.mergeBranch(userId, videoId, branchNodeId);
  }

  // AI
  scriptSplit(userId: string, videoId: string, dto: ScriptSplitDto) {
    return this.aiService.scriptSplit(userId, videoId, dto);
  }

  generateNextNode(userId: string, videoId: string, dto: GenerateNextNodeDto) {
    return this.aiService.generateNextNode(userId, videoId, dto);
  }

  generateIdeaPreview(userId: string, videoId: string, dto: GenerateIdeaPreviewDto) {
    return this.aiService.generateIdeaPreview(userId, videoId, dto);
  }

  generateNodeCandidates(userId: string, videoId: string, dto: GenerateNodeCandidatesDto) {
    return this.aiService.generateNodeCandidates(userId, videoId, dto);
  }

  refineNodeCopy(userId: string, nodeId: string, dto: RefineCopyDto) {
    return this.aiService.refineNodeCopy(userId, nodeId, dto);
  }

  // Evaluation
  precheckNode(userId: string, nodeId: string) {
    return this.evalService.precheckNode(userId, nodeId);
  }

  assessNodeQuality(userId: string, nodeId: string) {
    return this.evalService.assessNodeQuality(userId, nodeId);
  }

  compareBranch(userId: string, branchNodeId: string) {
    return this.evalService.compareBranch(userId, branchNodeId);
  }

  // Task orchestration
  render(userId: string, videoId: string, dto: RenderFlowDto) {
    return this.taskOrchestrator.render(userId, videoId, dto);
  }

  stitch(userId: string, videoId: string, dto: StitchFlowDto) {
    return this.taskOrchestrator.stitch(userId, videoId, dto);
  }

  exportProject(userId: string, videoId: string, dto?: ExportProjectDto) {
    return this.taskOrchestrator.exportProject(userId, videoId, dto);
  }

  getStitchTaskStatus(taskId: string) {
    return this.taskOrchestrator.getStitchTaskStatus(taskId);
  }

  getExportTaskStatus(taskId: string) {
    return this.taskOrchestrator.getExportTaskStatus(taskId);
  }

  getRenderTaskStatus(userId: string, taskId: string) {
    return this.taskOrchestrator.getRenderTaskStatus(userId, taskId);
  }

  generateFrame(userId: string, nodeId: string, dto: GenerateFrameDto) {
    return this.taskOrchestrator.generateFrame(userId, nodeId, dto);
  }

  lockFrame(userId: string, nodeId: string, dto: LockFrameDto) {
    return this.taskOrchestrator.lockFrame(userId, nodeId, dto);
  }

  renderNode(userId: string, nodeId: string, quality?: RenderQuality, dto?: RenderNodeDto) {
    return this.taskOrchestrator.renderNode(userId, nodeId, quality, dto);
  }
}

