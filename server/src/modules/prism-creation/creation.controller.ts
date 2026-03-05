import { Body, Controller, Get, Param, Patch, Post, Delete, UseGuards, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreationService } from './creation.service';
import {
  CreateBranchDto,
  CreateFlowNodeDto,
  UpdateFlowNodeDto,
  RenderFlowDto,
  StitchFlowDto,
  StitchExportDto,
  ExportProjectDto,
  ScriptSplitDto,
  GenerateFrameDto,
  LockFrameDto,
  RenderQuality,
  RefineCopyDto,
  GenerateNextNodeDto,
  GenerateNodeCandidatesDto,
} from './dto';

@UseGuards(JwtAuthGuard)
@Controller('api/prism/creation')
export class CreationController {
  constructor(private readonly creationService: CreationService) {}

  @Get('videos/:videoId/nodes')
  @Get(':videoId/nodes')
  getNodes(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.creationService.getNodes(userId, videoId);
  }

  @Post('videos/:videoId/nodes')
  @Post(':videoId/nodes')
  createNode(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: CreateFlowNodeDto,
  ) {
    return this.creationService.createNode(userId, videoId, dto);
  }

  @Post('videos/:videoId/nodes/next')
  @Post(':videoId/nodes/next')
  generateNextNode(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: GenerateNextNodeDto,
  ) {
    return this.creationService.generateNextNode(userId, videoId, dto);
  }

  @Post('videos/:videoId/nodes/expand-candidates')
  @Post(':videoId/nodes/expand-candidates')
  generateNodeCandidates(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: GenerateNodeCandidatesDto,
  ) {
    return this.creationService.generateNodeCandidates(userId, videoId, dto);
  }

  @Patch('videos/:videoId/nodes/:nodeId')
  @Patch(':videoId/nodes/:nodeId')
  updateNode(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateFlowNodeDto,
  ) {
    return this.creationService.updateNode(userId, videoId, nodeId, dto);
  }

  @Delete('videos/:videoId/nodes/:nodeId')
  @Delete(':videoId/nodes/:nodeId')
  deleteNode(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.creationService.deleteNode(userId, videoId, nodeId);
  }

  @Post('videos/:videoId/branches')
  @Post(':videoId/branches')
  createBranch(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.creationService.createBranch(userId, videoId, dto);
  }

  @Post('videos/:videoId/branches/:nodeId/merge')
  @Post(':videoId/branches/:nodeId/merge')
  mergeBranch(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.creationService.mergeBranch(userId, videoId, nodeId);
  }

  @Post('videos/:videoId/render')
  @Post(':videoId/render')
  render(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: RenderFlowDto,
  ) {
    return this.creationService.render(userId, videoId, dto);
  }

  @Post('videos/:videoId/stitch')
  @Post(':videoId/stitch')
  stitch(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: StitchFlowDto,
  ) {
    return this.creationService.stitch(userId, videoId, dto);
  }

  @Post('videos/:videoId/export')
  @Post(':videoId/export')
  exportProject(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto?: ExportProjectDto,
  ) {
    return this.creationService.exportProject(userId, videoId, dto);
  }

  @Get('tasks/:taskId/stitch-status')
  getStitchTaskStatus(
    @CurrentUser() userId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.creationService.getStitchTaskStatus(taskId);
  }

  @Get('tasks/:taskId/export-status')
  getExportTaskStatus(
    @CurrentUser() userId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.creationService.getExportTaskStatus(taskId);
  }

  @Get('tasks/:taskId/render-status')
  getRenderTaskStatus(
    @CurrentUser() userId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.creationService.getRenderTaskStatus(userId, taskId);
  }

  @Post('videos/:videoId/script-split')
  @Post(':videoId/script-split')
  scriptSplit(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: ScriptSplitDto,
  ) {
    return this.creationService.scriptSplit(userId, videoId, dto);
  }

  // Frame generation endpoints
  @Post('nodes/:nodeId/generate-frame')
  generateFrame(
    @CurrentUser() userId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: GenerateFrameDto,
  ) {
    return this.creationService.generateFrame(userId, nodeId, dto);
  }

  @Post('nodes/:nodeId/lock-frame')
  lockFrame(
    @CurrentUser() userId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: LockFrameDto,
  ) {
    return this.creationService.lockFrame(userId, nodeId, dto);
  }

  // Render single node endpoint
  @Post('nodes/:nodeId/render')
  renderNode(
    @CurrentUser() userId: string,
    @Param('nodeId') nodeId: string,
    @Query('quality') quality?: RenderQuality,
  ) {
    return this.creationService.renderNode(userId, nodeId, quality);
  }

  @Post('nodes/:nodeId/refine-copy')
  refineNodeCopy(
    @CurrentUser() userId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: RefineCopyDto,
  ) {
    return this.creationService.refineNodeCopy(userId, nodeId, dto);
  }
}
