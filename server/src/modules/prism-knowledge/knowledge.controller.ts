import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { KnowledgeService } from './knowledge.service';
import {
  AnalyzeKnowledgeDto,
  BatchAnalyzeKnowledgeDto,
  ExportKnowledgeDto,
  GenerateMindmapDto,
  RegenerateFlashcardsDto,
} from './dto';
import { MindmapResult } from './services/mindmap.service';

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

  @Post('videos/analyze-batch')
  analyzeBatch(
    @CurrentUser() userId: string,
    @Body() dto: BatchAnalyzeKnowledgeDto,
  ) {
    return this.knowledgeService.analyzeBatch(userId, dto);
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

  @Post('videos/:videoId/outline/regenerate')
  @Post(':videoId/outline/regenerate')
  regenerateOutline(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.knowledgeService.regenerateOutline(userId, videoId);
  }

  @Get('videos/:videoId/flashcards')
  @Get(':videoId/flashcards')
  getFlashcards(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.knowledgeService.getFlashcards(userId, videoId);
  }

  @Post('videos/:videoId/flashcards/regenerate')
  @Post(':videoId/flashcards/regenerate')
  regenerateFlashcards(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: RegenerateFlashcardsDto,
  ) {
    return this.knowledgeService.regenerateFlashcards(userId, videoId, dto);
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

  /**
   * 生成思维导图
   */
  @Post('videos/:videoId/mindmap')
  @Post(':videoId/mindmap')
  generateMindmap(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: GenerateMindmapDto,
  ) {
    return this.knowledgeService.generateMindmap(userId, videoId, dto);
  }

  /**
   * 获取思维导图
   */
  @Get('videos/:videoId/mindmap')
  @Get(':videoId/mindmap')
  getMindmap(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.knowledgeService.getMindmap(userId, videoId);
  }

  /**
   * 导出思维导图
   */
  @Get('videos/:videoId/mindmap/export')
  @Get(':videoId/mindmap/export')
  exportMindmap(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Query('format') format: 'json' | 'markdown' | 'mermaid' | 'xmind' | 'freemind',
  ) {
    return this.knowledgeService.exportMindmap(userId, videoId, format);
  }

  /**
   * 获取晶体卡片列表
   */
  @Get('videos/:videoId/crystal-cards')
  @Get(':videoId/crystal-cards')
  getCrystalCards(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Query('type') type?: string,
  ) {
    return this.knowledgeService.getCrystalCards(userId, videoId, type);
  }

  /**
   * 获取精选晶体卡片
   */
  @Get('videos/:videoId/crystal-cards/featured')
  @Get(':videoId/crystal-cards/featured')
  getFeaturedCrystalCards(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.knowledgeService.getFeaturedCrystalCards(userId, videoId);
  }

  /**
   * 获取单个晶体卡片
   */
  @Get('crystal-cards/:cardId')
  getCrystalCard(
    @CurrentUser() userId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.knowledgeService.getCrystalCard(userId, cardId);
  }

  /**
   * 更新晶体卡片
   */
  @Patch('crystal-cards/:cardId')
  updateCrystalCard(
    @CurrentUser() userId: string,
    @Param('cardId') cardId: string,
    @Body() updates: any,
  ) {
    return this.knowledgeService.updateCrystalCard(userId, cardId, updates);
  }

  /**
   * 删除晶体卡片
   */
  @Delete('crystal-cards/:cardId')
  deleteCrystalCard(
    @CurrentUser() userId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.knowledgeService.deleteCrystalCard(userId, cardId);
  }

  /**
   * 重新生成晶体卡片
   */
  @Post('videos/:videoId/crystal-cards/regenerate')
  regenerateCrystalCards(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() options: any,
  ) {
    return this.knowledgeService.regenerateCrystalCards(userId, videoId, options);
  }
}
