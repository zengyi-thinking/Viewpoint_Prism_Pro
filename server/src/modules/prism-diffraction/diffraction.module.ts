import { Module } from '@nestjs/common';
import { DiffractionController } from './diffraction.controller';
import { DiffractionService } from './diffraction.service';
import { PlatformTemplateService } from './services/platform-template.service';
import { ImageSelectService } from './services/image-select.service';
import { CopywritingService } from './services/copywriting.service';
import { BatchExportService } from './services/batch-export.service';
import { WsModule } from '../../infrastructure/websocket/ws.module';

@Module({
  imports: [WsModule],
  controllers: [DiffractionController],
  providers: [
    DiffractionService,
    PlatformTemplateService,
    ImageSelectService,
    CopywritingService,
    BatchExportService,
  ],
  exports: [DiffractionService],
})
export class DiffractionModule {}
