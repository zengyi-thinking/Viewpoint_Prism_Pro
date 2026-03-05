import { ChatService } from './chat.service';
import { ChatPrismType, PrismActionType } from './dto';

describe('ChatService prism boundary', () => {
  const createService = () =>
    new ChatService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it('should keep summarize intent inside knowledge prism only', () => {
    const service = createService();

    const creationAction = (service as any).inferPrismAction(
      ChatPrismType.CREATION,
      '/summarize 请总结这个产品脚本',
    );
    const knowledgeAction = (service as any).inferPrismAction(
      ChatPrismType.KNOWLEDGE,
      '/summarize 请总结当前视频',
    );

    expect(creationAction).toBe(PrismActionType.UPDATE_NODE_PROMPT);
    expect(knowledgeAction).toBe(PrismActionType.GENERATE_SUMMARY);
  });

  it('should keep mindmap intent inside knowledge prism only', () => {
    const service = createService();

    const creationAction = (service as any).inferPrismAction(
      ChatPrismType.CREATION,
      '请帮我生成思维导图',
    );
    const knowledgeAction = (service as any).inferPrismAction(
      ChatPrismType.KNOWLEDGE,
      '请帮我生成思维导图',
    );

    expect(creationAction).toBe(PrismActionType.UPDATE_NODE_PROMPT);
    expect(knowledgeAction).toBe(PrismActionType.GENERATE_MINDMAP);
  });
});

