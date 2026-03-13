import { Injectable } from '@nestjs/common';

@Injectable()
export class PromptCompressionAgent {
  compress(prompt: string, maxLength = 1800): string {
    const normalized = String(prompt || '')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .trim();

    if (normalized.length <= maxLength) {
      return normalized;
    }

    const sentences = normalized
      .split(/(?<=[.!?。！？])\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const kept: string[] = [];
    for (const sentence of sentences) {
      const next = kept.length ? `${kept.join(' ')} ${sentence}` : sentence;
      if (next.length > maxLength - 24) break;
      kept.push(sentence);
    }

    const result = (kept.length ? kept.join(' ') : normalized.slice(0, maxLength - 3)).trim();
    return result.length <= maxLength ? result : result.slice(0, maxLength - 3).trim();
  }
}
