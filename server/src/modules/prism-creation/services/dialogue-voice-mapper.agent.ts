import { Injectable } from '@nestjs/common';
import { CreationLlmService } from './creation-llm.service';
import { CharacterAsset } from './character-asset.service';

export interface VoiceCasting {
  characterName: string;
  voiceId: string;
  voiceName: string;
  rationale: string;
}

@Injectable()
export class DialogueVoiceMapperAgent {
  constructor(private readonly llm: CreationLlmService) {}

  async generate(userId: string, input: { characters: CharacterAsset[] }): Promise<VoiceCasting[]> {
    const voicePool = [
      { voiceId: 'zh_female_calm_01', voiceName: '冷静女声', note: '克制、清晰、适合悬疑与都市写实' },
      { voiceId: 'zh_female_young_02', voiceName: '年轻女声', note: '轻快、敏感、适合青春与旁白' },
      { voiceId: 'zh_male_low_01', voiceName: '低沉男声', note: '沉稳、压迫感、适合权威角色' },
      { voiceId: 'zh_male_clean_02', voiceName: '清朗男声', note: '干净、理性、适合青年主角' },
      { voiceId: 'zh_neutral_story_01', voiceName: '中性叙述声', note: '适合系统播报、画外音、信息播送' },
    ];

    const system = [
      '你是角色音色匹配 Agent。',
      '从给定角色资产中，为每个角色匹配一个最合适的中文音色。',
      `可用音色池：${JSON.stringify(voicePool)}`,
      '输出 JSON：{"voiceCasting":[{"characterName":"","voiceId":"","voiceName":"","rationale":""}]}。',
      '同一个角色只输出一次。',
    ].join('\n');

    const user = `角色资产：\n${JSON.stringify(input.characters, null, 2)}`;
    const result = await this.llm.generateJson<{ voiceCasting?: VoiceCasting[] }>(userId, system, user, 1800);
    const casting = (Array.isArray(result?.voiceCasting) ? result.voiceCasting : []).map((item) => ({
      characterName: String(item?.characterName || '').trim(),
      voiceId: String(item?.voiceId || '').trim(),
      voiceName: String(item?.voiceName || '').trim(),
      rationale: String(item?.rationale || '').trim(),
    })).filter((item) => item.characterName && item.voiceId);

    const byName = new Map(casting.map((item) => [item.characterName, item]));
    return input.characters.map((character, index) => {
      const existing = byName.get(character.name);
      if (existing) return existing;

      const fallbackVoice =
        character.genderHint.includes('女') || /岚|姐|女/.test(character.name)
          ? { voiceId: 'zh_female_calm_01', voiceName: '冷静女声' }
          : character.genderHint.includes('男') || /周|哥|男/.test(character.name)
            ? { voiceId: 'zh_male_clean_02', voiceName: '清朗男声' }
            : { voiceId: 'zh_neutral_story_01', voiceName: '中性叙述声' };

      return {
        characterName: character.name,
        voiceId: fallbackVoice.voiceId,
        voiceName: fallbackVoice.voiceName,
        rationale: `fallback-${index + 1}: 根据角色名称与描述自动分配`,
      };
    });
  }
}
