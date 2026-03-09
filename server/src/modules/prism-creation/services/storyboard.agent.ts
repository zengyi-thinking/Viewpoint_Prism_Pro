import { Injectable } from '@nestjs/common';
import { CreationLlmService } from './creation-llm.service';
import { ScriptPlanChapter } from './script-planner.agent';

export interface StoryboardCandidate {
  id: string;
  title: string;
  scriptSegment: string;
  visualDescription: string;
}

@Injectable()
export class StoryboardAgent {
  constructor(private readonly llm: CreationLlmService) {}

  async createChapterNodes(
    userId: string,
    chapter: ScriptPlanChapter,
    context: { projectIntent?: string; constraints?: string },
  ): Promise<StoryboardCandidate[]> {
    const system = [
      '你是分镜拆解 Agent。你的任务是把一个章节拆成可执行的分镜节点。',
      '每个节点都要像真实镜头，不要解释，不要套模板。',
      'title 要短。scriptSegment 要是节点文案。visualDescription 要直观描述镜头画面。',
      '输出 JSON：{"nodes":[{"id":"n1","title":"","scriptSegment":"","visualDescription":""}]}.',
    ].join('\n');

    const user = [
      `项目意图：${context.projectIntent || '未提供'}`,
      context.constraints ? `限制：${context.constraints}` : '',
      `章节标题：${chapter.title}`,
      `章节摘要：${chapter.summary}`,
      `章节目标：${chapter.goal}`,
      `请拆成 ${chapter.storyboardCount} 个节点。`,
    ].filter(Boolean).join('\n');

    const result = await this.llm.generateJson<{ nodes: StoryboardCandidate[] }>(userId, system, user);
    const nodes = Array.isArray(result?.nodes) ? result.nodes : [];
    if (nodes.length === 0) throw new Error('StoryboardAgent 未返回章节节点');
    return nodes.map((node, index) => ({
      id: node.id || `chapter-node-${index + 1}`,
      title: String(node.title || '').trim(),
      scriptSegment: String(node.scriptSegment || '').trim(),
      visualDescription: String(node.visualDescription || '').trim(),
    }));
  }

  async generateNextCandidates(
    userId: string,
    context: {
      projectIntent?: string;
      selectedNodeTitle?: string;
      selectedNodeScript?: string;
      nextIntent?: string;
      count: number;
    },
  ): Promise<StoryboardCandidate[]> {
    const system = [
      '你是剧情推进 Agent。你要基于当前节点，生成接下来的候选镜头。',
      '不要复读当前节点，不要解释创作思路。直接给不同的下一镜方案。',
      '输出 JSON：{"candidates":[{"id":"c1","title":"","scriptSegment":"","visualDescription":""}]}.',
    ].join('\n');

    const user = [
      `项目意图：${context.projectIntent || '未提供'}`,
      `当前节点标题：${context.selectedNodeTitle || '未命名节点'}`,
      `当前节点内容：${context.selectedNodeScript || ''}`,
      context.nextIntent ? `用户希望下一镜朝这个方向推进：${context.nextIntent}` : '',
      `请生成 ${context.count} 个候选下一镜，彼此必须明显不同。`,
    ].filter(Boolean).join('\n');

    const result = await this.llm.generateJson<{ candidates: StoryboardCandidate[] }>(userId, system, user);
    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    if (candidates.length === 0) throw new Error('StoryboardAgent 未返回下一节点候选');
    return candidates.map((item, index) => ({
      id: item.id || `candidate-${index + 1}`,
      title: String(item.title || '').trim(),
      scriptSegment: String(item.scriptSegment || '').trim(),
      visualDescription: String(item.visualDescription || '').trim(),
    }));
  }
}
