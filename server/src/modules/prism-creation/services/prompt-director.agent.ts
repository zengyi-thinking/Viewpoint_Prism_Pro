import { Injectable } from '@nestjs/common';
import { CreationLlmService } from './creation-llm.service';

export interface CharacterAnchor {
  identity: string;
  hair: string;
  outfit: string;
  face: string;
  prop: string;
}

export interface PromptBundleResult {
  displayPromptCn: string;
  imagePromptCn: string;
  imagePromptModel: string;
  videoPromptModel: string;
  continuityNotes: string;
  characterAnchor: CharacterAnchor;
}

@Injectable()
export class PromptDirectorAgent {
  constructor(private readonly llm: CreationLlmService) {}

  async compile(
    userId: string,
    input: {
      projectIntent?: string;
      nodeTitle?: string;
      scriptSegment: string;
      visualDescription?: string;
      previousNodeSummary?: string;
      previousNodeTitle?: string;
      previousNodeVisualPrompt?: string;
      previousContinuityNotes?: string;
      previousCharacterAnchor?: CharacterAnchor | string;
      previousContinuityLocked?: boolean;
    },
  ): Promise<PromptBundleResult> {
    const system = [
      '你是 Prompt 导演 Agent。你的任务是把节点文案转换成用户可读中文提示词和模型可执行提示词。',
      '不要使用模板化前缀，不要输出“镜头1/风格化/赛博风”等标签。',
      'displayPromptCn 给用户看，口语化但具体。',
      'imagePromptCn 给用户看，强调构图、主体、环境、光线、运动感。',
      'imagePromptModel 给图像模型用，必须优先使用英文，写成真正可执行的视觉 prompt，而不是解释性句子。',
      'imagePromptModel 必须明确主体、环境、服装、动作、光线、镜头、构图，不要空泛形容词堆砌。',
      'imagePromptModel 默认禁止任何文字元素、题字、logo、watermark、书法、海报排版，除非文案明确要求画面里出现文字。',
      'videoPromptModel 给视频模型用，优先使用英文，强调首尾帧承接、动作轨迹、镜头运动。',
      '如果提供了上一节点信息，必须显式保持人物身份、服装、发型、面部特征、主体体型、主要道具、环境光线和镜头朝向连续。',
      'characterAnchor 必须输出结构化对象，字段为 identity、hair、outfit、face、prop。',
      '如果本节点有固定人物主体，这五个字段都必须尽量填写具体内容；如果没有固定人物主体，identity 写“当前镜头无固定人物主体”，其他字段可以留空字符串。',
      'continuityNotes 要写成简明的连续性锚点说明，供后续节点和视频渲染直接使用。',
      '如果 previousContinuityLocked=true，必须强继承上一节点人物锚点，不得擅自改动角色身份、发型、服装、面部气质和关键道具，除非文案明确要求角色发生变化。',
      '不要把节点标题直接写进 imagePromptModel，不要生成“海报风大字标题”的描述。',
      '输出 JSON：{"displayPromptCn":"","imagePromptCn":"","imagePromptModel":"","videoPromptModel":"","continuityNotes":"","characterAnchor":{"identity":"","hair":"","outfit":"","face":"","prop":""}}。',
    ].join('\n');

    const user = [
      input.projectIntent ? `项目意图：${input.projectIntent}` : '',
      input.nodeTitle ? `节点标题：${input.nodeTitle}` : '',
      `节点文案：${input.scriptSegment}`,
      input.visualDescription ? `补充画面描述：${input.visualDescription}` : '',
      input.previousNodeTitle ? `上一节点标题：${input.previousNodeTitle}` : '',
      input.previousNodeSummary ? `上一节点摘要：${input.previousNodeSummary}` : '',
      input.previousNodeVisualPrompt ? `上一节点视觉提示：${input.previousNodeVisualPrompt}` : '',
      input.previousContinuityNotes ? `上一节点连续性锚点：${input.previousContinuityNotes}` : '',
      input.previousCharacterAnchor
        ? `上一节点人物锚点：${this.characterAnchorToText(input.previousCharacterAnchor)}`
        : '',
      input.previousContinuityLocked !== undefined
        ? `上一节点连续性锁定：${input.previousContinuityLocked ? 'true' : 'false'}`
        : '',
      '请确保画面与动作是可生成的，且对前后镜头承接有帮助。',
      '如果这是后续节点，不要改变主角身份和外观设定，除非文案明确要求角色发生变化。',
      '如果文案描述的是写实战场、城市、室内、人物互动，就不要擅自改成山水画、仙侠云海、概念海报或抽象意境图。',
    ].filter(Boolean).join('\n');

    const result = await this.llm.generateJson<PromptBundleResult>(userId, system, user, 1800);
    return {
      displayPromptCn: String(result.displayPromptCn || '').trim(),
      imagePromptCn: String(result.imagePromptCn || '').trim(),
      imagePromptModel: String(result.imagePromptModel || '').trim(),
      videoPromptModel: String(result.videoPromptModel || '').trim(),
      continuityNotes: String(result.continuityNotes || '').trim(),
      characterAnchor: this.normalizeCharacterAnchor(result.characterAnchor),
    };
  }

  async reextractCharacterAnchor(
    userId: string,
    input: {
      nodeTitle?: string;
      scriptSegment?: string;
      displayPromptCn?: string;
      imagePromptCn?: string;
      continuityNotes?: string;
      previousCharacterAnchor?: CharacterAnchor | string;
      continuityLocked?: boolean;
    },
  ): Promise<CharacterAnchor> {
    const system = [
      '你是人物连续性抽取 Agent。',
      '你的任务是从节点剧情、中文分镜提示词和连续性说明中提炼稳定的人物锚点。',
      '只输出 JSON，字段必须是 identity、hair、outfit、face、prop。',
      '如果画面没有固定人物主体，identity 写“当前镜头无固定人物主体”，其他字段留空字符串。',
      '如果 continuityLocked=true 且提供了 previousCharacterAnchor，优先继承上一节点的人物锚点，只在当前节点明确要求变化时才调整局部字段。',
    ].join('\n');

    const user = [
      input.nodeTitle ? `节点标题：${input.nodeTitle}` : '',
      input.scriptSegment ? `节点剧情：${input.scriptSegment}` : '',
      input.displayPromptCn ? `中文分镜提示：${input.displayPromptCn}` : '',
      input.imagePromptCn ? `中文图片提示：${input.imagePromptCn}` : '',
      input.continuityNotes ? `连续性说明：${input.continuityNotes}` : '',
      input.previousCharacterAnchor
        ? `上一节点人物锚点：${this.characterAnchorToText(input.previousCharacterAnchor)}`
        : '',
      input.continuityLocked !== undefined
        ? `连续性锁定：${input.continuityLocked ? 'true' : 'false'}`
        : '',
    ].filter(Boolean).join('\n');

    const result = await this.llm.generateJson<CharacterAnchor>(userId, system, user, 900);
    return this.normalizeCharacterAnchor(result);
  }

  private normalizeCharacterAnchor(input: unknown): CharacterAnchor {
    if (typeof input === 'string') {
      const value = input.trim();
      return {
        identity: value || '当前镜头无固定人物主体',
        hair: '',
        outfit: '',
        face: '',
        prop: '',
      };
    }

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {
        identity: '当前镜头无固定人物主体',
        hair: '',
        outfit: '',
        face: '',
        prop: '',
      };
    }

    const value = input as Partial<CharacterAnchor>;
    return {
      identity: String(value.identity || '').trim() || '当前镜头无固定人物主体',
      hair: String(value.hair || '').trim(),
      outfit: String(value.outfit || '').trim(),
      face: String(value.face || '').trim(),
      prop: String(value.prop || '').trim(),
    };
  }

  private characterAnchorToText(input: CharacterAnchor | string): string {
    const anchor = this.normalizeCharacterAnchor(input);
    return [
      `identity=${anchor.identity}`,
      anchor.hair ? `hair=${anchor.hair}` : '',
      anchor.outfit ? `outfit=${anchor.outfit}` : '',
      anchor.face ? `face=${anchor.face}` : '',
      anchor.prop ? `prop=${anchor.prop}` : '',
    ].filter(Boolean).join('; ');
  }
}
