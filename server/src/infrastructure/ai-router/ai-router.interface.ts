export enum AITaskType {
  ASR = 'asr',
  LLM_CHAT = 'llm_chat',
  MULTIMODAL = 'multimodal',
  IMAGE_GEN = 'image_gen',
  VIDEO_GEN = 'video_gen',
  TTS = 'tts',
  VOICE_CLONE = 'voice_clone',
  TRANSLATION = 'translation',
}

export interface AIProvider {
  name: string;
  supportedTasks: AITaskType[];
  execute(taskType: AITaskType, payload: any, apiKey: string): Promise<any>;
  testConnection(apiKey: string): Promise<boolean>;
}
