import { Injectable } from '@nestjs/common';
import { CreationLlmService } from './creation-llm.service';

export interface IdeaPreviewInput {
  idea: string;
  conflict?: string;
  setting?: string;
  visualGoal?: string;
  constraints?: string;
  count: number;
}

export interface IdeaPreviewOption {
  id: string;
  title: string;
  openingScene: string;
  conflict: string;
  progression: string;
  whyItWorks: string;
  firstNodeScript: string;
}

@Injectable()
export class IdeaPlannerAgent {
  constructor(private readonly llm: CreationLlmService) {}

  async generate(userId: string, input: IdeaPreviewInput): Promise<{ previews: IdeaPreviewOption[] }> {
    const system = [
      '你是视频创作总策划。你的任务是把用户的模糊 idea 发展成 3 个互相明显不同的故事方向。',
      '严禁复读用户原文。严禁输出“方向1/方案A/世界观建立型/人物钩子型”这类模板标签。',
      '每个方向必须是具体镜头，不要解释你将如何创作。直接给结果。',
      '标题必须像真实分镜代号，8 个汉字以内。',
      'openingScene 要有强画面感，80 字以内。',
      'conflict 要明确冲突，60 字以内。',
      'progression 要说明后续两到三步推进，90 字以内。',
      'firstNodeScript 是首节点实际文案，适合直接创建节点。',
      '输出 JSON：{"previews":[{"id":"p1","title":"","openingScene":"","conflict":"","progression":"","whyItWorks":"","firstNodeScript":""}]}.',
    ].join('\n');

    const user = [
      `核心想法：${input.idea}`,
      input.conflict ? `核心冲突：${input.conflict}` : '',
      input.setting ? `场景设定：${input.setting}` : '',
      input.visualGoal ? `画面要求：${input.visualGoal}` : '',
      input.constraints ? `限制条件：${input.constraints}` : '',
      `请生成 ${input.count} 个差异明显的方向。差异要体现在切入角度、开场镜头、冲突推进上。`,
    ].filter(Boolean).join('\n');

    const result = await this.llm.generateJson<{ previews: IdeaPreviewOption[] }>(userId, system, user);
    const previews = Array.isArray(result?.previews) ? result.previews : [];
    if (previews.length === 0) {
      throw new Error('IdeaPlannerAgent 未返回有效故事方向');
    }
    return {
      previews: previews.map((item, index) => ({
        id: item.id || `preview-${index + 1}`,
        title: String(item.title || '').trim(),
        openingScene: String(item.openingScene || '').trim(),
        conflict: String(item.conflict || '').trim(),
        progression: String(item.progression || '').trim(),
        whyItWorks: String(item.whyItWorks || '').trim(),
        firstNodeScript: String(item.firstNodeScript || item.openingScene || '').trim(),
      })),
    };
  }
}
