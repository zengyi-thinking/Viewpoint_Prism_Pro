import 'reflect-metadata';
import { ChatPrismType, QUICK_PROMPTS_BY_PRISM } from './index';

describe('Quick prompts by prism', () => {
  it('should expose specialized prompts per prism', () => {
    expect(QUICK_PROMPTS_BY_PRISM[ChatPrismType.KNOWLEDGE].length).toBeGreaterThan(0);
    expect(QUICK_PROMPTS_BY_PRISM[ChatPrismType.CREATION].length).toBeGreaterThan(0);
    expect(QUICK_PROMPTS_BY_PRISM[ChatPrismType.TRANSLATION].length).toBeGreaterThan(0);
    expect(QUICK_PROMPTS_BY_PRISM[ChatPrismType.DIFFRACTION].length).toBeGreaterThan(0);
  });

  it('should avoid knowledge-only command defaults in creation prompts', () => {
    const creationTemplates = QUICK_PROMPTS_BY_PRISM[ChatPrismType.CREATION]
      .map((item) => item.promptTemplate.toLowerCase())
      .join('\n');

    expect(creationTemplates.includes('/mindmap')).toBe(false);
    expect(creationTemplates.includes('/summarize')).toBe(false);
  });
});
