import { Injectable, Logger } from '@nestjs/common';
import { AITaskType } from '../../../infrastructure/ai-router/ai-router.interface';
import { AiRouterService } from '../../../infrastructure/ai-router/ai-router.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 思维导图节点结构
 */
export interface MindmapNode {
  id: string;
  content: string;
  level: number;
  children?: MindmapNode[];
  metadata?: {
    timestamp?: number;
    keyframeUrl?: string;
    transcriptSegment?: string;
  };
}

/**
 * 思维导图生成结果
 */
export interface MindmapResult {
  json: MindmapNode;
  markdown: string;
  mermaid: string;
  nodeCount: number;
}

/**
 * 思维导图生成服务
 * 基于视频转写内容和关键帧生成结构化的思维导图
 */
@Injectable()
export class MindmapService {
  private readonly logger = new Logger(MindmapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  /**
   * 为视频生成思维导图
   */
  async generateMindmap(params: {
    userId: string;
    videoId: string;
    videoTitle: string;
    transcriptSegments: Array<{ start: number; end: number; text: string }>;
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string | null }>;
    maxDepth?: number;
    maxNodes?: number;
  }): Promise<MindmapResult> {
    const {
      userId,
      videoId,
      videoTitle,
      transcriptSegments,
      keyframes,
      maxDepth = 5,
      maxNodes = 90,
    } = params;

    this.logger.log(`生成思维导图: videoId=${videoId}, maxDepth=${maxDepth}, maxNodes=${maxNodes}`);

    // 1. 获取现有知识资产的大纲作为上下文
    const existingAsset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
      select: { outlineMarkdown: true },
    });

    const outlineContext = existingAsset?.outlineMarkdown ?? null;

    // 2. 使用 AI 生成思维导图结构
    const mindmapResult = await this.generateMindmapWithAI(
      userId,
      videoTitle,
      transcriptSegments,
      keyframes,
      outlineContext,
      maxDepth,
      maxNodes,
    );

    // 3. 将思维导图存储到知识资产的 notesMarkdown 中
    await this.saveMindmapToAsset(videoId, mindmapResult);

    this.logger.log(`思维导图生成完成: videoId=${videoId}, nodes=${mindmapResult.nodeCount}`);

    return mindmapResult;
  }

  /**
   * 从对话消息生成思维导图
   */
  async generateMindmapFromChat(params: {
    userId: string;
    videoId: string;
    sessionId: string;
    prompt: string;
  }): Promise<MindmapResult> {
    const { userId, videoId, sessionId, prompt } = params;

    this.logger.log(`从对话生成思维导图: videoId=${videoId}, sessionId=${sessionId}`);

    // 1. 获取视频相关信息
    const video = await this.prisma.videoSource.findUnique({
      where: { id: videoId },
      select: { title: true, id: true },
    });

    if (!video) {
      throw new Error('视频不存在');
    }

    // 2. 获取对话历史
    const messages = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const conversationContext = messages
      .map((m) => `${m.role === 'USER' ? '用户' : '助手'}: ${m.content}`)
      .join('\n');

    // 3. 获取转写内容
    const transcript = await this.prisma.transcript.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });

    const transcriptSegments = (transcript?.segments as Array<{ text: string }> | undefined) ?? [];

    // 4. 获取关键帧
    const keyframes = await this.prisma.keyframe.findMany({
      where: { videoId },
      orderBy: { timestamp: 'asc' },
      take: 16,
    });

    // 5. 生成思维导图
    const mindmapResult = await this.generateMindmapWithAI(
      userId,
      video.title,
      transcriptSegments.map((s) => ({ start: 0, end: 0, text: s.text })),
      keyframes.map((k) => ({
        timestamp: k.timestamp,
        storagePath: k.storagePath,
        description: k.description,
      })),
      null,
      5,
      90,
      prompt,
      conversationContext,
    );

    await this.saveMindmapToAsset(videoId, mindmapResult);

    return mindmapResult;
  }

  /**
   * 获取视频的思维导图
   */
  async getMindmap(videoId: string): Promise<MindmapResult | null> {
    const asset = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
      select: { notesMarkdown: true },
    });

    if (!asset?.notesMarkdown) {
      return null;
    }

    try {
      // 从 notesMarkdown 中提取思维导图数据
      const data = JSON.parse(asset.notesMarkdown);
      return data as MindmapResult;
    } catch {
      return null;
    }
  }

  /**
   * 导出思维导图为不同格式
   */
  async exportMindmap(params: {
    videoId: string;
    format: 'json' | 'markdown' | 'mermaid' | 'xmind' | 'freemind';
  }): Promise<string> {
    const mindmap = await this.getMindmap(params.videoId);

    if (!mindmap) {
      throw new Error('思维导图不存在');
    }

    switch (params.format) {
      case 'json':
        return JSON.stringify(mindmap.json, null, 2);
      case 'markdown':
        return mindmap.markdown;
      case 'mermaid':
        return mindmap.mermaid;
      case 'xmind':
        return this.convertToXMind(mindmap.json);
      case 'freemind':
        return this.convertToFreeMind(mindmap.json);
      default:
        throw new Error(`不支持的导出格式: ${params.format}`);
    }
  }

  /**
   * 使用 AI 生成思维导图
   */
  private async generateMindmapWithAI(
    userId: string,
    videoTitle: string,
    transcriptSegments: Array<{ start: number; end: number; text: string }>,
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string | null }>,
    outlineContext: string | null,
    maxDepth: number,
    maxNodes: number,
    customPrompt?: string,
    conversationContext?: string,
  ): Promise<MindmapResult> {
    try {
      // 构建输入数据
      const inputData = this.buildInputData(
        videoTitle,
        transcriptSegments,
        keyframes,
        outlineContext,
      );

      const systemPrompt = this.buildSystemPrompt(maxDepth, maxNodes, customPrompt);

      const userPrompt = this.buildUserPrompt(inputData, conversationContext);

      // 调用 LLM 生成思维导图
      const llm = await this.aiRouter.execute(
        AITaskType.LLM_CHAT,
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          maxTokens: 4000,
          responseFormat: { type: 'json_object' },
        },
        userId,
      );

      const text = this.extractLlmText(llm);
      if (!text) {
        const provider = String(llm?.provider ?? 'unknown');
        const model = String(llm?.model ?? 'unknown');
        throw new Error(`AI 返回空内容(provider=${provider}, model=${model})`);
      }

      // 容错解析 AI 返回的 JSON（支持 ```json 包裹和前后噪声文本）
      const aiResult = this.parseJsonFromLlmText(text);

      // 构建思维导图结果
      const result = this.buildMindmapResult(aiResult, videoTitle);
      const minNodeThreshold = Math.min(Math.max(12, Math.floor(maxNodes * 0.3)), 24);
      if (result.nodeCount < minNodeThreshold && transcriptSegments.length >= 12) {
        this.logger.warn(
          `AI 思维导图节点过少(${result.nodeCount})，回退到规则增强生成: video=${videoTitle}`,
        );
        return this.generateFallbackMindmap(
          videoTitle,
          transcriptSegments,
          keyframes,
          maxDepth,
          maxNodes,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`AI 生成思维导图失败: ${error.message}`, error.stack);

      // 降级：使用规则生成基础思维导图
      return this.generateFallbackMindmap(
        videoTitle,
        transcriptSegments,
        keyframes,
        maxDepth,
        maxNodes,
      );
    }
  }

  /**
   * 从 LLM 文本中提取并解析 JSON。
   * 常见容错场景：
   * 1) ```json ... ``` 代码块包裹
   * 2) JSON 前后带解释性文本
   */
  private parseJsonFromLlmText(text: string): any {
    const raw = text.trim();

    const directCandidates = [
      raw,
      raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim(),
      raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim(),
    ];

    for (const candidate of directCandidates) {
      if (!candidate) continue;
      try {
        return JSON.parse(candidate);
      } catch {
        // try next candidate
      }
    }

    const extracted =
      this.extractFirstJsonObject(raw) ||
      this.extractFirstJsonObject(
        raw
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim(),
      );

    if (extracted) {
      return JSON.parse(extracted);
    }

    throw new Error(
      `无法解析思维导图 JSON，返回内容片段: ${raw.slice(0, 180)}`,
    );
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

  /**
   * 提取文本中首个完整 JSON 对象（忽略字符串内部的大括号）。
   */
  private extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{');
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }

    return null;
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(maxDepth: number, maxNodes: number, customPrompt?: string): string {
    const basePrompt = `你是 Viewpoint Prism Pro 的思维导图生成专家。

你的任务是将视频内容转换为“细节充分”的结构化思维导图。

硬性要求：
1. 只返回严格 JSON，不要 Markdown、不要代码块、不要解释文字。
2. JSON 必须包含：
   - nodes: 扁平节点数组，每个节点含 id, content, level, parentId, metadata
   - structure: 树形结构节点（根节点 + children）
3. 节点层级从 0（根节点）到 ${maxDepth - 1}，且在信息足够时必须达到至少 3 层（0/1/2）。
4. 总节点数不超过 ${maxNodes}，但应尽量覆盖核心细节，建议不少于 ${Math.max(
      14,
      Math.floor(maxNodes * 0.35),
    )} 个节点（若输入信息不足可少于该值）。
5. 根节点必须是视频标题，一级节点应表示章节/主题；二级及以下节点必须落到“事实细节”：
   - 关键概念定义
   - 关键步骤/方法
   - 结论与注意事项
   - 例子或场景
6. 优先使用输入中的时间信息，在 metadata.timestamp 写入秒数；若来自关键帧可写 metadata.keyframeUrl。
7. 节点内容要信息密集且可读，避免空泛词（如“介绍”“内容”“总结”单独成节点）。

质量要求：
- 同一分支下避免重复节点；
- 每个一级主题尽量有 2-4 个子节点；
- 对可定位到时间点的细节尽量附 timestamp。 

返回的 JSON 结构示例：
{
  "nodes": [
    { "id": "root", "content": "视频标题", "level": 0, "parentId": null },
    { "id": "n1", "content": "第一章", "level": 1, "parentId": "root", "metadata": { "timestamp": 10 } }
  ],
  "structure": {
    "id": "root",
    "content": "视频标题",
    "level": 0,
    "children": [
      {
        "id": "n1",
        "content": "第一章",
        "level": 1,
        "children": []
      }
    ]
  }
}`;

    if (customPrompt) {
      return `${basePrompt}\n\n用户自定义要求：\n${customPrompt}`;
    }

    return basePrompt;
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(
    inputData: {
      title: string;
      transcriptSummary: string;
      keyframes: Array<{ timestamp: number; description: string }>;
      outlineContext: string;
    },
    conversationContext?: string,
  ): string {
    let prompt = `请为以下视频内容生成思维导图：

# 视频标题
${inputData.title}

# 转写内容摘要
${inputData.transcriptSummary}

# 关键帧信息
${inputData.keyframes.map((k) => `[${k.timestamp}s] ${k.description}`).join('\n')}
`;

    if (inputData.outlineContext) {
      prompt += `\n# 现有大纲参考\n${inputData.outlineContext}\n`;
    }

    if (conversationContext) {
      prompt += `\n# 对话上下文\n${conversationContext}\n`;
    }

    prompt += `
# 生成要求补充
1. 不是只给标题，要把每个主题的关键细节拆出来。
2. 尽量覆盖“讲了什么 + 怎么做 + 为什么 + 注意什么”。
3. 可引用时间点的信息务必写入 metadata.timestamp。
4. 输出必须是 JSON 对象，且只输出 JSON 对象。`;

    return prompt;
  }

  /**
   * 构建输入数据
   */
  private buildInputData(
    videoTitle: string,
    transcriptSegments: Array<{ start: number; end: number; text: string }>,
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string | null }>,
    outlineContext: string | null,
  ) {
    // 摘要转写内容（扩大采样，保证导图细节）
    const transcriptSummary = transcriptSegments
      .slice(0, 40)
      .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}s] ${this.truncateText(s.text, 140)}`)
      .join('\n');

    // 整理关键帧信息
    const keyframeInfo = keyframes.slice(0, 16).map((k) => ({
      timestamp: k.timestamp,
      description: k.description || '关键画面',
    }));

    return {
      title: videoTitle,
      transcriptSummary: transcriptSummary || '暂无转写内容',
      keyframes: keyframeInfo,
      outlineContext: outlineContext || '',
    };
  }

  /**
   * 构建思维导图结果
   */
  private buildMindmapResult(aiResult: any, videoTitle: string): MindmapResult {
    const structure = aiResult.structure || this.buildDefaultStructure(videoTitle);
    const nodes = aiResult.nodes || [];

    // 转换为标准格式
    const jsonNode = this.normalizeNode(structure);
    const markdown = this.convertToMarkdown(jsonNode);
    const mermaid = this.convertToMermaid(jsonNode);
    const nodeCount = this.countNodes(jsonNode);

    return {
      json: jsonNode,
      markdown,
      mermaid,
      nodeCount,
    };
  }

  /**
   * 转换为标准节点格式
   */
  private normalizeNode(node: any): MindmapNode {
    const normalized: MindmapNode = {
      id: node.id || `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: node.content || '未命名节点',
      level: node.level || 0,
      metadata: node.metadata || {},
    };

    if (node.children && Array.isArray(node.children)) {
      normalized.children = node.children.map((child: any) => this.normalizeNode(child));
    }

    return normalized;
  }

  /**
   * 构建默认结构
   */
  private buildDefaultStructure(videoTitle: string): MindmapNode {
    return {
      id: 'root',
      content: videoTitle,
      level: 0,
      children: [],
    };
  }

  /**
   * 转换为 Markdown 格式
   */
  private convertToMarkdown(node: MindmapNode, indent = 0): string {
    const prefix = '  '.repeat(indent);
    const marker = indent === 0 ? '#' : '-'.repeat(Math.min(indent + 1, 3));
    const lines: string[] = [];

    lines.push(`${prefix}${marker} ${node.content}`);

    if (node.children) {
      node.children.forEach((child) => {
        lines.push(this.convertToMarkdown(child, indent + 1));
      });
    }

    return lines.join('\n');
  }

  /**
   * 转换为 Mermaid 格式
   */
  private convertToMermaid(node: MindmapNode): string {
    const lines: string[] = ['mindmap'];
    lines.push('  root((${node.content}))');

    const addChildren = (parentNode: MindmapNode, prefix: string) => {
      if (!parentNode.children) return;

      parentNode.children.forEach((child, index) => {
        const nodeId = `${parentNode.id}-${index}`;
        const content = child.content.replace(/[()]/g, '');
        lines.push(`${prefix} ${child.id}(${content})`);

        if (child.children && child.children.length > 0) {
          addChildren(child, `${prefix} ${child.id}`);
        }
      });
    };

    addChildren(node, '  ');

    return lines.join('\n');
  }

  /**
   * 统计节点数量
   */
  private countNodes(node: MindmapNode): number {
    let count = 1;
    if (node.children) {
      node.children.forEach((child) => {
        count += this.countNodes(child);
      });
    }
    return count;
  }

  /**
   * 生成降级思维导图（当 AI 失败时）
   */
  private generateFallbackMindmap(
    videoTitle: string,
    transcriptSegments: Array<{ start: number; end: number; text: string }>,
    keyframes: Array<{ timestamp: number; storagePath: string; description?: string | null }>,
    maxDepth: number,
    maxNodes: number,
  ): MindmapResult {
    const rootNode: MindmapNode = {
      id: 'root',
      content: videoTitle,
      level: 0,
      children: [],
    };

    let nodeCount = 1;
    const segmentGroups = this.groupSegments(transcriptSegments, 5);

    segmentGroups.forEach((group, groupIndex) => {
      if (nodeCount >= maxNodes) return;

      const groupNode: MindmapNode = {
        id: `group-${groupIndex}`,
        content: this.extractTopicFromSegments(group),
        level: 1,
        children: [],
        metadata: {
          timestamp: group[0]?.start,
        },
      };

      nodeCount++;
      rootNode.children!.push(groupNode);

      group.slice(0, 3).forEach((segment, segIndex) => {
        if (nodeCount >= maxNodes) return;

        const segNode: MindmapNode = {
          id: `seg-${groupIndex}-${segIndex}`,
          content: this.truncateText(segment.text, 12),
          level: 2,
          metadata: {
            timestamp: segment.start,
          },
        };

        nodeCount++;
        groupNode.children!.push(segNode);
      });
    });

    const markdown = this.convertToMarkdown(rootNode);
    const mermaid = this.convertToMermaid(rootNode);

    return {
      json: rootNode,
      markdown,
      mermaid,
      nodeCount,
    };
  }

  /**
   * 分组转写片段
   */
  private groupSegments(
    segments: Array<{ start: number; end: number; text: string }>,
    groupSize: number,
  ) {
    const groups: typeof segments[] = [];
    for (let i = 0; i < segments.length; i += groupSize) {
      groups.push(segments.slice(i, i + groupSize));
    }
    return groups;
  }

  /**
   * 从片段中提取主题
   */
  private extractTopicFromSegments(segments: Array<{ start: number; end: number; text: string }>): string {
    if (!segments.length) return '未命名主题';
    const firstText = segments[0].text;
    return this.truncateText(firstText, 15);
  }

  /**
   * 截断文本
   */
  private truncateText(text: string, maxLength: number): string {
    const clean = text.trim().replace(/\s+/g, ' ');
    return clean.length > maxLength ? clean.substring(0, maxLength) + '...' : clean;
  }

  /**
   * 保存思维导图到知识资产
   */
  private async saveMindmapToAsset(videoId: string, mindmap: MindmapResult): Promise<void> {
    const existing = await this.prisma.knowledgeAsset.findFirst({
      where: { videoId },
      orderBy: { updatedAt: 'desc' },
    });

    const mindmapJson = JSON.stringify(mindmap);

    if (existing) {
      await this.prisma.knowledgeAsset.update({
        where: { id: existing.id },
        data: {
          notesMarkdown: mindmapJson,
          status: 'COMPLETED',
        },
      });
    } else {
      await this.prisma.knowledgeAsset.create({
        data: {
          videoId,
          outlineMarkdown: '# 知识大纲\n\n（待生成）',
          notesMarkdown: mindmapJson,
          status: 'COMPLETED',
        },
      });
    }
  }

  /**
   * 转换为 XMind 格式
   */
  private convertToXMind(node: MindmapNode): string {
    // 简化的 XMind 格式
    const xmindData = {
      workbook: {
        sheets: [
          {
            id: 'sheet-1',
            title: node.content,
            rootTopic: this.convertNodeToXMindTopic(node),
          },
        ],
      },
    };
    return JSON.stringify(xmindData, null, 2);
  }

  /**
   * 转换节点为 XMind 主题
   */
  private convertNodeToXMindTopic(node: MindmapNode): any {
    const topic: any = {
      id: node.id,
      title: node.content,
    };

    if (node.metadata?.timestamp !== undefined) {
      topic.timestamp = node.metadata.timestamp;
    }

    if (node.children && node.children.length > 0) {
      topic.children = {
        attached: node.children.map((child) => this.convertNodeToXMindTopic(child)),
      };
    }

    return topic;
  }

  /**
   * 转换为 FreeMind 格式
   */
  private convertToFreeMind(node: MindmapNode): string {
    const lines: string[] = ['<map version="1.0.1">'];
    this.convertNodeToFreeMindXML(node, lines, 0);
    lines.push('</map>');
    return lines.join('\n');
  }

  /**
   * 转换节点为 FreeMind XML
   */
  private convertNodeToFreeMindXML(node: MindmapNode, lines: string[], level: number): void {
    const indent = '  '.repeat(level);
    const attribs = [`ID="${node.id}"`, `TEXT="${this.escapeXML(node.content)}"`];

    if (node.metadata?.timestamp !== undefined) {
      attribs.push(`TIMESTAMP="${node.metadata.timestamp}"`);
    }

    if (node.children && node.children.length > 0) {
      lines.push(`${indent}<node ${attribs.join(' ')}>`);
      node.children.forEach((child) => this.convertNodeToFreeMindXML(child, lines, level + 1));
      lines.push(`${indent}</node>`);
    } else {
      lines.push(`${indent}<node ${attribs.join(' ')}/>`);
    }
  }

  /**
   * 转义 XML 特殊字符
   */
  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
