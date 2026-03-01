import { Controller, Get, Post, Param } from '@nestjs/common';
import { TranslationService } from './translation.service';

@Controller('api/prism/translation')
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post(':videoId/translate')
  translate(@Param('videoId') videoId: string) {
    // TODO
  }

  @Get(':videoId/subtitles')
  getSubtitles(@Param('videoId') videoId: string) {
    // TODO
  }

  @Post(':videoId/voice-clone')
  voiceClone(@Param('videoId') videoId: string) {
    // TODO
  }

  @Post(':videoId/lip-sync')
  lipSync(@Param('videoId') videoId: string) {
    // TODO
  }
}
