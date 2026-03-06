import { Module } from '@nestjs/common';
import { SyncModule } from '../../infrastructure/sync/sync.module';
import { WsModule } from '../../infrastructure/websocket/ws.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { TranscriptService } from './services/transcript.service';
import { KeyframeService } from './services/keyframe.service';
import { OutlineService } from './services/outline.service';
import { FlashcardService } from './services/flashcard.service';
import { CrystalCardService } from './services/crystal-card.service';
import { MindmapService } from './services/mindmap.service';
import { ExportService } from './services/export.service';
import { FrameInsightService } from './services/frame-insight.service';
import { DeepUnderstandingService } from './services/deep-understanding.service';

@Module({
  imports: [WsModule, SyncModule],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    TranscriptService,
    KeyframeService,
    OutlineService,
    FlashcardService,
    CrystalCardService,
    MindmapService,
    ExportService,
    FrameInsightService,
    DeepUnderstandingService,
  ],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
