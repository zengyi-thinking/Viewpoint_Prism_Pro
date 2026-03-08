import { Injectable } from '@nestjs/common';

@Injectable()
export class TextSimilarityService {
  tokenize(text: string) {
    return Array.from(
      new Set(
        String(text || '')
          .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
          .map((item) => item.trim())
          .filter((item) => item.length >= 2),
      ),
    );
  }

  jaccard(left: string, right: string) {
    const a = new Set(this.tokenize(left));
    const b = new Set(this.tokenize(right));
    if (!a.size || !b.size) return 0;
    const intersection = Array.from(a).filter((item) => b.has(item)).length;
    const union = new Set([...a, ...b]).size;
    return union ? intersection / union : 0;
  }

  keywordOverlap(left: string, right: string) {
    const a = this.tokenize(left);
    const b = this.tokenize(right);
    if (!a.length || !b.length) return [];
    const bSet = new Set(b);
    return a.filter((token) => bSet.has(token));
  }

  pickDistinctTexts(values: string[], threshold = 0.72) {
    const accepted: string[] = [];
    for (const value of values) {
      const duplicate = accepted.some((item) => this.jaccard(item, value) >= threshold);
      if (!duplicate) {
        accepted.push(value);
      }
    }
    return accepted;
  }
}
