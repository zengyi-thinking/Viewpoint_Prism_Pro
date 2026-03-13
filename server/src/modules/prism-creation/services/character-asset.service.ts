import { Injectable } from '@nestjs/common';
import { CreationLlmService } from './creation-llm.service';
import { ScenePlanScene } from './scene-planner.agent';

export interface CharacterAsset {
  id: string;
  name: string;
  description: string;
  appearance: string;
  imagePrompt: string;
  imageUrl?: string;
  identity: string;
  genderHint: string;
  ageHint: string;
}

@Injectable()
export class CharacterAssetService {
  constructor(private readonly llm: CreationLlmService) {}

  async generate(
    userId: string,
    input: { scriptText: string; artStyle: string; scenes: ScenePlanScene[] },
  ): Promise<CharacterAsset[]> {
    const system = [
      '你是角色设定图 Agent。',
      '基于剧本和场景信息，为每个重要角色生成固定角色资产。',
      '输出 JSON：{"characters":[{"id":"char-1","name":"","description":"","appearance":"","imagePrompt":"","identity":"","genderHint":"","ageHint":""}]}。',
      'imagePrompt 要是中文图像提示词，适合生成角色设定图，必须包含角色外貌、服装、发型、纯净背景、半身或立绘信息。',
      '同一角色只允许输出一次。',
    ].join('\n');

    const user = [
      `艺术风格：${input.artStyle}`,
      `完整剧本：\n${input.scriptText}`,
      `场景列表：\n${JSON.stringify(input.scenes, null, 2)}`,
    ].join('\n\n');

    const result = await this.llm.generateJson<{ characters?: CharacterAsset[] }>(userId, system, user, 2800);
    const generated = (Array.isArray(result?.characters) ? result.characters : []).map((item, index) => ({
      id: String(item?.id || `char-${index + 1}`).trim(),
      name: String(item?.name || '').trim(),
      description: String(item?.description || '').trim(),
      appearance: String(item?.appearance || '').trim(),
      imagePrompt: String(item?.imagePrompt || '').trim(),
      identity: String(item?.identity || item?.name || '').trim(),
      genderHint: String(item?.genderHint || '').trim(),
      ageHint: String(item?.ageHint || '').trim(),
    })).filter((item) => item.name && item.imagePrompt);

    const byName = new Map(generated.map((item) => [item.name, item]));
    const uniqueNames = [...new Set(input.scenes.flatMap((scene) => scene.characters).filter(Boolean))];

    return uniqueNames.map((name, index) => {
      const existing = byName.get(name);
      if (existing) return existing;

      const relatedScenes = input.scenes.filter((scene) => scene.characters.includes(name));
      const joinedSummary = relatedScenes.map((scene) => scene.summary).join('；');
      return {
        id: `char-fallback-${index + 1}`,
        name,
        description: joinedSummary || `${name} 的固定角色设定`,
        appearance: `${name}，固定角色形象`,
        imagePrompt: [
          input.artStyle,
          name,
          joinedSummary || '固定角色设定',
          '角色设定图，半身或立绘，纯净背景，清晰五官，固定服装，电影级写实质感',
        ].filter(Boolean).join('，'),
        identity: name,
        genderHint: '',
        ageHint: '',
      };
    });
  }
}
