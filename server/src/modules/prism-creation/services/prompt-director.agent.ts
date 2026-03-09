import { Injectable } from '@nestjs/common';
import { CreationLlmService } from './creation-llm.service';

export interface PromptBundleResult {
  displayPromptCn: string;
  imagePromptCn: string;
  imagePromptModel: string;
  videoPromptModel: string;
  continuityNotes: string;
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
    },
  ): Promise<PromptBundleResult> {
    const system = [
      '你是 Prompt 导演 Agent。你的任务是把节点文案转换成用户可读中文提示词和模型可执行提示词。',
      '不要使用模板化前缀，不要输出“镜头1/风格化/赛博风”等标签。',
      'displayPromptCn 给用户看，口语化但具体。',
      'imagePromptCn 给用户看，强调构图、主体、环境、光线、运动感。',
      'imagePromptModel 给图像模型用，可以包含专业摄影/镜头/材质细节。',
      'videoPromptModel 给视频模型用，强调首尾帧承接、动作轨迹、镜头运动。',
      '输出 JSON：{"displayPromptCn":"","imagePromptCn":"","imagePromptModel":"","videoPromptModel":"","continuityNotes":""}.',
    ].join('\n');

    const user = [
      input.projectIntent ? `项目意图：${input.projectIntent}` : '',
      input.nodeTitle ? `节点标题：${input.nodeTitle}` : '',
      `节点文案：${input.scriptSegment}`,
      input.visualDescription ? `补充画面描述：${input.visualDescription}` : '',
      input.previousNodeSummary ? `上一节点摘要：${input.previousNodeSummary}` : '',
      '请确保画面与动作是可生成的，且对前后镜头承接有帮助。',
    ].filter(Boolean).join('\n');

    const result = await this.llm.generateJson<PromptBundleResult>(userId, system, user, 1800);
    return {
      displayPromptCn: String(result.displayPromptCn || '').trim(),
      imagePromptCn: String(result.imagePromptCn || '').trim(),
      imagePromptModel: String(result.imagePromptModel || '').trim(),
      videoPromptModel: String(result.videoPromptModel || '').trim(),
      continuityNotes: String(result.continuityNotes || '').trim(),
    };
  }
}
