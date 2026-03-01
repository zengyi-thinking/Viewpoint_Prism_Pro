import { Injectable } from '@nestjs/common';

@Injectable()
export class FfmpegService {
  async extractFrame(videoPath: string, timestamp: number): Promise<string> {
    // TODO
    throw new Error('Not implemented');
  }

  async stitchVideos(videoPaths: string[], outputPath: string): Promise<string> {
    // TODO
    throw new Error('Not implemented');
  }

  async burnSubtitles(videoPath: string, subtitlePath: string, outputPath: string): Promise<string> {
    // TODO
    throw new Error('Not implemented');
  }

  async generateThumbnail(videoPath: string): Promise<string> {
    // TODO
    throw new Error('Not implemented');
  }
}
