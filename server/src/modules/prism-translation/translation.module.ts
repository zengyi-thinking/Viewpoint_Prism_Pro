import { Module } from '@nestjs/common';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';
import { SubtitleService } from './services/subtitle.service';
import { InpaintingService } from './services/inpainting.service';
import { VoiceCloneService } from './services/voice-clone.service';
import { LipSyncService } from './services/lip-sync.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { MediaModule } from '../../infrastructure/media/media.module';
import { AiRouterModule } from '../../infrastructure/ai-router/ai-router.module';

@Module({
  imports: [PrismaModule, StorageModule, MediaModule, AiRouterModule],
  controllers: [TranslationController],
  providers: [
    TranslationService,
    SubtitleService,
    InpaintingService,
    VoiceCloneService,
    LipSyncService,
  ],
  exports: [TranslationService, LipSyncService, InpaintingService, VoiceCloneService],
})
export class TranslationModule {}
