export type KnowledgeAssetBlock = {
  id: string;
  text: string;
  source: 'script' | 'prompt' | 'mixed';
};

export type KnowledgeAssetDto = {
  summaryBlocks: KnowledgeAssetBlock[];
  codeBlocks: KnowledgeAssetBlock[];
  tableBlocks: KnowledgeAssetBlock[];
  formulaBlocks: KnowledgeAssetBlock[];
  actionSteps: KnowledgeAssetBlock[];
  version: string;
};
