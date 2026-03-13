import { Injectable } from '@nestjs/common';
import { CreationLlmService } from './creation-llm.service';
import { ScenePlanScene } from './scene-planner.agent';

export interface SceneAsset {
  id: string;
  sceneId: string;
  name: string;
  description: string;
  imagePrompt: string;
  imageUrl?: string;
  continuityTone: string;
}

@Injectable()
export class SceneAssetService {
  constructor(private readonly llm: CreationLlmService) {}

  async generate(userId: string, input: { artStyle: string; scenes: ScenePlanScene[] }): Promise<SceneAsset[]> {
    const system = [
      '你是场景设定图 Agent。',
      '为每个 scene 生成固定场景资产。',
      '输出 JSON：{"scenes":[{"id":"scene-asset-1","sceneId":"scene-1","name":"","description":"","imagePrompt":"","continuityTone":""}]}。',
      'imagePrompt 要是中文图像提示词，强调固定环境、空间结构、光线色调，不要写人物，不要写文字水印。',
      '同一个 sceneId 只允许输出一次。',
    ].join('\n');

    const user = [
      `艺术风格：${input.artStyle}`,
      `场景列表：\n${JSON.stringify(input.scenes, null, 2)}`,
    ].join('\n\n');

    const result = await this.llm.generateJson<{ scenes?: SceneAsset[] }>(userId, system, user, 2800);
    const generated = (Array.isArray(result?.scenes) ? result.scenes : []).map((item, index) => ({
      id: String(item?.id || `scene-asset-${index + 1}`).trim(),
      sceneId: String(item?.sceneId || '').trim(),
      name: String(item?.name || '').trim(),
      description: String(item?.description || '').trim(),
      imagePrompt: String(item?.imagePrompt || '').trim(),
      continuityTone: String(item?.continuityTone || '').trim(),
    })).filter((item) => item.sceneId && item.name && item.imagePrompt);

    const bySceneId = new Map(generated.map((item) => [item.sceneId, item]));
    const normalized: SceneAsset[] = [];

    input.scenes.forEach((scene, index) => {
      const existing = bySceneId.get(scene.id);
      if (existing) {
        normalized.push(existing);
        return;
      }

      normalized.push({
        id: `scene-asset-fallback-${index + 1}`,
        sceneId: scene.id,
        name: scene.sceneName,
        description: scene.visualSummary || scene.summary,
        imagePrompt: [
          input.artStyle,
          scene.sceneName,
          scene.visualSummary || scene.summary,
          scene.continuityTone,
          '固定环境设定图，无人物，无文字水印，电影级构图，16:9 wide shot',
        ].filter(Boolean).join('，'),
        continuityTone: scene.continuityTone,
      });
    });

    return normalized;
  }
}
