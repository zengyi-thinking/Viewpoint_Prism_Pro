import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DiffractionService } from './diffraction.service';
import { BatchExportDiffractionDto, GenerateDiffractionDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('api/prism/diffraction')
export class DiffractionController {
  constructor(private readonly diffractionService: DiffractionService) {}

  @Get('templates')
  getTemplates() {
    return this.diffractionService.getTemplates();
  }

  @Post('videos/:videoId/generate')
  @Post(':videoId/generate')
  generate(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: GenerateDiffractionDto,
  ) {
    return this.diffractionService.generate(userId, videoId, dto);
  }

  @Post('videos/:videoId/export')
  @Post(':videoId/batch-export')
  batchExport(
    @CurrentUser() userId: string,
    @Param('videoId') videoId: string,
    @Body() dto: BatchExportDiffractionDto,
  ) {
    return this.diffractionService.batchExport(userId, videoId, dto);
  }
}
