import { Injectable } from '@nestjs/common';
import { KnowledgeAssetBlock, KnowledgeAssetDto } from '../dto';
import { PromptBundle } from './creation-ai.types';

@Injectable()
export class KnowledgeExtractService {
  private static readonly VERSION = 'v1';

  extractFromPromptBundle(bundle: PromptBundle): KnowledgeAssetDto {
    const script = String(bundle.scriptSegment || '').trim();
    const prompt = [bundle.videoPrompt, bundle.sceneFramePrompt]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join('\n');
    const merged = [script, prompt].filter(Boolean).join('\n');

    return {
      summaryBlocks: this.extractSummaryBlocks(script, prompt),
      codeBlocks: this.extractCodeBlocks(merged),
      tableBlocks: this.extractTableBlocks(merged),
      formulaBlocks: this.extractFormulaBlocks(merged),
      actionSteps: this.extractActionSteps(script || prompt),
      version: KnowledgeExtractService.VERSION,
    };
  }

  private extractSummaryBlocks(script: string, prompt: string): KnowledgeAssetBlock[] {
    const raw = script || prompt;
    const sentences = raw
      .split(/[。！？!?;\n]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 8)
      .slice(0, 4);
    return sentences.map((text, index) => this.makeBlock(`summary-${index + 1}`, text, script ? 'script' : 'prompt'));
  }

  private extractCodeBlocks(text: string): KnowledgeAssetBlock[] {
    const blocks: string[] = [];
    const fenced = text.match(/```[\s\S]*?```/g) || [];
    blocks.push(
      ...fenced.map((item) =>
        item.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim(),
      ),
    );

    const inlineCodeLines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) =>
        /(?:^|[\s:：])(const|let|var|function|class|def|SELECT|INSERT|UPDATE|DELETE)\b/i.test(line),
      )
      .slice(0, 5);
    blocks.push(...inlineCodeLines);

    return Array.from(new Set(blocks.filter(Boolean))).slice(0, 6).map((item, index) =>
      this.makeBlock(`code-${index + 1}`, item, 'mixed'),
    );
  }

  private extractTableBlocks(text: string): KnowledgeAssetBlock[] {
    const lines = text.split('\n');
    const tableLines = lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed.includes('|') && trimmed.split('|').filter(Boolean).length >= 2;
    });
    if (!tableLines.length) return [];

    const mergedRows = tableLines.slice(0, 6).join('\n');
    return [this.makeBlock('table-1', mergedRows, 'mixed')];
  }

  private extractFormulaBlocks(text: string): KnowledgeAssetBlock[] {
    const candidates = text
      .split(/[。\n]+/)
      .map((item) => item.trim())
      .filter((item) =>
        /([A-Za-z0-9_]+\s*=\s*[^=]+)|([∑∫√∞≈≠≤≥ΔπλμσθΩ])/u.test(item),
      )
      .slice(0, 6);
    return candidates.map((item, index) =>
      this.makeBlock(`formula-${index + 1}`, item, 'mixed'),
    );
  }

  private extractActionSteps(text: string): KnowledgeAssetBlock[] {
    const numbered = text
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => /^(\d+[\).、]|[-*])\s+/.test(item))
      .map((item) => item.replace(/^(\d+[\).、]|[-*])\s+/, '').trim())
      .filter(Boolean);

    const fallbackSteps = numbered.length
      ? numbered
      : text
          .split(/[。！？!?]/)
          .map((item) => item.trim())
          .filter((item) => /(先|然后|接着|最后|首先|随后|完成)/.test(item))
          .slice(0, 6);

    return fallbackSteps.slice(0, 6).map((item, index) =>
      this.makeBlock(`step-${index + 1}`, item, 'script'),
    );
  }

  private makeBlock(id: string, text: string, source: KnowledgeAssetBlock['source']): KnowledgeAssetBlock {
    return {
      id,
      text,
      source,
    };
  }
}
