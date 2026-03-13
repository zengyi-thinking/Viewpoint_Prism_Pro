import { Injectable } from '@nestjs/common';
import { CreationLlmService } from './creation-llm.service';

export interface CreationConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface CreationConversationSummary {
  storyIntent: string;
  visualStyle: string;
  splitPreference: string;
}

export interface CreationConversationState {
  messages: CreationConversationMessage[];
  summary: CreationConversationSummary;
  scriptDraft: string;
  chaptersHint: number;
  lastUpdatedAt: string | null;
}

@Injectable()
export class StoryConversationAgent {
  constructor(private readonly llm: CreationLlmService) {}

  async summarize(
    userId: string,
    messages: Array<Pick<CreationConversationMessage, 'role' | 'content'>>,
  ): Promise<{
    summary: CreationConversationSummary;
    scriptDraft: string;
    chaptersHint: number;
    assistantReply: string;
  }> {
    const system = [
      '你是创作棱镜中的导演对话 Agent。',
      '你的任务是从持续对话中归纳视频创作需求，产出结构化摘要和一版可继续加工的故事剧本。',
      '重点提炼：故事意图、视觉风格、拆分偏好。',
      'scriptDraft 必须是中文完整故事稿，允许分段，但不要写成提示词，不要解释方法。',
      'assistantReply 是给用户看的简短回应，60 字以内，告诉用户当前已经确认了什么，下一步可补什么。',
      'chaptersHint 必须是 1 到 8 的整数。',
      '输出 JSON：{"summary":{"storyIntent":"","visualStyle":"","splitPreference":""},"scriptDraft":"","chaptersHint":4,"assistantReply":""}',
    ].join('\n');

    const transcript = messages
      .map((message) => `${message.role === 'user' ? '用户' : '系统回复'}：${message.content}`)
      .join('\n');

    const result = await this.llm.generateJson<{
      summary?: Partial<CreationConversationSummary>;
      scriptDraft?: string;
      chaptersHint?: number;
      assistantReply?: string;
    }>(userId, system, `请根据以下导演对话归纳：\n${transcript}`, 3200);

    return {
      summary: {
        storyIntent: String(result?.summary?.storyIntent || '').trim(),
        visualStyle: String(result?.summary?.visualStyle || '').trim(),
        splitPreference: String(result?.summary?.splitPreference || '').trim(),
      },
      scriptDraft: String(result?.scriptDraft || '').trim(),
      chaptersHint: Math.max(1, Math.min(8, Number(result?.chaptersHint || 4))),
      assistantReply:
        String(result?.assistantReply || '').trim() ||
        '已归纳当前创作意图，你可以继续补充角色、风格、章节和镜头节奏。',
    };
  }
}
