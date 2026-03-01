import { create } from 'zustand';

export type WorkbenchState = 'idle' | 'videoReady' | 'prismActive' | 'taskRunning' | 'reviewing' | 'exportReady' | 'failed';
export type PrismType = 'knowledge' | 'creation' | 'translation' | 'diffraction' | null;

interface WorkbenchStore {
  state: WorkbenchState;
  activePrism: PrismType;
  currentVideoId: string | null;
  setState: (state: WorkbenchState) => void;
  setActivePrism: (prism: PrismType) => void;
  setCurrentVideo: (videoId: string | null) => void;
}

export const useWorkbenchStore = create<WorkbenchStore>((set) => ({
  state: 'idle',
  activePrism: null,
  currentVideoId: null,
  setState: (state) => set({ state }),
  setActivePrism: (activePrism) => set({ activePrism, state: activePrism ? 'prismActive' : 'videoReady' }),
  setCurrentVideo: (currentVideoId) => set({ currentVideoId, state: currentVideoId ? 'videoReady' : 'idle' }),
}));
