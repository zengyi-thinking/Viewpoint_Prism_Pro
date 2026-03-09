import { Injectable } from '@nestjs/common';
import { CreationLlmService } from './creation-llm.service';

export interface ScriptPlanChapter {
  index: number;
  title: string;
  summary: string;
  goal: string;
  storyboardCount: number;
}

export interface ScriptPlanResult {
  summary: string;
  chapters: ScriptPlanChapter[];
}

@Injectable()
export class ScriptPlannerAgent {
  constructor(private readonly llm: CreationLlmService) {}

  async generate(userId: string, scriptText: string, chaptersHint = 4): Promise<ScriptPlanResult> {
    const system = [
      '你是剧本拆解 Agent。你的任务是把长文本拆成适合视频制作的章节结构。',
      '不要输出写作理论，不要解释方法。直接输出章节规划。',
      '每章必须包含 title、summary、goal、storyboardCount。',
      'title 不能是“第一章/第二章”这种空名，必须是有辨识度的章节标题。',
      'storyboardCount 取 2 到 6 之间的整数。',
      '输出 JSON：{"summary":"","chapters":[{"index":1,"title":"","summary":"","goal":"","storyboardCount":3}]}.',
    ].join('\n');

    const user = [
      `原始文本：\n${scriptText}`,
      `请尽量拆成 ${chaptersHint} 章左右。`,
      '如果原文本身章节不明显，也要根据剧情推进主动切章。',
    ].join('\n');

    const result = await this.llm.generateJson<ScriptPlanResult>(userId, system, user, 2600);
    const chapters = Array.isArray(result?.chapters) ? result.chapters : [];
    if (chapters.length === 0) {
      throw new Error('ScriptPlannerAgent 未返回有效章节');
    }

    return {
      summary: String(result.summary || '').trim(),
      chapters: chapters.map((chapter, index) => ({
        index: Number(chapter.index ?? index + 1),
        title: String(chapter.title || '').trim(),
        summary: String(chapter.summary || '').trim(),
        goal: String(chapter.goal || '').trim(),
        storyboardCount: Math.max(2, Math.min(6, Number(chapter.storyboardCount || 3))),
      })),
    };
  }
}
