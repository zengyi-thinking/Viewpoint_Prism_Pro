import { create } from 'zustand';
import type { VideoSource } from '@/services/video.api';

export type WorkbenchState = 'idle' | 'videoReady' | 'prismActive' | 'taskRunning' | 'reviewing' | 'exportReady' | 'failed';
export type PrismType = 'knowledge' | 'creation' | 'translation' | 'diffraction' | null;

interface WorkbenchStore {
  // Original state
  state: WorkbenchState;
  activePrism: PrismType;
  currentVideoId: string | null;

  // New: Video selection for analysis (checkbox selection)
  selectedVideoIds: string[];

  // New: Current playing video object (for PlayerCenter)
  currentVideo: VideoSource | null;
  seekRequest: { timestamp: number; nonce: number } | null;

  // Original setters
  setState: (state: WorkbenchState) => void;
  setActivePrism: (prism: PrismType) => void;
  setCurrentVideoId: (videoId: string | null) => void;

  // New: Video selection actions
  toggleVideoSelection: (videoId: string) => void;
  selectMultipleVideos: (videoIds: string[]) => void;
  clearVideoSelection: () => void;

  // New: Current video player actions
  setCurrentVideo: (video: VideoSource | null) => void;
  requestSeekTo: (timestamp: number) => void;
  clearSeekRequest: () => void;
}

export const useWorkbenchStore = create<WorkbenchStore>((set) => ({
  // Original initial state
  state: 'idle',
  activePrism: null,
  currentVideoId: null,

  // New initial state
  selectedVideoIds: [],
  currentVideo: null,
  seekRequest: null,

  // Original setters
  setState: (state) => set({ state }),
  setActivePrism: (activePrism) => set({ activePrism, state: activePrism ? 'prismActive' : 'videoReady' }),
  setCurrentVideoId: (currentVideoId) => set({ currentVideoId, state: currentVideoId ? 'videoReady' : 'idle' }),

  // New: Toggle single video selection (like checkbox)
  toggleVideoSelection: (videoId) =>
    set((state) => {
      const isSelected = state.selectedVideoIds.includes(videoId);
      return {
        selectedVideoIds: isSelected
          ? state.selectedVideoIds.filter((id) => id !== videoId)
          : [...state.selectedVideoIds, videoId],
      };
    }),

  // New: Select multiple videos at once (e.g., select all)
  selectMultipleVideos: (videoIds) => set({ selectedVideoIds: videoIds }),

  // New: Clear all selections
  clearVideoSelection: () => set({ selectedVideoIds: [] }),

  // New: Set current playing video
  setCurrentVideo: (currentVideo) =>
    set({
      currentVideo,
      currentVideoId: currentVideo?.id ?? null,
      state: currentVideo ? 'videoReady' : 'idle',
    }),

  requestSeekTo: (timestamp) =>
    set((state) => ({
      seekRequest: {
        timestamp,
        nonce: (state.seekRequest?.nonce ?? 0) + 1,
      },
    })),

  clearSeekRequest: () => set({ seekRequest: null }),
}));
