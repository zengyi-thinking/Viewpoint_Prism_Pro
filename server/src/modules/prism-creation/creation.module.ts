import { Module } from '@nestjs/common';
import { CreationController } from './creation.controller';
import { CreationService } from './creation.service';
import { NodeService } from './services/node.service';
import { BranchService } from './services/branch.service';
import { StyleExtractService } from './services/style-extract.service';
import { FrameGenService } from './services/frame-gen.service';
import { VideoRenderService } from './services/video-render.service';
import { StitchService } from './services/stitch.service';
import { ExportService } from './services/export.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiRouterModule } from '../../infrastructure/ai-router/ai-router.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';

@Module({
  imports: [PrismaModule, AiRouterModule, StorageModule],
  controllers: [CreationController],
  providers: [
    CreationService,
    NodeService,
    BranchService,
    StyleExtractService,
    FrameGenService,
    VideoRenderService,
    StitchService,
    ExportService,
  ],
  exports: [CreationService, FrameGenService, VideoRenderService, StitchService, ExportService],
})
export class CreationModule {}
