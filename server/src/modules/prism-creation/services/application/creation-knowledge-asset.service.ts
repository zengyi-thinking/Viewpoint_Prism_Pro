import { Injectable } from '@nestjs/common';
import { KnowledgeAssetDto } from '../../dto';
import { PromptBundle } from '../foundation/creation-ai.types';
import { CreationAgentModeService } from '../foundation/creation-agent-mode.service';
import { KnowledgeExtractService } from '../fallback/knowledge-extract.service';
import { KnowledgeStructurerAgentService } from '../agents/knowledge-structurer-agent.service';

@Injectable()
export class CreationKnowledgeAssetService {
  constructor(
    private readonly agentMode: CreationAgentModeService,
    private readonly knowledgeExtractService: KnowledgeExtractService,
    private readonly knowledgeStructurerAgent: KnowledgeStructurerAgentService,
  ) {}

  async buildFromBundle(
    bundle: PromptBundle,
    sourceId: string,
    userId: string,
  ): Promise<KnowledgeAssetDto & { sourceId: string }> {
    if (this.agentMode.shouldUseAgents()) {
      try {
        return {
          sourceId,
          ...(await this.knowledgeStructurerAgent.extract(userId, bundle)),
        };
      } catch (error) {
        if (!this.agentMode.shouldFallbackAfterAgentError()) {
          throw error;
        }
      }
    }

    return {
      sourceId,
      ...this.knowledgeExtractService.extractFromPromptBundle(bundle),
    };
  }
}
