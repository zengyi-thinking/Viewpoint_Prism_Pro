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
      '你的任务是像一个聪明的导演助手一样和用户继续聊，从持续对话中归纳视频创作需求，产出结构化摘要和一版可继续加工的故事剧本。',
      '重点提炼：故事意图、视觉风格、拆分偏好。',
      'scriptDraft 必须是中文完整故事稿，允许分段，但不要写成提示词，不要解释方法。',
      'assistantReply 必须体现导演视角：先判断这个想法哪里成立、哪里有戏，再给出一个合理设想或增强建议，最后再顺势追问一个关键问题。',
      'assistantReply 必须自然、具体、像真人对话，不要套话，不要复读“已确认”“正在细化”“下一步请提供”。',
      'assistantReply 可以适度提出导演判断，例如人物关系建议、冲突升级方式、视觉处理建议、悬念布置方式。',
      'assistantReply 要优先回应用户刚刚新增的内容，然后给出 1 个最关键的追问，帮助故事继续往前推进。',
      'assistantReply 长度控制在 40 到 120 个中文字符之间。',
      '如果用户信息还很少，就主动帮他收束选择，例如询问主角身份、敌人类型、发生地点、时代背景、结局气质。',
      '如果用户已经给了多个方向，就帮助整合，而不是重复总结。',
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
        '这个方向已经有感觉了。接下来先定主角和他要面对的核心危机，我再帮你把故事立住。',
    };
  }
}
