import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { FfmpegService } from '../../../infrastructure/media/ffmpeg.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';

@Injectable()
export class FinalVideoComposeService {
  constructor(
    private readonly configService: ConfigService,
    private readonly aiRouter: AiRouterService,
    private readonly ffmpegService: FfmpegService,
    private readonly storageService: StorageService,
  ) {}

  async generateNarrationAudio(params: {
    userId: string;
    projectId: string;
    text: string;
  }) {
    const result = await this.aiRouter.execute(
      AITaskType.TTS,
      {
        text: params.text,
        model:
          this.configService.get<string>('CREATION_AI_NARRATION_TTS_MODEL') ||
          'gpt-4o-mini-tts',
        voice: 'alloy',
      },
      params.userId,
    );

    const audioBase64 = String(result?.audio || result?.audioData || '').trim();
    if (!audioBase64) {
      throw new Error('旁白 TTS 未返回音频数据');
    }

    const buffer = Buffer.from(audioBase64, 'base64');
    const storageKey = this.storageService.generateStoragePath(
      params.userId,
      params.projectId,
      'creation-audio',
      `narration-${Date.now()}.mp3`,
    );

    return this.storageService.upload(buffer, storageKey, {
      contentType: 'audio/mpeg',
    });
  }

  async generateAmbientBgm(params: {
    userId: string;
    projectId: string;
    durationSec: number;
  }) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'creation-bgm-'));
    const tempPath = path.join(tempDir, `ambient-${Date.now()}.mp3`);

    try {
      await this.ffmpegService.generateAmbientBed(params.durationSec, tempPath);
      const buffer = await fs.readFile(tempPath);
      const storageKey = this.storageService.generateStoragePath(
        params.userId,
        params.projectId,
        'creation-audio',
        `bgm-${Date.now()}.mp3`,
      );

      return await this.storageService.upload(buffer, storageKey, {
        contentType: 'audio/mpeg',
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
