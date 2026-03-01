import { useChatStore } from '@/stores/chat.store';

export function useChat() {
  return useChatStore();
}
