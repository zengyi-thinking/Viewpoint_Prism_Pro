import { Injectable } from '@nestjs/common';
import { PromptDirectorAgent, PromptBundleResult } from './prompt-director.agent';
import { CharacterAsset } from './character-asset.service';
import { SceneAsset } from './scene-asset.service';
import { StoryboardSegment } from './storyboard-segment.agent';

@Injectable()
export class VideoPromptCompilerAgent {
  constructor(private readonly promptDirector: PromptDirectorAgent) {}

  async compile(
    userId: string,
    input: {
      projectIntent: string;
      segment: StoryboardSegment;
      sceneAsset?: SceneAsset | null;
      characterAssets: CharacterAsset[];
      previousPrompt?: PromptBundleResult | null;
    },
  ): Promise<PromptBundleResult> {
    const segmentCharacters = input.segment.characterRefs
      .map((name) => input.characterAssets.find((item) => item.name === name))
      .filter(Boolean)
      .map((item) => `${item!.name}:${item!.appearance || item!.description}`)
      .join('；');

    const dialogueText = input.segment.dialogueLines
      .map((item) => `${item.speaker}：“${item.text}”`)
      .join(' ');

    const baseVisualDescription = [
      input.segment.visualDescription,
      input.sceneAsset ? `固定场景：${input.sceneAsset.description}` : '',
      segmentCharacters ? `固定角色：${segmentCharacters}` : '',
      input.segment.shotList.length ? `子镜头：${input.segment.shotList.join('；')}` : '',
      dialogueText ? `对白：${dialogueText}` : '',
      input.segment.contentType === 'action'
        ? '这是动作戏，强调速度、动势、冲击反馈和空间位移，但不要写死所有动作细节。'
        : input.segment.contentType === 'dialogue'
          ? '这是文戏，强调表演、视线、对白节奏与稳定构图。'
          : '这是混合戏，兼顾表演、动作和环境变化。',
    ].filter(Boolean).join('\n');

    return this.promptDirector.compile(userId, {
      projectIntent: input.projectIntent,
      nodeTitle: input.segment.title,
      scriptSegment: `${input.segment.summary}\n${dialogueText}`.trim(),
      visualDescription: baseVisualDescription,
      previousNodeTitle: input.previousPrompt ? input.segment.title : undefined,
      previousNodeSummary: input.previousPrompt?.displayPromptCn,
      previousNodeVisualPrompt: input.previousPrompt?.imagePromptCn,
      previousContinuityNotes: input.previousPrompt?.continuityNotes,
      previousCharacterAnchor: input.previousPrompt?.characterAnchor,
    });
  }
}
