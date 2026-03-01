import { usePlayerStore } from '@/stores/player.store';

export function useVideoPlayer() {
  return usePlayerStore();
}
