export const EVALUATION_RULES_VERSION = 'v1.0.0';

export const VISUAL_ANCHOR_TERMS = [
  '图表',
  '代码',
  '架构',
  '数据',
  '公式',
  '界面',
  '看板',
  '导图',
  '白板',
  '文字',
  'ui',
  'chart',
  'code',
  'matrix',
  'graph',
  'dashboard',
];

export const CAMERA_ACTION_TERMS = [
  '推镜',
  '特写',
  '分屏',
  '聚焦',
  '放大',
  '演进',
  '展开',
  '平移',
  '摇镜',
  '跟拍',
  '转场',
  'zoom',
  'pan',
  'focus',
  'split',
  'track',
  'follow',
];

export const LAYOUT_SIGNAL_TERMS = [
  '左侧',
  '右侧',
  '居中',
  '分栏',
  '上下',
  '网格',
  '主标题',
  '副标题',
  '高亮',
  '对比',
  '层级',
  '布局',
  'layout',
  'highlight',
  'grid',
];

export const EVALUATION_WEIGHTS = {
  promptCompleteness: 1,
  continuity: 1,
  renderStability: 1,
  subjectConsistency: 1,
} as const;

export function matchAnyTerm(text: string, terms: string[]): boolean {
  const escaped = terms
    .filter(Boolean)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!escaped) return false;
  const regex = new RegExp(`(${escaped})`, 'i');
  return regex.test(text);
}
