export type PrismType = 'knowledge' | 'creation' | 'translation' | 'diffraction';

export interface FlowNode {
  id: string;
  orderIndex: number;
  prompt?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  renderedVideoUrl?: string;
  renderStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}
