import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CreationController } from './creation.controller';
import { CreationService } from './creation.service';
import { CreationLlmService } from './services/creation-llm.service';
import { IdeaPlannerAgent } from './services/idea-planner.agent';
import { ScriptPlannerAgent } from './services/script-planner.agent';
import { StoryboardAgent } from './services/storyboard.agent';
import { PromptDirectorAgent } from './services/prompt-director.agent';
import { CreationRenderService } from './services/creation-render.service';
import { StoryConversationAgent } from './services/story-conversation.agent';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';
import { WsModule } from '../../infrastructure/websocket/ws.module';

@Module({
  imports: [WsModule, BullModule.registerQueue({ name: QUEUE_NAMES.RENDER }, { name: QUEUE_NAMES.EXPORT })],
  controllers: [CreationController],
  providers: [
    CreationService,
    CreationLlmService,
    IdeaPlannerAgent,
    ScriptPlannerAgent,
    StoryboardAgent,
    PromptDirectorAgent,
    StoryConversationAgent,
    CreationRenderService,
  ],
  exports: [CreationService],
})
export class CreationModule {}
