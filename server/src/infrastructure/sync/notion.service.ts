import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface NotionFlashcard {
  front: string;
  back: string;
  chapter?: string | null;
  difficulty?: number | null;
  nextReview?: string | null;
}

interface NotionKeyframe {
  timestamp: number;
  url: string;
  description?: string | null;
}

export interface NotionKnowledgeSyncInput {
  title: string;
  outlineMarkdown: string;
  notesMarkdown: string;
  reviewPlanMarkdown: string;
  flashcards: NotionFlashcard[];
  keyframes: NotionKeyframe[];
  notionToken?: string | null;
  notionParentPageId?: string | null;
}

export interface NotionKnowledgeSyncResult {
  success: boolean;
  mode: 'api' | 'dry-run';
  pageId?: string;
  pageUrl?: string;
  blockCount: number;
  reason?: string;
}

@Injectable()
export class NotionService {
  private readonly logger = new Logger(NotionService.name);

  constructor(private readonly config: ConfigService) {}

  async syncKnowledgePackage(
    input: NotionKnowledgeSyncInput,
  ): Promise<NotionKnowledgeSyncResult> {
    const notionToken =
      input.notionToken?.trim() ||
      this.config.get<string>('NOTION_INTEGRATION_TOKEN') ||
      '';
    const parentPageId =
      input.notionParentPageId?.trim() ||
      this.config.get<string>('NOTION_PARENT_PAGE_ID') ||
      '';

    const sections = this.composeTemplateSections(input);
    const blocks = this.toNotionBlocks(sections);

    if (!notionToken) {
      return {
        success: true,
        mode: 'dry-run',
        blockCount: blocks.length,
        reason: 'NOTION token not configured, generated template payload only.',
      };
    }

    const notionHeaders: Record<string, string> = {
      Authorization: `Bearer ${notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    const parent = parentPageId
      ? { type: 'page_id', page_id: parentPageId }
      : { type: 'workspace', workspace: true };

    const title = this.truncate(input.title, 120);
    const createPayload: Record<string, unknown> = {
      parent,
      properties: {
        title: {
          title: [
            {
              type: 'text',
              text: { content: title },
            },
          ],
        },
      },
    };

    const initialChildren = blocks.slice(0, 80);
    if (initialChildren.length > 0) {
      createPayload.children = initialChildren;
    }

    const createRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify(createPayload),
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      this.logger.error(`Notion create page failed: ${JSON.stringify(createData)}`);
      throw new Error(`Notion create page failed: ${createData?.message || createRes.statusText}`);
    }

    const pageId = String(createData?.id || '');
    const pageUrl = String(createData?.url || '');

    // Append remaining blocks in chunks.
    let index = 80;
    while (index < blocks.length) {
      const chunk = blocks.slice(index, index + 80);
      const appendRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers: notionHeaders,
        body: JSON.stringify({ children: chunk }),
      });
      const appendData = await appendRes.json();
      if (!appendRes.ok) {
        this.logger.error(`Notion append blocks failed: ${JSON.stringify(appendData)}`);
        throw new Error(`Notion append failed: ${appendData?.message || appendRes.statusText}`);
      }
      index += chunk.length;
    }

    return {
      success: true,
      mode: 'api',
      pageId,
      pageUrl,
      blockCount: blocks.length,
    };
  }

  private composeTemplateSections(input: NotionKnowledgeSyncInput) {
    const keyframeLines = input.keyframes.slice(0, 24).map((kf) => {
      const ts = this.formatTimestamp(kf.timestamp);
      const desc = kf.description?.trim() || '关键帧';
      return `- [${ts}] ${desc}\n  图片: ${kf.url}`;
    });

    const flashcardLines = input.flashcards.slice(0, 30).map((card, idx) => {
      const difficulty = Number(card.difficulty ?? 1);
      const review = card.nextReview ? ` | 下次复习: ${card.nextReview}` : '';
      return `${idx + 1}. Q: ${card.front}\nA: ${card.back}\n章节: ${card.chapter || '未分章'} | 难度: ${difficulty}${review}`;
    });

    return [
      `# ${input.title}`,
      '',
      '## 1. 结构化大纲',
      '',
      input.outlineMarkdown || '（暂无大纲）',
      '',
      '## 2. 融合学习笔记（视频 + 对话 + 画像）',
      '',
      input.notesMarkdown || '（暂无笔记）',
      '',
      '## 3. 关键帧时间轴',
      '',
      keyframeLines.length > 0 ? keyframeLines.join('\n') : '（暂无关键帧）',
      '',
      '## 4. 记忆闪卡',
      '',
      flashcardLines.length > 0 ? flashcardLines.join('\n\n') : '（暂无闪卡）',
      '',
      '## 5. 复习计划',
      '',
      input.reviewPlanMarkdown || '（暂无复习计划）',
    ]
      .join('\n')
      .trim();
  }

  private toNotionBlocks(markdown: string) {
    const lines = markdown.split('\n');
    const blocks: Array<Record<string, unknown>> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        blocks.push(this.paragraphBlock(''));
        continue;
      }

      if (/^###\s+/.test(trimmed)) {
        blocks.push(this.headingBlock(3, trimmed.replace(/^###\s+/, '')));
        continue;
      }

      if (/^##\s+/.test(trimmed)) {
        blocks.push(this.headingBlock(2, trimmed.replace(/^##\s+/, '')));
        continue;
      }

      if (/^#\s+/.test(trimmed)) {
        blocks.push(this.headingBlock(1, trimmed.replace(/^#\s+/, '')));
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        blocks.push(this.bulletBlock(trimmed.replace(/^[-*]\s+/, '')));
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        blocks.push(this.numberedBlock(trimmed.replace(/^\d+\.\s+/, '')));
        continue;
      }

      if (/^图片:\s+https?:\/\//.test(trimmed)) {
        const imageUrl = trimmed.replace(/^图片:\s+/, '').trim();
        blocks.push({
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: {
              url: imageUrl,
            },
          },
        });
        continue;
      }

      blocks.push(this.paragraphBlock(trimmed));
    }

    return blocks.slice(0, 1000);
  }

  private headingBlock(level: 1 | 2 | 3, content: string) {
    const type = `heading_${level}`;
    return {
      object: 'block',
      type,
      [type]: {
        rich_text: [this.richText(content)],
      },
    };
  }

  private paragraphBlock(content: string) {
    return {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: content ? [this.richText(content)] : [],
      },
    };
  }

  private bulletBlock(content: string) {
    return {
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [this.richText(content)],
      },
    };
  }

  private numberedBlock(content: string) {
    return {
      object: 'block',
      type: 'numbered_list_item',
      numbered_list_item: {
        rich_text: [this.richText(content)],
      },
    };
  }

  private richText(content: string) {
    return {
      type: 'text',
      text: {
        content: this.truncate(content, 1900),
      },
    };
  }

  private truncate(content: string, maxLength: number) {
    const clean = String(content || '');
    return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
  }

  private formatTimestamp(seconds: number) {
    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
