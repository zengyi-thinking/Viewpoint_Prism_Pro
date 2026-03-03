import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export enum ChatPrismType {
  KNOWLEDGE = 'knowledge',
  CREATION = 'creation',
  TRANSLATION = 'translation',
  DIFFRACTION = 'diffraction',
}

export enum PrismActionType {
  NONE = 'none',
  INJECT_QA_CARD = 'inject_qa_card',
  UPDATE_NODE_PROMPT = 'update_node_prompt',
  REFINE_TRANSLATION_SEGMENT = 'refine_translation_segment',
  REGENERATE_PLATFORM_DRAFT = 'regenerate_platform_draft',
  GENERATE_SUMMARY = 'generate_summary',
  GENERATE_MINDMAP = 'generate_mindmap',
}

export class CreateChatSessionDto {
  @IsString()
  projectId: string;

  @IsOptional()
  @IsString()
  videoId?: string;

  @IsOptional()
  @IsEnum(ChatPrismType)
  activePrism?: ChatPrismType;
}

export class SendChatMessageDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  videoId?: string;

  @IsOptional()
  @IsEnum(ChatPrismType)
  activePrism?: ChatPrismType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class GetChatMessagesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  before?: string;
}

export class GetQuickPromptsQueryDto {
  @IsOptional()
  @IsEnum(ChatPrismType)
  prism?: ChatPrismType;
}

export interface QuickPrompt {
  id: string;
  type: string;
  label: string;
  icon: string;
  promptTemplate: string;
}

export const KNOWLEDGE_QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'mindmap',
    type: 'mindmap',
    label: '生成思维导图',
    icon: '🧠',
    promptTemplate:
      '/mindmap 生成当前视频的结构化思维导图，包括主要概念和关系。',
  },
  {
    id: 'summary',
    type: 'summary',
    label: '智能总结',
    icon: '📝',
    promptTemplate:
      '/summarize 总结视频核心观点和结论，按重要程度排序。',
  },
  {
    id: 'crystal_card',
    type: 'crystal_card',
    label: '生成晶体卡片',
    icon: '💎',
    promptTemplate:
      '/summarize 生成可学习的晶体卡片，并给出章节化学习路径。',
  },
  {
    id: 'explain',
    type: 'explain',
    label: '通俗解释',
    icon: '💡',
    promptTemplate:
      '用最简单的语言解释当前概念，适合初学者理解，使用生活化的比喻。',
  },
];

export const CREATION_QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'creation_split_script',
    type: 'creation_script_split',
    label: '拆分产品脚本',
    icon: '✂️',
    promptTemplate:
      '请把这段产品脚本按镜头拆分，并给出每段可执行的画面提示词。',
  },
  {
    id: 'creation_refine_prompt',
    type: 'creation_prompt_refine',
    label: '优化生成提示词',
    icon: '🎬',
    promptTemplate:
      '请把当前产品创意改写成更适合视频生成的提示词，强调镜头、动作、风格。',
  },
  {
    id: 'creation_storyboard',
    type: 'creation_storyboard',
    label: '生成分镜结构',
    icon: '🧩',
    promptTemplate:
      '请输出一个 5 段式产品短视频分镜结构，每段包含目标、画面、台词和节奏。',
  },
];

export const TRANSLATION_QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'translation_tone_refine',
    type: 'translation_refine',
    label: '润色字幕语气',
    icon: '🌐',
    promptTemplate:
      '请润色当前字幕，使语气更自然并保持术语一致。',
  },
  {
    id: 'translation_glossary',
    type: 'translation_glossary',
    label: '术语一致性检查',
    icon: '📘',
    promptTemplate:
      '请提取当前字幕的核心术语并给出统一翻译建议。',
  },
];

export const DIFFRACTION_QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'diffraction_xhs',
    type: 'diffraction_rewrite',
    label: '生成小红书文案',
    icon: '📱',
    promptTemplate:
      '请把当前内容改写成小红书风格文案，包含标题、正文和标签建议。',
  },
  {
    id: 'diffraction_twitter',
    type: 'diffraction_thread',
    label: '生成 X Thread',
    icon: '🧵',
    promptTemplate:
      '请把当前内容改写成 6 条 Thread，第一条是强 Hook。',
  },
];

export const QUICK_PROMPTS_BY_PRISM: Record<ChatPrismType, QuickPrompt[]> = {
  [ChatPrismType.KNOWLEDGE]: KNOWLEDGE_QUICK_PROMPTS,
  [ChatPrismType.CREATION]: CREATION_QUICK_PROMPTS,
  [ChatPrismType.TRANSLATION]: TRANSLATION_QUICK_PROMPTS,
  [ChatPrismType.DIFFRACTION]: DIFFRACTION_QUICK_PROMPTS,
};

// Backward-compatible default
export const QUICK_PROMPTS: QuickPrompt[] = KNOWLEDGE_QUICK_PROMPTS;
