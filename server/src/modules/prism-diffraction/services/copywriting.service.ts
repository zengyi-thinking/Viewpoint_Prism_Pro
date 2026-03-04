import { Injectable, Logger } from '@nestjs/common';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { PrismaService } from '../../../prisma/prisma.service';

export type CopywritingPlatform = 'xiaohongshu' | 'twitter_x' | 'newsletter' | 'linkedin' | 'instagram';

interface GenerateCopywritingDto {
  videoId: string;
  platform: CopywritingPlatform;
  selectedFrames: string[];
  styleHints?: string;
  previousDraftId?: string;
}

interface CopywritingResult {
  platformDraftId: string;
  generatedContent: string;
  suggestions?: string[];
}

@Injectable()
export class CopywritingService {
  private readonly logger = new Logger(CopywritingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  /**
   * 生成平台文案
   */
  async generateCopywriting(
    userId: string,
    dto: GenerateCopywritingDto,
  ): Promise<CopywritingResult> {
    const { videoId, platform, selectedFrames, styleHints } = dto;

    // 构建 Prompt
    const prompt = this.buildPrompt(platform, selectedFrames, styleHints);

    try {
      // 调用 AI Router LLM_CHAT 生成文案
      const result = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          type: 'copywriting_generation',
          platform,
          frameDescriptions: selectedFrames.map(f => ({ url: f, desc: '' })), // TODO: 获取描述
          styleHints,
          prompt,
        },
        userId,
      );

      // 保存到 PlatformDraft
      // 注意：需要先获取或创建 DiffractionTask
      let task = await this.prisma.diffractionTask.findFirst({
        where: { videoId, userId },
      });

      if (!task) {
        task = await this.prisma.diffractionTask.create({
          data: {
            videoId,
            userId,
            status: 'PROCESSING',
          },
        });
      }

      const draft = await this.prisma.platformDraft.create({
        data: {
          diffractionId: task.id,
          platform: platform.toUpperCase() as any,
          title: this.extractTitle(result.generatedContent, platform),
          content: result.generatedContent,
          hookLine: this.extractHookLine(result.generatedContent, platform),
          selectedImages: selectedFrames as any,
          tone: styleHints || 'neutral',
          isPublished: false,
        },
      });

      this.logger.log(`Generated copywriting for ${platform}: ${draft.id}`);

      return {
        platformDraftId: draft.id,
        generatedContent: result.generatedContent,
        suggestions: result.suggestions,
      };
    } catch (error) {
      this.logger.error(`Failed to generate copywriting: ${error.message}`);
      throw error;
    }
  }

  /**
   * 从生成内容中提取标题（用于 PlatformDraft.title 字段）
   */
  private extractTitle(content: string, platform: CopywritingPlatform): string | null {
    // 根据平台不同方式提取标题
    if (platform === 'newsletter') {
      const match = content.match(/["']title["']\s*:\s*["']([^"']+)["']/);
      return match ? match[1] : null;
    }
    return null;
  }

  /**
   * 从生成内容中提取钩子行（用于 Twitter/X）
   */
  private extractHookLine(content: string, platform: CopywritingPlatform): string | null {
    if (platform === 'twitter_x') {
      const match = content.match(/["']hook["']\s*:\s*["']([^"']+)["']/);
      return match ? match[1] : null;
    }
    return null;
  }

  /**
   * 根据平台风格构建 Prompt
   */
  private buildPrompt(
    platform: CopywritingPlatform,
    selectedFrames: string[],
    styleHints?: string,
  ): string {
    const frameCount = selectedFrames.length;

    let platformPrompt = '';

    switch (platform) {
      case 'xiaohongshu':
        platformPrompt = `你是一位专业的小红书/即刻文案专家。
请根据视频内容生成一篇具有"种草感"和"焦虑感"的小红书风格图文文案。

选择了 ${frameCount} 张关键帧。

风格提示：${styleHints || '自然、真实、生活化'}

要求：
1. 标题：需要吸睛、制造悬念、激发好奇心（如"这个产品真的好用..."）
2. 正文：分为 2-4 个段落，每段以 Emoji 开头或结尾，营造真实使用场景感
3. 干货：每段末尾添加实用要点或数据总结
4. 焦虑感：适当使用"姐妹们"、"大家"等称呼，制造共鸣
5. Emoji：每段至少使用 1-2 个相关 Emoji，如 ✨、📝、💡、🔥、😭

输出格式：JSON
{
  "title": "吸睛标题（带悬念）",
  "paragraphs": [
    {"emoji": "✨", "content": "文案段落 1"},
    {"emoji": "📝", "content": "文案段落 2"}
  ],
  "emojis": ["✨", "📝", "💡", "🔥"],
  "cta": "评论区见～"
}`;
        break;

      case 'twitter_x':
        platformPrompt = `你是一位专业的 Twitter/X Thread 撰写专家。
请根据视频内容生成一个 5-7 条连贯的 Thread 推文串。

风格提示：${styleHints || '简洁、有力、有悬念'}

要求：
1. 首条（Hook）：必须制造极强悬念，如"我刚发现一个真相..."、"这件事彻底改变了我对...的看法"
2. 中间 3-5 条：干货满满，剥丝抽茧讲清楚观点
3. 末条（总结）：收束讨论，引导互动（评论/转发/点赞）

输出格式：JSON
{
  "hook": "悬念首条",
  "tweets": [
    {"content": "推文 1"},
    {"content": "推文 2"},
    {"content": "推文 3"},
    {"content": "推文 4"},
    {"content": "推文 5"}
  ],
  "closing": "互动引导"
}`;
        break;

      case 'newsletter':
        platformPrompt = `你是一位专业的Newsletter/公众号文章撰写专家。
请根据视频内容生成一篇 1500 字左右的深度阅读文章。

风格提示：${styleHints || '深度、结构化、排版优美'}

要求：
1. 结构：采用金字塔结构 - 引言（吸引）→ 3-5 个论点（由浅入深）→ 结论（回顾总结）
2. 排版：去除口语化表达，逻辑清晰，用词精准
3. 字数：控制在 1200-1800 字之间

输出格式：JSON
{
  "title": "深度文章标题",
  "introduction": "引言部分",
  "body": [
    {"heading": "论点 1", "content": "论点 1 内容"},
    {"heading": "论点 2", "content": "论点 2 内容"},
    {"heading": "论点 3", "content": "论点 3 内容"}
  ],
  "conclusion": "结论部分"
}`;
        break;

      case 'linkedin':
        platformPrompt = `你是一位专业的 LinkedIn 内容创作专家。
请根据视频内容生成一篇专业的职场/行业洞察文案。

风格提示：${styleHints || '专业、有洞见、数据驱动'}

要求：
1. 开头：以数据或洞察切入，"根据最新研究..."
2. 正文：2-3 个要点，每个要点有具体数据或案例支撑
3. 结构：清晰分段，使用专业术语
4. 结尾：开放式问题引导讨论

输出格式：JSON
{
  "title": "专业标题",
  "insights": [
    {"heading": "洞察 1", "content": "洞察 1 内容"},
    {"heading": "洞察 2", "content": "洞察 2 内容"}
  ]
}`;
        break;

      case 'instagram':
        platformPrompt = `你是一位专业的 Instagram 图文内容创作专家。
请根据视频内容生成一篇精美的 Instagram 风格图文文案。

风格提示：${styleHints || '精美、生活化、有美学感'}

要求：
1. 风格：精美、有美学感，适合 Instagram 视觉风格
2. 标题：吸睛、简洁，15-20 字
3. 正文：100-150 字，突出产品亮点或观点
4. Hashtag：添加 5-8 个相关 Hashtag

输出格式：JSON
{
  "title": "吸睛标题",
  "caption": "正文内容",
  "hashtags": ["#tag1", "#tag2"]
}`;
        break;

      default:
        return '请选择有效的平台';
    }

    return platformPrompt;
  }
}
