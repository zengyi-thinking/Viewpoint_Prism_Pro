import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreationFlowService } from './creation-flow.service';
import {
  EVALUATION_RULES_VERSION,
  EVALUATION_WEIGHTS,
} from '../fallback/evaluation-rules';
import { CreationAgentModeService } from '../foundation/creation-agent-mode.service';
import { QualityJudgeAgentService } from '../agents/quality-judge-agent.service';
import { TextSimilarityService } from '../foundation/text-similarity.service';

@Injectable()
export class NodeEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flowService: CreationFlowService,
    private readonly agentMode: CreationAgentModeService,
    private readonly qualityJudgeAgent: QualityJudgeAgentService,
    private readonly similarity: TextSimilarityService,
  ) {}

  async precheckNode(userId: string, nodeId: string) {
    const node = await this.flowService.getNodeWithProject(nodeId);
    if (!node) {
      throw new NotFoundException('Node not found');
    }
    this.flowService.assertNodeAccess(node, userId);

    const parentNode = node.parentNodeId
      ? await this.prisma.flowNode.findUnique({ where: { id: node.parentNodeId } })
      : null;

    const result = await this.evaluateNodeReadiness(userId, node, parentNode);
    return {
      userId,
      nodeId,
      ruleVersion: EVALUATION_RULES_VERSION,
      ...result,
    };
  }

  async assessNodeQuality(userId: string, nodeId: string) {
    const node = await this.flowService.getNodeWithProject(nodeId);
    if (!node) {
      throw new NotFoundException('Node not found');
    }
    this.flowService.assertNodeAccess(node, userId);

    const parentNode = node.parentNodeId
      ? await this.prisma.flowNode.findUnique({ where: { id: node.parentNodeId } })
      : null;

    const readiness = await this.evaluateNodeReadiness(userId, node, parentNode);
    return {
      userId,
      nodeId,
      ruleVersion: EVALUATION_RULES_VERSION,
      quality: readiness.quality,
      precheckLevel: readiness.level,
      issueCount: readiness.issues.length,
    };
  }

  async compareBranch(userId: string, branchNodeId: string) {
    const branchNode = await this.flowService.getNodeWithProject(branchNodeId);
    if (!branchNode) {
      throw new NotFoundException('Branch node not found');
    }
    this.flowService.assertNodeAccess(branchNode, userId);

    if (!branchNode.parentNodeId) {
      throw new BadRequestException('Current node is not a branch node');
    }

    const mainNode = await this.prisma.flowNode.findUnique({
      where: { id: branchNode.parentNodeId },
    });

    if (!mainNode) {
      throw new NotFoundException('Main node for this branch is missing');
    }

    const branchReadiness = await this.evaluateNodeReadiness(userId, branchNode, mainNode);
    const mainReadiness = await this.evaluateNodeReadiness(userId, mainNode, null);

    const branchOverall = branchReadiness.quality.overall;
    const mainOverall = mainReadiness.quality.overall;
    const delta = branchOverall - mainOverall;

    const recommendation =
      delta >= 6
        ? 'merge_branch'
        : delta <= -6
          ? 'keep_main'
          : 'manual_review';

    const reasons: string[] = [];
    if (delta >= 6) {
      reasons.push('分支综合质量显著高于主干，建议合并。');
    } else if (delta <= -6) {
      reasons.push('分支综合质量显著低于主干，建议保留主干并继续迭代分支。');
    } else {
      reasons.push('分支与主干质量接近，建议人工对比视觉结果后决定。');
    }

    if (branchReadiness.quality.continuity < mainReadiness.quality.continuity) {
      reasons.push('分支在连续性评分上低于主干，注意前后镜头衔接。');
    }

    if (branchReadiness.quality.renderStability < 60) {
      reasons.push('分支渲染稳定性偏低，建议先补全尾帧或优化提示词。');
    }

    return {
      userId,
      branchNodeId,
      mainNodeId: mainNode.id,
      ruleVersion: EVALUATION_RULES_VERSION,
      recommendation,
      reasons,
      compare: {
        branch: {
          nodeId: branchNode.id,
          quality: branchReadiness.quality,
          issues: branchReadiness.issues,
        },
        main: {
          nodeId: mainNode.id,
          quality: mainReadiness.quality,
          issues: mainReadiness.issues,
        },
        delta: {
          overall: delta,
          promptCompleteness:
            branchReadiness.quality.promptCompleteness -
            mainReadiness.quality.promptCompleteness,
          continuity:
            branchReadiness.quality.continuity -
            mainReadiness.quality.continuity,
          renderStability:
            branchReadiness.quality.renderStability -
            mainReadiness.quality.renderStability,
        },
      },
    };
  }

  private async evaluateNodeReadiness(userId: string, node: any, parentNode: any | null) {
    const hardReadiness = this.evaluateHardReadiness(node, parentNode);

    if (!this.agentMode.shouldUseAgents()) {
      return hardReadiness;
    }

    try {
      const agentResult = await this.qualityJudgeAgent.judgeNode(userId, node, parentNode);
      const mergedIssues = this.mergeIssues(hardReadiness.issues, agentResult.issues);
      const quality = {
        promptCompleteness: this.mergeScore(
          hardReadiness.quality.promptCompleteness,
          agentResult.promptCompleteness,
        ),
        continuity: this.mergeScore(hardReadiness.quality.continuity, agentResult.continuity),
        renderStability: this.mergeScore(
          hardReadiness.quality.renderStability,
          agentResult.renderStability,
        ),
        subjectConsistency: this.mergeScore(
          hardReadiness.quality.subjectConsistency,
          agentResult.subjectConsistency,
        ),
        overall: this.mergeScore(hardReadiness.quality.overall, agentResult.overall),
      };

      const hasHighRisk = mergedIssues.some((item) => item.severity === 'high');
      const hasMediumRisk = mergedIssues.some((item) => item.severity === 'medium');
      const level = hasHighRisk
        ? 'high_risk'
        : hasMediumRisk || quality.overall < 70
          ? 'suggest_improve'
          : 'ready';

      return {
        level,
        issues: mergedIssues,
        quality,
        summary: agentResult.summary || null,
      };
    } catch (error) {
      if (!this.agentMode.shouldFallbackAfterAgentError()) {
        throw error;
      }
      return hardReadiness;
    }
  }

  private evaluateHardReadiness(node: any, parentNode: any | null) {
    const issues: Array<{
      code: string;
      severity: 'low' | 'medium' | 'high';
      message: string;
      suggestion: string;
    }> = [];

    const prompt = String(node?.prompt || '').trim();
    const segment = String(node?.scriptSegment || '').trim();
    const baseText = `${prompt} ${segment}`.trim();

    if (!prompt) {
      issues.push({
        code: 'missing_prompt',
        severity: 'high',
        message: '缺少画面提示词，无法生成结构化视觉内容。',
        suggestion: '请补充具体的视觉主体（如：展示一段Python代码的IDE界面）。',
      });
    } else if (prompt.length < 15) {
      issues.push({
        code: 'prompt_too_short',
        severity: 'medium',
        message: '提示词过于简略，AI 可能会产生幻觉。',
        suggestion: '详细描述画面中的元素布局或信息呈现方式。',
      });
    }

    const hasLastFrame = Boolean(node?.lastFrameUrl);
    const hasFirstFrame = Boolean(node?.firstFrameUrl);
    const parentHasFrame = Boolean(parentNode?.lastFrameUrl || parentNode?.firstFrameUrl);

    if (!hasLastFrame) {
      issues.push({
        code: 'missing_last_frame_anchor',
        severity: 'low',
        message: '当前节点尚未生成目标锚点帧，系统会在渲染前自动补全。',
        suggestion: '若想手动控制质量，可先生成并锁定锚点帧。',
      });
    }

    if (parentNode && !parentHasFrame) {
      issues.push({
        code: 'continuity_parent_anchor_missing',
        severity: 'low',
        message: '上一节点尚未生成可承接帧，系统会在渲染前自动补全承接锚点。',
        suggestion: '若需要更精细控制，可提前锁定上一节点尾帧。',
      });
    }

    if (parentNode && hasFirstFrame && parentNode?.lastFrameUrl) {
      const overlap = this.similarity.keywordOverlap(
        String(parentNode.prompt || parentNode.scriptSegment || ''),
        baseText,
      );
      if (overlap.length === 0) {
        issues.push({
          code: 'style_drift_risk',
          severity: 'low',
          message: '当前节点与上一节点关键词关联较弱，可能出现风格漂移。',
          suggestion: '在当前提示词复用上一节点的主体/风格关键词。',
        });
      }
    }

    const promptCompleteness = this.scorePromptCompleteness(
      prompt,
      segment,
    );
    const continuity = this.scoreContinuity(parentNode, hasFirstFrame, hasLastFrame, issues);
    const renderStability = this.scoreRenderStability(hasLastFrame, prompt, issues.length);
    const subjectConsistency = this.scoreSubjectConsistency(parentNode, baseText);
    const weightedTotal =
      promptCompleteness * EVALUATION_WEIGHTS.promptCompleteness +
      continuity * EVALUATION_WEIGHTS.continuity +
      renderStability * EVALUATION_WEIGHTS.renderStability +
      subjectConsistency * EVALUATION_WEIGHTS.subjectConsistency;
    const weightSum =
      EVALUATION_WEIGHTS.promptCompleteness +
      EVALUATION_WEIGHTS.continuity +
      EVALUATION_WEIGHTS.renderStability +
      EVALUATION_WEIGHTS.subjectConsistency;
    const overall = Math.round(weightedTotal / weightSum);

    const hasHighRisk = issues.some((item) => item.severity === 'high');
    const hasMediumRisk = issues.some((item) => item.severity === 'medium');
    const level = hasHighRisk
      ? 'high_risk'
      : hasMediumRisk || overall < 70
        ? 'suggest_improve'
        : 'ready';

    return {
      level,
      issues,
      quality: {
        promptCompleteness,
        continuity,
        renderStability,
        subjectConsistency,
        overall,
      },
    };
  }

  private scorePromptCompleteness(prompt: string, segment: string) {
    let score = 30;
    if (prompt.length >= 12) score += 15;
    if (prompt.length >= 28) score += 10;
    if (segment.length >= 18) score += 15;
    if (prompt.includes('\n') || prompt.includes('【')) score += 15;
    if (segment && prompt && this.similarity.jaccard(segment, prompt) < 0.92) score += 15;
    return Math.max(0, Math.min(100, score));
  }

  private scoreContinuity(
    parentNode: any | null,
    hasFirstFrame: boolean,
    hasLastFrame: boolean,
    issues: Array<{ code: string }>,
  ) {
    if (!parentNode) {
      return hasLastFrame ? 88 : 68;
    }
    let score = 70;
    if (hasFirstFrame) score += 10;
    if (hasLastFrame) score += 10;
    if (issues.some((i) => i.code === 'continuity_parent_anchor_missing')) score -= 20;
    if (issues.some((i) => i.code === 'style_drift_risk')) score -= 8;
    return Math.max(0, Math.min(100, score));
  }

  private scoreRenderStability(hasLastFrame: boolean, prompt: string, issueCount: number) {
    let score = hasLastFrame ? 82 : 46;
    if (prompt.length >= 24) score += 10;
    if (prompt.length >= 40) score += 6;
    score -= Math.min(18, issueCount * 3);
    return Math.max(0, Math.min(100, score));
  }

  private scoreSubjectConsistency(parentNode: any | null, currentText: string) {
    if (!parentNode) return 80;
    const parentText = String(parentNode.prompt || parentNode.scriptSegment || '');
    const parentKeywords = this.similarity.tokenize(parentText);
    const currentKeywords = this.similarity.tokenize(currentText);
    if (!parentKeywords.length || !currentKeywords.length) return 55;
    const overlap = parentKeywords.filter((kw) => currentKeywords.includes(kw)).length;
    const ratio = overlap / Math.max(1, Math.min(parentKeywords.length, currentKeywords.length));
    return Math.max(35, Math.min(96, Math.round(40 + ratio * 56)));
  }

  private mergeScore(ruleScore: number, agentScore: number) {
    return Math.max(0, Math.min(100, Math.round(ruleScore * 0.35 + agentScore * 0.65)));
  }

  private mergeIssues(
    left: Array<{
      code: string;
      severity: 'low' | 'medium' | 'high';
      message: string;
      suggestion: string;
    }>,
    right: Array<{
      code: string;
      severity: 'low' | 'medium' | 'high';
      message: string;
      suggestion: string;
    }>,
  ) {
    const map = new Map<string, (typeof left)[number]>();
    for (const item of [...left, ...right]) {
      const key = `${item.code}:${item.message}`;
      if (!map.has(key)) {
        map.set(key, item);
      }
    }
    return Array.from(map.values());
  }
}
