import { Injectable } from '@nestjs/common';
import { CreationLlmService } from './creation-llm.service';
import { ScriptPlanResult } from './script-planner.agent';

export interface SceneDialogueLine {
  speaker: string;
  text: string;
}

export interface ScenePlanScene {
  id: string;
  chapterIndex: number;
  sceneName: string;
  summary: string;
  visualSummary: string;
  location: string;
  timeOfDay: string;
  characters: string[];
  dialogueLines: SceneDialogueLine[];
  contentType: 'dialogue' | 'action' | 'mixed';
  continuityTone: string;
}

export interface ScenePlanPackage {
  overallSummary: string;
  scenes: ScenePlanScene[];
}

@Injectable()
export class ScenePlannerAgent {
  constructor(private readonly llm: CreationLlmService) {}

  async generate(userId: string, input: { scriptText: string; scriptPlan: ScriptPlanResult }): Promise<ScenePlanPackage> {
    const system = [
      '你是场景规划 Agent。你的任务是把已分章的中文剧本拆成连续的场景生产包。',
      '先输出一个 overallSummary，再输出 scenes 数组。',
      '每个 scene 必须包含：id、chapterIndex、sceneName、summary、visualSummary、location、timeOfDay、characters、dialogueLines、contentType、continuityTone。',
      'sceneName 使用“地点，时间段”的格式。',
      'contentType 只能是 dialogue、action、mixed 之一。',
      'dialogueLines 只保留真实台词，speaker 填角色名，text 填台词原文。',
      '同一个角色名称在所有场景中必须保持一致。',
      '同一个场景的 sceneName 不能乱变，要便于后续复用固定场景图。',
      '输出 JSON：{"overallSummary":"","scenes":[{"id":"scene-1","chapterIndex":1,"sceneName":"","summary":"","visualSummary":"","location":"","timeOfDay":"","characters":[""],"dialogueLines":[{"speaker":"","text":""}],"contentType":"dialogue","continuityTone":""}]}',
    ].join('\n');

    const user = [
      `完整剧本：\n${input.scriptText}`,
      `章节结构：\n${JSON.stringify(input.scriptPlan, null, 2)}`,
      '请基于章节推进拆分连续场景，保证所有章节都被覆盖。',
    ].join('\n\n');

    const result = await this.llm.generateJson<Partial<ScenePlanPackage>>(userId, system, user, 3200);
    const scenes = Array.isArray(result?.scenes) ? result.scenes : [];
    if (!scenes.length) {
      throw new Error('ScenePlannerAgent 未返回有效场景');
    }

    return {
      overallSummary: String(result?.overallSummary || '').trim(),
      scenes: scenes.map((scene, index) => ({
        id: String(scene?.id || `scene-${index + 1}`).trim(),
        chapterIndex: Math.max(1, Number(scene?.chapterIndex || 1)),
        sceneName: String(scene?.sceneName || '').trim(),
        summary: String(scene?.summary || '').trim(),
        visualSummary: String(scene?.visualSummary || '').trim(),
        location: String(scene?.location || '').trim(),
        timeOfDay: String(scene?.timeOfDay || '').trim(),
        characters: Array.isArray(scene?.characters)
          ? scene.characters.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
        dialogueLines: Array.isArray(scene?.dialogueLines)
          ? scene.dialogueLines
              .map((item) => ({
                speaker: String(item?.speaker || '').trim(),
                text: String(item?.text || '').trim(),
              }))
              .filter((item) => item.speaker && item.text)
          : [],
        contentType: scene?.contentType === 'action' || scene?.contentType === 'mixed' ? scene.contentType : 'dialogue',
        continuityTone: String(scene?.continuityTone || '').trim(),
      })),
    };
  }
}
