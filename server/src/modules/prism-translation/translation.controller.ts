import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TranslationService } from './translation.service';
import { LipSyncService } from './services/lip-sync.service';
import {
  CreateTranslationTaskDto,
  DeleteVoiceProfileDto,
  ExportTranslationDto,
  InpaintingDto,
  LipSyncDto,
  SetActiveVoiceDto,
  UpdateSubtitleSegmentsDto,
  VoiceCloneDto,
  VoicePreviewDto,
} from './dto';

@UseGuards(JwtAuthGuard)
@Controller('api/prism/translation')
export class TranslationController {
  constructor(
    private readonly translationService: TranslationService,
    private readonly lipSyncService: LipSyncService,
  ) {}

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

  @Post('videos/:videoId/voice-clone/preview')
  @Post(':videoId/voice-clone/preview')
  voiceClonePreview(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: VoicePreviewDto,
  ) {
    return this.translationService.voiceClonePreview(userId, videoId, dto);
  }

  @Post('videos/:videoId/voice-clone/set-active')
  @Post(':videoId/voice-clone/set-active')
  setActiveVoice(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: SetActiveVoiceDto,
  ) {
    return this.translationService.setActiveVoice(userId, videoId, dto);
  }

  @Delete('videos/:videoId/voice-clone/profile')
  @Delete(':videoId/voice-clone/profile')
  deleteVoiceProfile(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: DeleteVoiceProfileDto,
  ) {
    return this.translationService.deleteVoiceProfile(userId, videoId, dto);
  }

  @Get('videos/:videoId/voice-clone/status')
  @Get(':videoId/voice-clone/status')
  getVoiceCloneStatus(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.translationService.getVoiceCloneStatus(userId, videoId);
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

  @Get('videos/:videoId/lip-sync/status')
  @Get(':videoId/lip-sync/status')
  getLipSyncStatus(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.lipSyncService.getVideoLipSyncStatus(videoId, userId);
  }

  @Get('lip-sync/tasks/:taskId')
  getLipSyncTaskStatus(
    @CurrentUser() userId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.lipSyncService.getTaskStatus(taskId, userId);
  }

  @Post('lip-sync/tasks/:taskId/retry')
  retryLipSyncTask(
    @CurrentUser() userId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.lipSyncService.retryTask(taskId, userId);
  }

  @Post('videos/:videoId/inpainting')
  @Post(':videoId/inpainting')
  inpaintVideo(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: InpaintingDto,
  ) {
    return this.translationService.inpaintVideo(
      userId,
      videoId,
      dto,
    );
  }
}
