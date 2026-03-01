import { useWorkbenchStore } from '@/stores/workbench.store';

export function usePrismPanel() {
  const { activePrism, setActivePrism } = useWorkbenchStore();
  return { activePrism, setActivePrism };
}
