import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface FeishuFlashcard {
  title?: string | null;
  front: string;
  back: string;
  chapter?: string | null;
  difficulty?: number | null;
  nextReview?: string | null;
}

interface FeishuKeyframe {
  timestamp: number;
  url: string;
  description?: string | null;
}

export interface FeishuKnowledgeSyncInput {
  title: string;
  outlineMarkdown: string;
  notesMarkdown: string;
  reviewPlanMarkdown: string;
  flashcards: FeishuFlashcard[];
  keyframes: FeishuKeyframe[];
  feishuAppId?: string | null;
  feishuAppSecret?: string | null;
  feishuFolderToken?: string | null;
}

export interface FeishuKnowledgeSyncResult {
  success: boolean;
  mode: 'api' | 'dry-run';
  documentId?: string;
  documentUrl?: string;
  blockCount: number;
  reason?: string;
}

@Injectable()
export class FeishuService {
  private readonly logger = new Logger(FeishuService.name);

  constructor(private readonly config: ConfigService) {}

  async syncKnowledgePackage(
    input: FeishuKnowledgeSyncInput,
  ): Promise<FeishuKnowledgeSyncResult> {
    const appId =
      input.feishuAppId?.trim() || this.config.get<string>('FEISHU_APP_ID') || '';
    const appSecret =
      input.feishuAppSecret?.trim() ||
      this.config.get<string>('FEISHU_APP_SECRET') ||
      '';
    const folderToken =
      input.feishuFolderToken?.trim() ||
      this.config.get<string>('FEISHU_FOLDER_TOKEN') ||
      '';

    const markdown = this.composeTemplateMarkdown(input);
    const blockCount = markdown.split('\n').filter((line) => line.trim().length > 0).length;

    if (!appId || !appSecret) {
      return {
        success: true,
        mode: 'dry-run',
        blockCount,
        reason: 'FEISHU AppId/AppSecret not configured, generated template payload only.',
      };
    }

    const tenantToken = await this.getTenantAccessToken(appId, appSecret);
    const document = await this.createDocx(tenantToken, input.title, folderToken || undefined);
    await this.updateDocxRawContent(tenantToken, document.documentId, markdown);

    return {
      success: true,
      mode: 'api',
      documentId: document.documentId,
      documentUrl: document.documentUrl,
      blockCount,
    };
  }

  private async getTenantAccessToken(appId: string, appSecret: string) {
    const response = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          app_id: appId,
          app_secret: appSecret,
        }),
      },
    );

    const data = await response.json().catch(() => null);
    if (!response.ok || data?.code !== 0 || !data?.tenant_access_token) {
      throw new Error(
        `Feishu auth failed: ${data?.msg || data?.message || response.statusText}`,
      );
    }

    return String(data.tenant_access_token);
  }

  private async createDocx(
    tenantToken: string,
    title: string,
    folderToken?: string,
  ) {
    const url = folderToken
      ? `https://open.feishu.cn/open-apis/docx/v1/documents?folder_token=${encodeURIComponent(folderToken)}`
      : 'https://open.feishu.cn/open-apis/docx/v1/documents';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: this.truncate(title, 120),
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || data?.code !== 0 || !data?.data?.document?.document_id) {
      throw new Error(
        `Feishu create document failed: ${data?.msg || data?.message || response.statusText}`,
      );
    }

    const documentId = String(data.data.document.document_id);
    const documentUrl = `https://feishu.cn/docx/${documentId}`;
    return { documentId, documentUrl };
  }

  private async updateDocxRawContent(
    tenantToken: string,
    documentId: string,
    markdownContent: string,
  ) {
    const body = {
      content: markdownContent,
    };

    const attempts: Array<{ method: 'PATCH' | 'PUT' | 'POST'; url: string }> = [
      {
        method: 'PATCH',
        url: `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/raw_content`,
      },
      {
        method: 'PUT',
        url: `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/raw_content`,
      },
      {
        method: 'POST',
        url: `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/raw_content`,
      },
    ];

    let lastError = '';
    for (const attempt of attempts) {
      const response = await fetch(attempt.url, {
        method: attempt.method,
        headers: {
          Authorization: `Bearer ${tenantToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => null);
      if (response.ok && data?.code === 0) {
        return;
      }

      lastError = `${attempt.method} ${data?.msg || data?.message || response.statusText}`;
      this.logger.warn(`Feishu raw content update failed: ${lastError}`);
    }

    throw new Error(`Feishu update raw content failed: ${lastError || 'unknown error'}`);
  }

  private composeTemplateMarkdown(input: FeishuKnowledgeSyncInput) {
    const keyframeLines = input.keyframes.slice(0, 24).map((kf) => {
      const ts = this.formatTimestamp(kf.timestamp);
      const desc = kf.description?.trim() || '关键帧';
      return `- [${ts}] ${desc}\n  图片: ${kf.url}`;
    });

    const flashcardLines = input.flashcards.slice(0, 30).map((card, idx) => {
      const difficulty = Number(card.difficulty ?? 1);
      const review = card.nextReview ? ` | 下次复习: ${card.nextReview}` : '';
      const title = card.title?.trim() ? `${card.title.trim()}\n` : '';
      return `${idx + 1}. ${title}Q: ${card.front}\nA: ${card.back}\n章节: ${card.chapter || '未分章'} | 难度: ${difficulty}${review}`;
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
