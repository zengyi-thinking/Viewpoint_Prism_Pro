import { create } from 'zustand';

interface SettingsStore {
  apiKeys: Record<string, string>;
  preferences: Record<string, string>;
  setApiKey: (provider: string, key: string) => void;
  setPreference: (taskType: string, provider: string) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  apiKeys: {},
  preferences: {},
  setApiKey: (provider, key) => set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
  setPreference: (taskType, provider) => set((s) => ({ preferences: { ...s.preferences, [taskType]: provider } })),
}));
