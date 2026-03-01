import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TranslationService } from './translation.service';
import {
  CreateTranslationTaskDto,
  ExportTranslationDto,
  LipSyncDto,
  UpdateSubtitleSegmentsDto,
  VoiceCloneDto,
} from './dto';

@UseGuards(JwtAuthGuard)
@Controller('api/prism/translation')
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post('videos/:videoId/tasks')
  @Post(':videoId/translate')
  createTask(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: CreateTranslationTaskDto,
  ) {
    return this.translationService.createTask(userId, videoId, dto);
  }

  @Get('videos/:videoId/subtitles')
  @Get(':videoId/subtitles')
  getSubtitles(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.translationService.getSubtitles(userId, videoId);
  }

  @Patch('videos/:videoId/subtitles')
  @Patch(':videoId/subtitles')
  updateSubtitles(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: UpdateSubtitleSegmentsDto,
  ) {
    return this.translationService.updateSubtitles(userId, videoId, dto);
  }

  @Post('videos/:videoId/voice-clone')
  @Post(':videoId/voice-clone')
  voiceClone(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: VoiceCloneDto,
  ) {
    return this.translationService.voiceClone(userId, videoId, dto);
  }

  @Post('videos/:videoId/lip-sync')
  @Post(':videoId/lip-sync')
  lipSync(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: LipSyncDto,
  ) {
    return this.translationService.lipSync(userId, videoId, dto);
  }

  @Post('videos/:videoId/export')
  @Post(':videoId/export')
  exportTranslation(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: ExportTranslationDto,
  ) {
    return this.translationService.export(userId, videoId, dto);
  }
}
