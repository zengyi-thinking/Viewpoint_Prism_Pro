import { Global, Module } from '@nestjs/common';
import { FfmpegService } from './ffmpeg.service';
import { ImageProcessService } from './image-process.service';

@Global()
@Module({
  providers: [FfmpegService, ImageProcessService],
  exports: [FfmpegService, ImageProcessService],
})
export class MediaModule {}
