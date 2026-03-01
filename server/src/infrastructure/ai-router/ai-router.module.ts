import { Module, Global } from '@nestjs/common';
import { AiRouterService } from './ai-router.service';
import { OpenAIProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { WhisperProvider } from './providers/whisper.provider';
import { VolcengineAsrProvider } from './providers/volcengine-asr.provider';
import { AliyunAsrProvider } from './providers/aliyun-asr.provider';
import { MidjourneyProvider } from './providers/midjourney.provider';
import { SeedanceProvider } from './providers/seedance.provider';
import { ElevenLabsProvider } from './providers/elevenlabs.provider';
import { PrismaService } from '../../prisma/prisma.service';

@Global()
@Module({
  providers: [
    AiRouterService,
    OpenAIProvider,
    GeminiProvider,
    WhisperProvider,
    VolcengineAsrProvider,
    AliyunAsrProvider,
    MidjourneyProvider,
    SeedanceProvider,
    ElevenLabsProvider,
    PrismaService,
  ],
  exports: [
    AiRouterService,
    OpenAIProvider,
    GeminiProvider,
    WhisperProvider,
    VolcengineAsrProvider,
    AliyunAsrProvider,
    MidjourneyProvider,
    SeedanceProvider,
    ElevenLabsProvider,
  ],
})
export class AiRouterModule {}
