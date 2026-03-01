import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AiRouterModule } from './infrastructure/ai-router/ai-router.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { MediaModule } from './infrastructure/media/media.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { SyncModule } from './infrastructure/sync/sync.module';
import { WsModule } from './infrastructure/websocket/ws.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ProjectModule } from './modules/project/project.module';
import { VideoModule } from './modules/video/video.module';
import { ChatModule } from './modules/chat/chat.module';
import { KnowledgeModule } from './modules/prism-knowledge/knowledge.module';
import { CreationModule } from './modules/prism-creation/creation.module';
import { TranslationModule } from './modules/prism-translation/translation.module';
import { DiffractionModule } from './modules/prism-diffraction/diffraction.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Infrastructure
    PrismaModule,
    AiRouterModule,
    StorageModule,
    MediaModule,
    QueueModule,
    SyncModule,
    WsModule,
    // Business modules
    AuthModule,
    UserModule,
    ProjectModule,
    VideoModule,
    ChatModule,
    SettingsModule,
    // Prism modules
    KnowledgeModule,
    CreationModule,
    TranslationModule,
    DiffractionModule,
  ],
})
export class AppModule {}
