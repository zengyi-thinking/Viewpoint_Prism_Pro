import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { KnowledgeService } from './knowledge.service';
import { AnalyzeKnowledgeDto, ExportKnowledgeDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('api/prism/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('videos/:videoId/analyze')
  @Post(':videoId/analyze')
  analyze(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: AnalyzeKnowledgeDto,
  ) {
    return this.knowledgeService.analyze(userId, videoId, dto);
  }

  @Get('videos/:videoId/transcript')
  @Get(':videoId/transcript')
  getTranscript(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.knowledgeService.getTranscript(userId, videoId);
  }

  @Get('videos/:videoId/outline')
  @Get(':videoId/outline')
  getOutline(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.knowledgeService.getOutline(userId, videoId);
  }

  @Get('videos/:videoId/flashcards')
  @Get(':videoId/flashcards')
  getFlashcards(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.knowledgeService.getFlashcards(userId, videoId);
  }

  @Post('videos/:videoId/export')
  @Post(':videoId/export')
  exportKnowledge(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: ExportKnowledgeDto,
  ) {
    return this.knowledgeService.export(userId, videoId, dto);
  }
}
