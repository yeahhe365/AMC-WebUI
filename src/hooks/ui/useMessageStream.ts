import { useCallback, useSyncExternalStore } from 'react';
import { streamingStore } from '@/stores/streamingStore';

export const useMessageStream = (messageId: string, isStreaming: boolean) => {
  const isActive = isStreaming && !!messageId;

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!isActive) {
        return () => undefined;
      }

      return streamingStore.subscribe(messageId, listener);
    },
    [isActive, messageId],
  );

  const getContentSnapshot = useCallback(() => {
    return isActive ? streamingStore.getContent(messageId) : '';
  }, [isActive, messageId]);

  const getThoughtsSnapshot = useCallback(() => {
    return isActive ? streamingStore.getThoughts(messageId) : '';
  }, [isActive, messageId]);

  const streamContent = useSyncExternalStore(subscribe, getContentSnapshot, () => '');
  const streamThoughts = useSyncExternalStore(subscribe, getThoughtsSnapshot, () => '');

  return { streamContent, streamThoughts };
};
