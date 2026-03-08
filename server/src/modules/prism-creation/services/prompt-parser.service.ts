import { Injectable } from '@nestjs/common';

@Injectable()
export class PromptParserService {
  extractResponseContent(response: any): string {
    return String(
      response?.choices?.[0]?.message?.content ??
        response?.content ??
        response?.text ??
        '',
    ).trim();
  }

  extractJsonPayload(response: any): any {
    const content = this.extractResponseContent(response);
    return this.parseJsonLoose(content);
  }

  sanitizeShortText(value: string, maxLength: number): string {
    const text = String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';
    return Array.from(text).slice(0, maxLength).join('');
  }

  parseJsonLoose(content: string): any {
    const raw = String(content || '').trim();
    if (!raw) return null;

    const unfenced = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    try {
      return JSON.parse(unfenced);
    } catch {
      const jsonMatch = unfenced.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!jsonMatch) return null;
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
  }
}
