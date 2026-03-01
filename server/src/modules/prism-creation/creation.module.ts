import { Module } from '@nestjs/common';
import { CreationController } from './creation.controller';
import { CreationService } from './creation.service';
import { NodeService } from './services/node.service';
import { BranchService } from './services/branch.service';
import { StyleExtractService } from './services/style-extract.service';
import { FrameGenService } from './services/frame-gen.service';
import { VideoRenderService } from './services/video-render.service';
import { StitchService } from './services/stitch.service';

@Module({
  controllers: [CreationController],
  providers: [
    CreationService,
    NodeService,
    BranchService,
    StyleExtractService,
    FrameGenService,
    VideoRenderService,
    StitchService,
  ],
  exports: [CreationService],
})
export class CreationModule {}
