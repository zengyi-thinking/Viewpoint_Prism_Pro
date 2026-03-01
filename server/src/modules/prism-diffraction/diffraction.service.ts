import { Injectable } from '@nestjs/common';
import { BatchExportDiffractionDto, GenerateDiffractionDto } from './dto';

@Injectable()
export class DiffractionService {
  getTemplates() {
    // TODO: load template library from DB/config
    return {
      templates: [
        { platform: 'xiaohongshu', name: '种草干货模版', maxLength: 500 },
        { platform: 'twitter_x', name: 'Thread 悬念模版', maxLength: 280 },
        { platform: 'newsletter', name: '深度长文模版', maxLength: 2000 },
      ],
    };
  }

  async generate(userId: string, videoId: string, dto: GenerateDiffractionDto) {
    // TODO: enqueue platform draft generation
    return {
      taskId: `diffraction_generate_${Date.now()}`,
      userId,
      videoId,
      ...dto,
      status: 'queued',
    };
  }

  async batchExport(
    userId: string,
    videoId: string,
    dto: BatchExportDiffractionDto,
  ) {
    // TODO: enqueue multi-platform export
    return {
      taskId: `diffraction_export_${Date.now()}`,
      userId,
      videoId,
      ...dto,
      status: 'queued',
    };
  }
}
