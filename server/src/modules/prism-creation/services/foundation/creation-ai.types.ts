export type PromptBundle = {
  scriptSegment: string;
  videoPrompt: string;
  sceneFramePrompt: string;
  firstFramePrompt: string;
  lastFramePrompt: string;
};

export type CurrentNodeContext = {
  scriptSegment: string;
  prompt: string;
  orderIndex: number;
};

export type FirstNodeIdeaPreview = {
  title: string;
  openingScene: string;
  progressionBeat: string;
  styleNotes: string;
  confirmationChecklist: string[];
  promptBundle: PromptBundle;
};
