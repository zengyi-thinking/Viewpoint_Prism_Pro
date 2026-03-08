import { Module } from '@nestjs/common';
import { CreationController } from './creation.controller';
import { CreationService } from './creation.service';
import { FrameGenService } from './services/frame-gen.service';
import { VideoRenderService } from './services/video-render.service';
import { StitchService } from './services/stitch.service';
import { ExportService } from './services/export.service';
import { PromptEngineService } from './services/prompt-engine.service';
import { CreationFlowService } from './services/creation-flow.service';
import { CreationAiService } from './services/creation-ai.service';
import { NodeEvaluationService } from './services/node-evaluation.service';
import { CreationTaskOrchestratorService } from './services/creation-task-orchestrator.service';
import { PromptParserService } from './services/prompt-parser.service';
import { CreationScriptService } from './services/creation-script.service';
import { CreationPreviewService } from './services/creation-preview.service';
import { KnowledgeExtractService } from './services/knowledge-extract.service';
import { PromptBundleFactoryService } from './services/prompt-bundle-factory.service';
import { TextSimilarityService } from './services/text-similarity.service';
import { CreationAgentModeService } from './services/creation-agent-mode.service';
import { CreationAgentTraceService } from './services/creation-agent-trace.service';
import { StoryPlannerAgentService } from './services/story-planner-agent.service';
import { ShotDesignerAgentService } from './services/shot-designer-agent.service';
import { ContinuityGuardAgentService } from './services/continuity-guard-agent.service';
import { QualityJudgeAgentService } from './services/quality-judge-agent.service';
import { KnowledgeStructurerAgentService } from './services/knowledge-structurer-agent.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiRouterModule } from '../../infrastructure/ai-router/ai-router.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule, PrismaModule, AiRouterModule, StorageModule],
  controllers: [CreationController],
  providers: [
    CreationService,
    FrameGenService,
    VideoRenderService,
    StitchService,
    ExportService,
    PromptEngineService,
    CreationFlowService,
    CreationAiService,
    NodeEvaluationService,
    CreationTaskOrchestratorService,
    PromptParserService,
    CreationScriptService,
    CreationPreviewService,
    KnowledgeExtractService,
    PromptBundleFactoryService,
    TextSimilarityService,
    CreationAgentModeService,
    CreationAgentTraceService,
    StoryPlannerAgentService,
    ShotDesignerAgentService,
    ContinuityGuardAgentService,
    QualityJudgeAgentService,
    KnowledgeStructurerAgentService,
  ],
  exports: [CreationService, FrameGenService, VideoRenderService, StitchService, ExportService, PromptEngineService],
})
export class CreationModule {}
