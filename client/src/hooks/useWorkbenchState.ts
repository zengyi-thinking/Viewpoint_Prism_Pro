import { useWorkbenchStore } from '@/stores/workbench.store';

export function useWorkbenchState() {
  return useWorkbenchStore();
}
