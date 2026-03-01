import { Controller, Get, Post, Param } from '@nestjs/common';
import { DiffractionService } from './diffraction.service';

@Controller('api/prism/diffraction')
export class DiffractionController {
  constructor(private readonly diffractionService: DiffractionService) {}

  @Get('templates')
  getTemplates() {
    // TODO
  }

  @Post(':videoId/generate')
  generate(@Param('videoId') videoId: string) {
    // TODO
  }

  @Post(':videoId/batch-export')
  batchExport(@Param('videoId') videoId: string) {
    // TODO
  }
}
