import { Injectable, Logger } from '@nestjs/common';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class OutlineService {
  private readonly logger = new Logger(OutlineService.name);

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
    const markdown = await this.generateOutlineWithFallback(
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

  private async generateOutlineWithFallback(
    userId: string,
    title: string,
    transcriptSegments: Array<{ start: number; end: number; text: string }>,
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string | null }>,
  ) {
    try {
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

      const text = String(llm?.text ?? '').trim();
      if (text) {
        return this.sanitizeOutlineMarkdown(text, title);
      }
    } catch {
      // fallback below
      this.logger.warn(`Outline LLM generation fallback for "${title}"`);
    }

    return this.composeOutlineMarkdown(title, transcriptSegments, keyframes);
  }

  private composeOutlineMarkdown(
    title: string,
    transcriptSegments: Array<{ start: number; end: number; text: string }>,
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string | null }>,
  ) {
    const lines: string[] = [];
    lines.push(`# ${title} - 知识大纲`);
    lines.push('');
    lines.push('## 一、核心结构');
    lines.push('');

    transcriptSegments.forEach((seg, idx) => {
      lines.push(`### ${idx + 1}. 时间段 ${this.formatTs(seg.start)} - ${this.formatTs(seg.end)}`);
      lines.push(`- 要点：${seg.text}`);

      const nearestFrame = this.findNearestKeyframe(seg.start, keyframes);
      if (nearestFrame) {
        lines.push(`- 关键帧：![keyframe-${idx + 1}](${nearestFrame.storagePath})`);
        lines.push(`- 说明：${nearestFrame.description ?? '自动提取关键画面'}`);
      }
      lines.push('');
    });

    lines.push('## 二、学习建议');
    lines.push('');
    lines.push('- 先浏览一级标题，建立整体框架。');
    lines.push('- 再按时间段回看关键帧对应片段，强化记忆。');
    lines.push('- 对不理解部分通过对话窗口提问，系统会回填 Q&A 卡片。');
    lines.push('');
    lines.push('## 三、复盘清单');
    lines.push('');
    lines.push('- 我是否能用 3 句话讲清视频主线？');
    lines.push('- 我是否能指出 2 个关键方法及适用场景？');
    lines.push('- 我是否定位了最容易出错的片段并回看？');

    return lines.join('\n');
  }

  private findNearestKeyframe(
    start: number,
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string | null }>,
  ) {
    if (!keyframes.length) return null;
    return keyframes
      .slice()
      .sort(
        (a, b) =>
          Math.abs(a.timestamp - start) - Math.abs(b.timestamp - start),
      )[0];
  }

  private formatTs(seconds: number) {
    const safe = Math.max(0, Math.floor(seconds));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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
