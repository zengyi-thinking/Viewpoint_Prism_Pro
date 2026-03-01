import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { TranscriptService } from './services/transcript.service';
import { KeyframeService } from './services/keyframe.service';
import { OutlineService } from './services/outline.service';
import { FlashcardService } from './services/flashcard.service';
import { ExportService } from './services/export.service';

@Module({
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    TranscriptService,
    KeyframeService,
    OutlineService,
    FlashcardService,
    ExportService,
  ],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
