import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { TranscribeProcessor } from './processors/transcribe.processor';
import { KeyframeProcessor } from './processors/keyframe.processor';
import { RenderProcessor } from './processors/render.processor';
import { TranslateProcessor } from './processors/translate.processor';
import { ExportProcessor } from './processors/export.processor';
import { PreviewProcessor } from './processors/preview.processor';
import { QUEUE_NAMES } from './queue.constants';
import { MediaModule } from '../media/media.module';
import { AiRouterModule } from '../ai-router/ai-router.module';
import { StorageModule } from '../storage/storage.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WsModule } from '../websocket/ws.module';
import { CreationModule } from '../../modules/prism-creation/creation.module';

function buildRedisConfig(configService: ConfigService) {
  const redisUrl = String(configService.get('REDIS_URL') || '').trim();
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      const db = parsed.pathname?.replace(/^\//, '');

      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 6379,
        ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
        ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
        ...(db ? { db: Number(db) || 0 } : {}),
        ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
      };
    } catch {
      // Fall through to explicit host/port fields if REDIS_URL is malformed.
    }
  }

  const host = String(configService.get('REDIS_HOST', 'localhost'));
  const port = Number(configService.get('REDIS_PORT', 6379));
  const username = String(configService.get('REDIS_USERNAME') || '').trim();
  const password = String(configService.get('REDIS_PASSWORD') || '').trim();

  return {
    host,
    port,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
  };
}

@Module({
  imports: [
    // Import modules that provide dependencies for processors
    MediaModule,
    AiRouterModule,
    StorageModule,
    PrismaModule,
    WsModule,
    forwardRef(() => CreationModule),
    // Register all queues with Bull
    BullModule.registerQueueAsync(
      {
        name: QUEUE_NAMES.TRANSCRIBE,
        useFactory: (configService: ConfigService) => ({
          redis: buildRedisConfig(configService),
        }),
        inject: [ConfigService],
      },
      {
        name: QUEUE_NAMES.KEYFRAME,
        useFactory: (configService: ConfigService) => ({
          redis: buildRedisConfig(configService),
        }),
        inject: [ConfigService],
      },
      {
        name: QUEUE_NAMES.RENDER,
        useFactory: (configService: ConfigService) => ({
          redis: buildRedisConfig(configService),
        }),
        inject: [ConfigService],
      },
      {
        name: QUEUE_NAMES.TRANSLATE,
        useFactory: (configService: ConfigService) => ({
          redis: buildRedisConfig(configService),
        }),
        inject: [ConfigService],
      },
      {
        name: QUEUE_NAMES.EXPORT,
        useFactory: (configService: ConfigService) => ({
          redis: buildRedisConfig(configService),
        }),
        inject: [ConfigService],
      },
      {
        name: QUEUE_NAMES.PREVIEW,
        useFactory: (configService: ConfigService) => ({
          redis: buildRedisConfig(configService),
        }),
        inject: [ConfigService],
      },
    ),
  ],
  providers: [
    // Register all processors
    TranscribeProcessor,
    KeyframeProcessor,
    RenderProcessor,
    TranslateProcessor,
    ExportProcessor,
    PreviewProcessor,
  ],
  exports: [
    // Export BullModule so other modules can register queues
    BullModule,
  ],
})
export class QueueModule {}
