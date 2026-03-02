import { Module } from '@nestjs/common';
import { WsModule } from '../../infrastructure/websocket/ws.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { KnowledgeModule } from '../prism-knowledge/knowledge.module';
import { VideoBehaviorModule } from '../video-behavior/video-behavior.module';

@Module({
  imports: [WsModule, KnowledgeModule, VideoBehaviorModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
