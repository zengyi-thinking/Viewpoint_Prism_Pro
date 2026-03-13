import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreationService } from './creation.service';
import {
  AppendConversationMessageDto,
  BootstrapCreationProjectDto,
  CreateChapterNodesDto,
  GenerateIdeaPreviewsDto,
  GenerateNextNodeCandidatesDto,
  GenerateNodeImageDto,
  GenerateScriptPlanDto,
  SelectIdeaPreviewDto,
  SelectNextNodeCandidateDto,
  UpdateScriptPlanChapterDto,
  UpdateCreationNodeDto,
} from './dto';

@UseGuards(JwtAuthGuard)
@Controller('api/prism/creation')
export class CreationController {
  constructor(private readonly creationService: CreationService) {}

  @Post('projects/:projectId/bootstrap')
  bootstrapByProject(
    @CurrentUser() userId: string,
    @Param('projectId') projectId: string,
    @Body() dto: BootstrapCreationProjectDto,
  ) {
    return this.creationService.bootstrapByProject(userId, projectId, dto);
  }

  @Post('videos/:videoId/project/bootstrap')
  bootstrap(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: BootstrapCreationProjectDto,
  ) {
    return this.creationService.bootstrap(userId, videoId, dto);
  }

  @Get('projects/:flowProjectId/graph')
  getGraph(@CurrentUser() userId: string, @Param('flowProjectId') flowProjectId: string) {
    return this.creationService.getGraph(userId, flowProjectId);
  }

  @Post('projects/:projectId/conversation/messages')
  appendConversationMessageByProject(
    @CurrentUser() userId: string,
    @Param('projectId') projectId: string,
    @Body() dto: AppendConversationMessageDto,
  ) {
    return this.creationService.appendConversationMessageByProject(userId, projectId, dto);
  }

  @Post('projects/:flowProjectId/reset')
  resetProject(@CurrentUser() userId: string, @Param('flowProjectId') flowProjectId: string) {
    return this.creationService.resetProject(userId, flowProjectId);
  }

  @Post('projects/:projectId/idea-previews')
  generateIdeaPreviewsByProject(
    @CurrentUser() userId: string,
    @Param('projectId') projectId: string,
    @Body() dto: GenerateIdeaPreviewsDto,
  ) {
    return this.creationService.generateIdeaPreviewsByProject(userId, projectId, dto);
  }

  @Post('videos/:videoId/idea-previews')
  generateIdeaPreviews(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: GenerateIdeaPreviewsDto,
  ) {
    return this.creationService.generateIdeaPreviews(userId, videoId, dto);
  }

  @Post('projects/:flowProjectId/previews/select')
  selectIdeaPreview(
    @CurrentUser() userId: string,
    @Param('flowProjectId') flowProjectId: string,
    @Body() dto: SelectIdeaPreviewDto,
  ) {
    return this.creationService.selectIdeaPreview(userId, flowProjectId, dto);
  }

  @Post('projects/:projectId/script-plan')
  generateScriptPlanByProject(
    @CurrentUser() userId: string,
    @Param('projectId') projectId: string,
    @Body() dto: GenerateScriptPlanDto,
  ) {
    return this.creationService.generateScriptPlanByProject(userId, projectId, dto);
  }

  @Post('videos/:videoId/script-plan')
  generateScriptPlan(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: GenerateScriptPlanDto,
  ) {
    return this.creationService.generateScriptPlan(userId, videoId, dto);
  }

  @Patch('projects/:flowProjectId/script-plan/chapters/:chapterIndex')
  updateScriptPlanChapter(
    @CurrentUser() userId: string,
    @Param('flowProjectId') flowProjectId: string,
    @Param('chapterIndex') chapterIndex: string,
    @Body() dto: UpdateScriptPlanChapterDto,
  ) {
    return this.creationService.updateScriptPlanChapter(userId, flowProjectId, Number(chapterIndex), dto);
  }

  @Post('projects/:flowProjectId/chapters/create')
  createChapterNodes(
    @CurrentUser() userId: string,
    @Param('flowProjectId') flowProjectId: string,
    @Body() dto: CreateChapterNodesDto,
  ) {
    return this.creationService.createChapterNodes(userId, flowProjectId, dto);
  }

  @Patch('nodes/:nodeId')
  updateNode(
    @CurrentUser() userId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateCreationNodeDto,
  ) {
    return this.creationService.updateNode(userId, nodeId, dto);
  }

  @Delete('nodes/:nodeId')
  deleteNode(@CurrentUser() userId: string, @Param('nodeId') nodeId: string) {
    return this.creationService.deleteNode(userId, nodeId);
  }

  @Post('nodes/:nodeId/next-candidates')
  generateNextNodeCandidates(
    @CurrentUser() userId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: GenerateNextNodeCandidatesDto,
  ) {
    return this.creationService.generateNextNodeCandidates(userId, nodeId, dto);
  }

  @Post('nodes/:nodeId/next-candidates/select')
  selectNextNodeCandidate(
    @CurrentUser() userId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: SelectNextNodeCandidateDto,
  ) {
    return this.creationService.selectNextNodeCandidate(userId, nodeId, dto);
  }

  @Post('nodes/:nodeId/generate-image')
  generateNodeImage(
    @CurrentUser() userId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: GenerateNodeImageDto,
  ) {
    return this.creationService.generateNodeImage(userId, nodeId, dto);
  }

  @Post('nodes/:nodeId/reextract-character-anchor')
  reextractCharacterAnchor(@CurrentUser() userId: string, @Param('nodeId') nodeId: string) {
    return this.creationService.reextractCharacterAnchor(userId, nodeId);
  }

  @Post('nodes/:nodeId/render-video')
  renderNodeVideo(@CurrentUser() userId: string, @Param('nodeId') nodeId: string) {
    return this.creationService.renderNodeVideo(userId, nodeId);
  }

  @Post('projects/:flowProjectId/stitch')
  stitchProject(@CurrentUser() userId: string, @Param('flowProjectId') flowProjectId: string) {
    return this.creationService.stitchProject(userId, flowProjectId);
  }

  @Get('tasks/:taskId')
  getTask(@CurrentUser() userId: string, @Param('taskId') taskId: string) {
    return this.creationService.getTask(userId, taskId);
  }
}
