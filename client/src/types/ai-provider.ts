export type AITaskType = 'asr' | 'llm_chat' | 'multimodal' | 'image_gen' | 'video_gen' | 'tts' | 'voice_clone' | 'translation';

export interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl?: string;
}
