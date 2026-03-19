import { Module } from '@nestjs/common';
import { CreationController } from './creation.controller';
import { CreationService } from './creation.service';
import { CreationLlmService } from './services/creation-llm.service';
import { IdeaPlannerAgent } from './services/idea-planner.agent';
import { ScriptPlannerAgent } from './services/script-planner.agent';
import { StoryboardAgent } from './services/storyboard.agent';
import { PromptDirectorAgent } from './services/prompt-director.agent';
import { CreationRenderService } from './services/creation-render.service';
import { CreationPreviewService } from './services/creation-preview.service';
import { StoryConversationAgent } from './services/story-conversation.agent';
import { ScenePlannerAgent } from './services/scene-planner.agent';
import { CharacterAssetService } from './services/character-asset.service';
import { SceneAssetService } from './services/scene-asset.service';
import { StoryboardSegmentAgent } from './services/storyboard-segment.agent';
import { DialogueVoiceMapperAgent } from './services/dialogue-voice-mapper.agent';
import { PromptCompressionAgent } from './services/prompt-compression.agent';
import { VideoPromptCompilerAgent } from './services/video-prompt-compiler.agent';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { WsModule } from '../../infrastructure/websocket/ws.module';
import { SegmentVideoRenderService } from './services/segment-video-render.service';
import { FinalVideoComposeService } from './services/final-video-compose.service';

@Module({
  imports: [WsModule, QueueModule],
  controllers: [CreationController],
  providers: [
    CreationService,
    CreationLlmService,
    IdeaPlannerAgent,
    ScriptPlannerAgent,
    StoryboardAgent,
    PromptDirectorAgent,
    StoryConversationAgent,
    ScenePlannerAgent,
    CharacterAssetService,
    SceneAssetService,
    StoryboardSegmentAgent,
    DialogueVoiceMapperAgent,
    PromptCompressionAgent,
    VideoPromptCompilerAgent,
    CreationRenderService,
    CreationPreviewService,
    SegmentVideoRenderService,
    FinalVideoComposeService,
  ],
  exports: [CreationService],
})
export class CreationModule {}
