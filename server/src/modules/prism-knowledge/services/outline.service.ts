import { Injectable } from '@nestjs/common';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class OutlineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  async buildOutline(
    params: {
      userId: string;
      videoId: string;
      videoTitle: string;
      transcriptSegments: Array<{
        start: number;
        end: number;
        text: string;
      }>;
      keyframes: Array<{
        timestamp: number;
        storagePath: string;
        description?: string | null;
      }>;
    },
  ) {
    const {
      userId,
      videoId,
      videoTitle,
      transcriptSegments,
      keyframes,
    } = params;
    const markdown = await this.generateOutlineStrict(
      userId,
      videoTitle,
      transcriptSegments,
      keyframes,
    );

    const existing = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      return this.prisma.knowledgeAsset.update({
        where: { id: existing.id },
        data: {
          outlineMarkdown: markdown,
          status: 'COMPLETED',
        },
      });
    }

    return this.prisma.knowledgeAsset.create({
      data: {
        videoId,
        outlineMarkdown: markdown,
        notesMarkdown: '',
        status: 'COMPLETED',
      },
    });
  }

  private async generateOutlineStrict(
    userId: string,
    title: string,
    transcriptSegments: Array<{ start: number; end: number; text: string }>,
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string | null }>,
  ) {
    const compactSegments = transcriptSegments.slice(0, 40).map((s) => ({
      start: s.start,
      end: s.end,
      text: this.truncate(s.text, 180),
    }));
    const compactFrames = keyframes.slice(0, 16).map((k) => ({
      timestamp: k.timestamp,
      description: k.description ?? '',
    }));

    const llm = await this.aiRouter.execute(
      AITaskType.LLM_CHAT,
      {
        messages: [
          {
            role: 'system',
            content:
              [
                '你是一个“会思考和自整理”的课程知识工程师。',
                '你的任务是把视频内容整理成层次清晰、可复习、可检索的学习大纲（Markdown）。',
                '硬性要求：',
                '1) 输出必须是中文 Markdown。',
                '2) 必须包含 H1/H2/H3 层级，且逻辑由“主线 -> 子主题 -> 细节证据”展开。',
                '3) 对每个 H2 主题，至少给出：主题目标、关键概念、步骤/方法、易错点、时间锚点。',
                '4) 时间锚点必须尽量使用 mm:ss 或 hh:mm:ss。',
                '5) 结尾必须包含“复盘清单”和“提问建议”。',
                '6) 禁止空泛描述，禁止只罗列标题。',
              ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                title,
                transcriptSegments: compactSegments,
                keyframes: compactFrames,
              },
              null,
              2,
            ),
          },
        ],
        temperature: 0.35,
        maxTokens: 3600,
      },
      userId,
    );

    const text = this.extractLlmText(llm);
    if (!text) {
      const provider = String(llm?.provider ?? 'unknown');
      const model = String(llm?.model ?? 'unknown');
      throw new Error(`大纲模型未返回内容(provider=${provider}, model=${model})`);
    }
    return this.sanitizeOutlineMarkdown(text, title);
  }

  private extractLlmText(llm: any) {
    const candidates: unknown[] = [
      llm?.text,
      llm?.content,
      llm?.description,
      llm?.message?.content,
      llm?.result?.text,
      llm?.result?.content,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const text = candidate.trim();
        if (text) return text;
      }
      if (Array.isArray(candidate)) {
        const joined = candidate
          .map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object' && typeof (part as any).text === 'string') {
              return (part as any).text;
            }
            return '';
          })
          .join('\n')
          .trim();
        if (joined) return joined;
      }
    }

    return '';
  }

  private truncate(text: string, maxLength: number) {
    const clean = String(text || '').trim().replace(/\s+/g, ' ');
    if (!clean) return '';
    return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
  }

  private sanitizeOutlineMarkdown(markdown: string, title: string) {
    const clean = markdown
      .replace(/```markdown/gi, '')
      .replace(/```/g, '')
      .trim();

    if (!clean) {
      return `# ${title} - 知识大纲\n\n## 核心主题\n- 暂无可用内容`;
    }

    if (!clean.startsWith('# ')) {
      return `# ${title} - 知识大纲\n\n${clean}`;
    }

    return clean;
  }
}
