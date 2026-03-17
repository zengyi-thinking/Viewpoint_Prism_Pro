import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type VendorPreset = 'siliconflow-lite' | 'zhenzhen-pro' | 'google-suite' | 'custom-compatible';
export type CapabilityTab = 'chat' | 'image' | 'video' | 'audio' | 'tools';
export type VendorFamily = 'siliconflow' | 'zhenzhen' | 'google' | 'compatible';

export interface VendorGlobalConfig {
  label: string;
  baseUrl: string;
  apiKey: string;
}

export interface ModelProfile {
  id: string;
  name: string;
  family: VendorFamily;
  capability: CapabilityTab;
  modelId: string;
  description: string;
  tag: string;
  enabled: boolean;
  useGlobalBase: boolean;
  useGlobalKey: boolean;
  baseUrl: string;
  apiKey: string;
}

interface ModelCatalogState {
  selectedPreset: VendorPreset;
  globals: Record<VendorFamily, VendorGlobalConfig>;
  profiles: ModelProfile[];
  setPreset: (preset: VendorPreset) => void;
  updateGlobal: (family: VendorFamily, patch: Partial<VendorGlobalConfig>) => void;
  updateProfile: (id: string, patch: Partial<ModelProfile>) => void;
  addCustomProfile: (capability: CapabilityTab) => void;
  resetCatalog: () => void;
}

const DEFAULT_GLOBALS: Record<VendorFamily, VendorGlobalConfig> = {
  siliconflow: {
    label: '硅基流动低配版',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
  },
  zhenzhen: {
    label: '贞贞工坊高配版',
    baseUrl: 'https://ai.t8star.cn/v1',
    apiKey: '',
  },
  google: {
    label: '谷歌全家桶',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: '',
  },
  compatible: {
    label: '兼容模型',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
  },
};

const DEFAULT_PROFILES: ModelProfile[] = [
  {
    id: 'sf-chat',
    name: 'SiliconFlow Lite Chat',
    family: 'siliconflow',
    capability: 'chat',
    modelId: 'Qwen/Qwen2.5-7B-Instruct',
    description: '低成本对话与总结，适合作为日常默认链路。',
    tag: 'Chat',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'zz-chat',
    name: '贞贞工坊 Pro Chat',
    family: 'zhenzhen',
    capability: 'chat',
    modelId: 'gpt-4o',
    description: '高配对话与复杂推理，适合创作导演和高质量草稿。',
    tag: 'Chat',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'gg-chat',
    name: 'Gemini Flash',
    family: 'google',
    capability: 'chat',
    modelId: 'gemini-2.5-flash',
    description: '谷歌全家桶默认聊天模型，响应快，覆盖通用任务。',
    tag: 'Chat',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'compat-chat',
    name: 'Compatible Chat Custom',
    family: 'compatible',
    capability: 'chat',
    modelId: 'your-chat-model',
    description: '兼容 OpenAI 格式的自定义对话模型。',
    tag: 'Chat',
    enabled: false,
    useGlobalBase: false,
    useGlobalKey: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
  },
  {
    id: 'sf-image',
    name: 'FLUX Schnell',
    family: 'siliconflow',
    capability: 'image',
    modelId: 'black-forest-labs/FLUX.1-schnell',
    description: '低配生图，适合封面草图、风格摸底。',
    tag: 'Image',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'zz-image',
    name: 'Nano Banana Pro',
    family: 'zhenzhen',
    capability: 'image',
    modelId: 'nano-banana-pro',
    description: '高配生图，偏成片感与商业视觉表达。',
    tag: 'Image',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'gg-image',
    name: 'Gemini Image',
    family: 'google',
    capability: 'image',
    modelId: 'gemini-2.5-flash-image',
    description: '谷歌图像生成能力，适合多模态联动。',
    tag: 'Image',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'compat-image',
    name: 'Compatible Image Custom',
    family: 'compatible',
    capability: 'image',
    modelId: 'your-image-model',
    description: '任意兼容 OpenAI 或中转站格式的生图模型。',
    tag: 'Image',
    enabled: false,
    useGlobalBase: false,
    useGlobalKey: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
  },
  {
    id: 'sf-video',
    name: 'Wan 2.2 Fast',
    family: 'siliconflow',
    capability: 'video',
    modelId: 'Wan-AI/Wan2.2-T2V-A14B',
    description: '低配视频生成，优先兼顾成本和可用性。',
    tag: 'Video',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'zz-video',
    name: '贞贞工坊 Veo Layer',
    family: 'zhenzhen',
    capability: 'video',
    modelId: 'veo-3.1-fast',
    description: '高配视频与镜头生成，适合关键演示资产。',
    tag: 'Video',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'gg-video',
    name: 'Gemini Veo',
    family: 'google',
    capability: 'video',
    modelId: 'veo-3.1-generate-preview',
    description: '谷歌视频能力入口，保留与 Google 套餐的一致性。',
    tag: 'Video',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'compat-video',
    name: 'Compatible Video Custom',
    family: 'compatible',
    capability: 'video',
    modelId: 'your-video-model',
    description: '兼容中转站或私有部署的视频模型配置。',
    tag: 'Video',
    enabled: false,
    useGlobalBase: false,
    useGlobalKey: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
  },
  {
    id: 'sf-audio',
    name: 'CosyVoice Runtime',
    family: 'siliconflow',
    capability: 'audio',
    modelId: 'FunAudioLLM/CosyVoice2-0.5B',
    description: '低配音频链路，适合 TTS 和基础配音。',
    tag: 'Audio',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'zz-audio',
    name: '贞贞工坊 Voice Pro',
    family: 'zhenzhen',
    capability: 'audio',
    modelId: 'gpt-4o-mini-tts',
    description: '高配语音输出，适合旁白与成片试听。',
    tag: 'Audio',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'gg-audio',
    name: 'Gemini Voice',
    family: 'google',
    capability: 'audio',
    modelId: 'gemini-2.5-flash-preview-tts',
    description: '谷歌语音能力，适合多模态一体化流水线。',
    tag: 'Audio',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'compat-audio',
    name: 'Compatible Audio Custom',
    family: 'compatible',
    capability: 'audio',
    modelId: 'your-audio-model',
    description: '兼容 TTS、ASR 或音频增强接口的自定义模型。',
    tag: 'Audio',
    enabled: false,
    useGlobalBase: false,
    useGlobalKey: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
  },
  {
    id: 'sf-tools',
    name: 'SenseVoice ASR',
    family: 'siliconflow',
    capability: 'tools',
    modelId: 'FunAudioLLM/SenseVoiceSmall',
    description: '低配识别与结构化提取工具链。',
    tag: 'Tools',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'gg-tools',
    name: 'Gemini Utility',
    family: 'google',
    capability: 'tools',
    modelId: 'gemini-2.5-pro',
    description: '谷歌高级工具链，用于复杂校对与结构修复。',
    tag: 'Tools',
    enabled: true,
    useGlobalBase: true,
    useGlobalKey: true,
    baseUrl: '',
    apiKey: '',
  },
  {
    id: 'compat-tools',
    name: 'Compatible Tool Custom',
    family: 'compatible',
    capability: 'tools',
    modelId: 'your-tool-model',
    description: '兼容中转站、私有工具服务和脚本型 API。',
    tag: 'Tools',
    enabled: false,
    useGlobalBase: false,
    useGlobalKey: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
  },
];

function createCustomProfile(capability: CapabilityTab, index: number): ModelProfile {
  return {
    id: `custom-${capability}-${Date.now()}-${index}`,
    name: `Custom ${capability.toUpperCase()} ${index}`,
    family: 'compatible',
    capability,
    modelId: `your-${capability}-model-${index}`,
    description: '用户自定义兼容模型。',
    tag: capability.toUpperCase(),
    enabled: true,
    useGlobalBase: false,
    useGlobalKey: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
  };
}

export const useModelCatalogStore = create<ModelCatalogState>()(
  persist(
    (set, get) => ({
      selectedPreset: 'siliconflow-lite',
      globals: DEFAULT_GLOBALS,
      profiles: DEFAULT_PROFILES,
      setPreset: (preset) => set({ selectedPreset: preset }),
      updateGlobal: (family, patch) =>
        set((state) => ({
          globals: {
            ...state.globals,
            [family]: {
              ...state.globals[family],
              ...patch,
            },
          },
        })),
      updateProfile: (id, patch) =>
        set((state) => ({
          profiles: state.profiles.map((profile) =>
            profile.id === id ? { ...profile, ...patch } : profile,
          ),
        })),
      addCustomProfile: (capability) =>
        set((state) => {
          const count =
            state.profiles.filter(
              (profile) => profile.family === 'compatible' && profile.capability === capability,
            ).length + 1;
          return {
            profiles: [...state.profiles, createCustomProfile(capability, count)],
          };
        }),
      resetCatalog: () =>
        set({
          selectedPreset: 'siliconflow-lite',
          globals: DEFAULT_GLOBALS,
          profiles: DEFAULT_PROFILES,
        }),
    }),
    {
      name: 'vpp-model-catalog-storage',
      partialize: (state) => ({
        selectedPreset: state.selectedPreset,
        globals: state.globals,
        profiles: state.profiles,
      }),
    },
  ),
);
