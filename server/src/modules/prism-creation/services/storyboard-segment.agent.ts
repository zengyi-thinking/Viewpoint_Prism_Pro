import { Injectable } from '@nestjs/common';
import { CreationLlmService } from './creation-llm.service';
import { SceneDialogueLine, ScenePlanScene } from './scene-planner.agent';

export interface StoryboardSegment {
  id: string;
  chapterIndex: number;
  sceneId: string;
  title: string;
  summary: string;
  visualDescription: string;
  contentType: 'dialogue' | 'action' | 'mixed';
  characterRefs: string[];
  dialogueLines: SceneDialogueLine[];
  shotList: string[];
  videoPrompt?: string;
  compressedVideoPrompt?: string;
  storyboardImageUrl?: string;
  displayPromptCn?: string;
  imagePromptCn?: string;
  imagePromptModel?: string;
  continuityNotes?: string;
}

@Injectable()
export class StoryboardSegmentAgent {
  constructor(private readonly llm: CreationLlmService) {}

  async generate(userId: string, input: { scenes: ScenePlanScene[] }): Promise<StoryboardSegment[]> {
    const system = [
      '你是分镜片段 Agent。',
      '请把 scenes 继续拆成视频生产片段，每个片段都要可直接交给后续 prompt 编译器。',
      '每个片段必须包含：id、chapterIndex、sceneId、title、summary、visualDescription、contentType、characterRefs、dialogueLines、shotList。',
      'shotList 是 3 到 9 条的子镜头描述。',
      'contentType 只能是 dialogue、action、mixed。',
      '输出 JSON：{"segments":[{"id":"seg-1","chapterIndex":1,"sceneId":"scene-1","title":"","summary":"","visualDescription":"","contentType":"dialogue","characterRefs":[""],"dialogueLines":[{"speaker":"","text":""}],"shotList":[""]}]}。',
    ].join('\n');

    const user = `场景数据：\n${JSON.stringify(input.scenes, null, 2)}`;
    const result = await this.llm.generateJson<{ segments?: StoryboardSegment[] }>(userId, system, user, 3200);
    const segments = Array.isArray(result?.segments) ? result.segments : [];
    if (!segments.length) {
      throw new Error('StoryboardSegmentAgent 未返回有效分镜片段');
    }

    return segments.map((item, index) => ({
      id: String(item?.id || `seg-${index + 1}`).trim(),
      chapterIndex: Math.max(1, Number(item?.chapterIndex || 1)),
      sceneId: String(item?.sceneId || '').trim(),
      title: String(item?.title || '').trim(),
      summary: String(item?.summary || '').trim(),
      visualDescription: String(item?.visualDescription || '').trim(),
      contentType:
        item?.contentType === 'action' || item?.contentType === 'mixed' || item?.contentType === 'dialogue'
          ? item.contentType
          : 'dialogue',
      characterRefs: Array.isArray(item?.characterRefs)
        ? item.characterRefs.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [],
      dialogueLines: Array.isArray(item?.dialogueLines)
        ? item.dialogueLines
            .map((line) => ({
              speaker: String(line?.speaker || '').trim(),
              text: String(line?.text || '').trim(),
            }))
            .filter((line) => line.speaker && line.text)
        : [],
      shotList: Array.isArray(item?.shotList)
        ? item.shotList.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [],
    })).filter((item) => item.sceneId && item.title && item.summary);
  }
}
