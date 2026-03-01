import { Module } from '@nestjs/common';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';
import { SubtitleService } from './services/subtitle.service';
import { InpaintingService } from './services/inpainting.service';
import { VoiceCloneService } from './services/voice-clone.service';
import { LipSyncService } from './services/lip-sync.service';

@Module({
  controllers: [TranslationController],
  providers: [
    TranslationService,
    SubtitleService,
    InpaintingService,
    VoiceCloneService,
    LipSyncService,
  ],
  exports: [TranslationService],
})
export class TranslationModule {}
