import 'reflect-metadata';
import { PromptBundleFactoryService } from '../src/modules/prism-creation/services/foundation/prompt-bundle-factory.service';
import { PromptEngineService } from '../src/modules/prism-creation/services/foundation/prompt-engine.service';
import { TextSimilarityService } from '../src/modules/prism-creation/services/foundation/text-similarity.service';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const promptEngine = new PromptEngineService();
  const bundleFactory = new PromptBundleFactoryService(promptEngine);
  const similarity = new TextSimilarityService();

  const opening = bundleFactory.create(
    {
      scriptSegment: '开场展示一个数据平台的全景看板，核心指标在大屏中央跳动。',
      subject: '数据平台大屏与核心指标',
      setting: '指挥中心式数据看板空间',
      action: '镜头从全景推进到关键指标特写',
      camera: '先全景后推镜',
      lighting: '冷色主光配合局部高亮',
      style: '专业科技感、信息密度高',
    },
    '做一个关于增长分析系统的开场镜头',
    null,
    'commercial',
  );

  const follow = bundleFactory.create(
    {
      scriptSegment: '镜头继续推进到异常指标，右侧弹出问题来源链路图，准备进入诊断。',
      subject: '异常指标与链路图',
      setting: '同一指挥中心空间内的右侧分析区域',
      action: '从指标特写切到链路图展开',
      camera: '延续推进后轻微平移',
      lighting: '保持冷色基调与局部高亮',
      style: '专业科技感、连续镜头',
    },
    '继续分析异常来源',
    {
      scriptSegment: opening.scriptSegment,
      prompt: opening.videoPrompt,
      orderIndex: 0,
    },
    'commercial',
  );

  const overlap = similarity.keywordOverlap(opening.videoPrompt, follow.videoPrompt);
  const continuity = similarity.jaccard(opening.videoPrompt, follow.videoPrompt);

  assert(Boolean(opening.videoPrompt), 'opening.videoPrompt 不应为空');
  assert(Boolean(follow.firstFramePrompt), 'follow.firstFramePrompt 不应为空');
  assert(overlap.length > 0, '连续镜头应至少共享部分关键词');
  assert(continuity > 0.05, '连续镜头相似度应大于 0.05');

  console.log(
    JSON.stringify(
      {
        openingPreview: opening.videoPrompt.slice(0, 120),
        followPreview: follow.videoPrompt.slice(0, 120),
        overlap,
        continuity,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
