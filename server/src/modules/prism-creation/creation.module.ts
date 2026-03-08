import { Module } from '@nestjs/common';
import { CreationController } from './creation.controller';
import { CreationService } from './creation.service';
import { FrameGenService } from './services/media/frame-gen.service';
import { VideoRenderService } from './services/media/video-render.service';
import { StitchService } from './services/media/stitch.service';
import { ExportService } from './services/media/export.service';
import { PromptEngineService } from './services/foundation/prompt-engine.service';
import { CreationFlowService } from './services/application/creation-flow.service';
import { CreationIdeationService } from './services/application/creation-ideation.service';
import { CreationKnowledgeAssetService } from './services/application/creation-knowledge-asset.service';
import { CreationNodeAuthoringService } from './services/application/creation-node-authoring.service';
import { NodeEvaluationService } from './services/application/node-evaluation.service';
import { CreationTaskOrchestratorService } from './services/application/creation-task-orchestrator.service';
import { PromptParserService } from './services/foundation/prompt-parser.service';
import { KnowledgeExtractService } from './services/fallback/knowledge-extract.service';
import { PromptBundleFactoryService } from './services/foundation/prompt-bundle-factory.service';
import { TextSimilarityService } from './services/foundation/text-similarity.service';
import { CreationAgentModeService } from './services/foundation/creation-agent-mode.service';
import { CreationAgentTraceService } from './services/foundation/creation-agent-trace.service';
import { StoryPlannerAgentService } from './services/agents/story-planner-agent.service';
import { ShotDesignerAgentService } from './services/agents/shot-designer-agent.service';
import { ContinuityGuardAgentService } from './services/agents/continuity-guard-agent.service';
import { QualityJudgeAgentService } from './services/agents/quality-judge-agent.service';
import { KnowledgeStructurerAgentService } from './services/agents/knowledge-structurer-agent.service';
import { ScriptBreakdownAgentService } from './services/agents/script-breakdown-agent.service';
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
    CreationIdeationService,
    CreationNodeAuthoringService,
    CreationKnowledgeAssetService,
    NodeEvaluationService,
    CreationTaskOrchestratorService,
    PromptParserService,
    ScriptBreakdownAgentService,
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
