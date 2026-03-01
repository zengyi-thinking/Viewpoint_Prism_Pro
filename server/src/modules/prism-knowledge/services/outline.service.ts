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
      const compactSegments = transcriptSegments.slice(0, 20).map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      }));
      const compactFrames = keyframes.slice(0, 8).map((k) => ({
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
                '你是知识整理助手。请输出结构化 Markdown，必须包含 H1/H2/H3，并将关键帧描述融合到对应章节。',
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
          temperature: 0.3,
          maxTokens: 2500,
        },
        userId,
      );

      const text = String(llm?.text ?? '').trim();
      if (text) return text;
    } catch {
      // fallback below
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
}
