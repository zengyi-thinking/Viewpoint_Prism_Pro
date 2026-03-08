import { Injectable } from '@nestjs/common';
import { CurrentNodeContext, PromptBundle } from '../foundation/creation-ai.types';
import { TextSimilarityService } from '../foundation/text-similarity.service';

@Injectable()
export class ContinuityGuardAgentService {
  constructor(private readonly similarity: TextSimilarityService) {}

  buildContinuityNotes(current: CurrentNodeContext | null, bundle: PromptBundle) {
    if (!current) {
      return {
        mode: 'opening',
        summary: '首节点，无需承接上一镜头，但必须稳定建立主视觉母题。',
        overlapKeywords: [],
        driftRisk: 'low' as const,
      };
    }

    const overlapKeywords = this.similarity.keywordOverlap(
      `${current.scriptSegment} ${current.prompt}`,
      `${bundle.scriptSegment} ${bundle.videoPrompt} ${bundle.firstFramePrompt} ${bundle.lastFramePrompt}`,
    );
    const continuityScore = this.similarity.jaccard(
      `${current.scriptSegment} ${current.prompt}`,
      `${bundle.scriptSegment} ${bundle.videoPrompt}`,
    );

    return {
      mode: 'continuation',
      summary:
        continuityScore >= 0.24
          ? '与上一镜头存在可观语义重叠，可作为连续镜头继续细化。'
          : '与上一镜头语义重叠偏弱，需要在主体、空间或镜头节奏上显式承接。',
      overlapKeywords,
      driftRisk:
        continuityScore >= 0.24 ? ('low' as const) : continuityScore >= 0.14 ? ('medium' as const) : ('high' as const),
    };
  }
}
