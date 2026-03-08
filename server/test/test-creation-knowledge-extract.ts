import 'reflect-metadata';
import { KnowledgeExtractService } from '../src/modules/prism-creation/services/fallback/knowledge-extract.service';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const service = new KnowledgeExtractService();
  const result = service.extractFromPromptBundle({
    scriptSegment: [
      '1. 先加载数据源并检查字段完整性。',
      '2. 然后执行特征工程，构建训练矩阵。',
      '3. 最后训练模型并输出评估结果。',
      '代码片段：const features = buildMatrix(data);',
      '关键公式：accuracy = (tp + tn) / (tp + tn + fp + fn)。',
    ].join('\n'),
    videoPrompt:
      '左侧展示 Python 代码，右侧展示指标图表，镜头从中景推进到公式特写。',
    sceneFramePrompt: [
      '| 指标 | 数值 |',
      '| --- | --- |',
      '| accuracy | 0.93 |',
      '| recall | 0.88 |',
    ].join('\n'),
    firstFramePrompt: '',
    lastFramePrompt: '',
  });

  assert(result.summaryBlocks.length > 0, 'summaryBlocks 应该非空');
  assert(result.codeBlocks.length > 0, 'codeBlocks 应该非空');
  assert(result.tableBlocks.length > 0, 'tableBlocks 应该非空');
  assert(result.actionSteps.length > 0, 'actionSteps 应该非空');

  console.log(
    JSON.stringify(
      {
        version: result.version,
        summaryCount: result.summaryBlocks.length,
        codeCount: result.codeBlocks.length,
        tableCount: result.tableBlocks.length,
        formulaCount: result.formulaBlocks.length,
        actionStepCount: result.actionSteps.length,
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
