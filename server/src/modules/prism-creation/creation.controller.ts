import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreationService } from './creation.service';
import { CreateBranchDto, CreateFlowNodeDto, RenderFlowDto, StitchFlowDto } from './dto';

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

  @Post('videos/:videoId/branches')
  @Post(':videoId/branches')
  createBranch(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.creationService.createBranch(userId, videoId, dto);
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
}
