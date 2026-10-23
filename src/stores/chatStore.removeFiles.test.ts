import { describe, it, expect, beforeEach } from 'vitest';
import { appendModelVariant, switchMessageVariant } from '@/utils/chat/messageVariants';
import { useChatStore } from './chatStore';
import type { UploadedFile } from '@/types';

describe('chatStore.removeFilesFromStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeSessionId: 'sess-1',
      selectedFiles: [{ id: 'f-1', name: 'draft.png' } as UploadedFile],
      activeMessages: [
        {
          id: 'm-1',
          role: 'user',
          content: 'test',
          timestamp: new Date(),
          files: [{ id: 'f-1', name: 'draft.png' } as UploadedFile],
        },
      ],
      savedSessions: [
        {
          id: 'sess-1',
          title: 'Session 1',
          timestamp: 1000,
          settings: {} as any,
          messages: [
            {
              id: 'm-1',
              role: 'user',
              content: 'test',
              timestamp: new Date(),
              files: [{ id: 'f-1', name: 'draft.png' } as UploadedFile],
            },
          ],
        },
      ],
    });
  });

  it('removes target files from selectedFiles, activeMessages, and savedSessions', () => {
    useChatStore.getState().removeFilesFromStore(['f-1']);

    const state = useChatStore.getState();
    expect(state.selectedFiles).toHaveLength(0);
    expect(state.activeMessages[0].files).toBeUndefined();
    expect(state.savedSessions[0].messages[0].files).toBeUndefined();
  });

  it('ignores non-matching files', () => {
    useChatStore.getState().removeFilesFromStore(['f-nonexistent']);

    const state = useChatStore.getState();
    expect(state.selectedFiles).toHaveLength(1);
    expect(state.activeMessages[0].files).toHaveLength(1);
  });
  it('removes attachments from inactive variants so switching cannot resurrect deleted files', () => {
    const state = useChatStore.getState();
    const oldMessage = state.activeMessages[0];
    const message = appendModelVariant(oldMessage, { ...oldMessage, id: 'new', files: undefined });
    const session = { ...state.savedSessions[0], messages: [message] };
    useChatStore.setState({ activeMessages: [message], savedSessions: [session] });
    useChatStore.getState().removeFilesFromStore(['f-1']);
    const next = useChatStore.getState();
    expect(next.activeMessages[0].variants?.[0].files).toBeUndefined();
    expect(switchMessageVariant(next.savedSessions[0], 'new', 0).messages[0].files).toBeUndefined();
  });

  it('updates attachments in inactive variants along with current session attachments', () => {
    const state = useChatStore.getState();
    const oldMessage = state.activeMessages[0];
    const message = appendModelVariant(oldMessage, { ...oldMessage, id: 'new', files: undefined });
    const session = { ...state.savedSessions[0], messages: [message] };
    useChatStore.setState({ activeMessages: [message], savedSessions: [session] });
    useChatStore.getState().updateUploadedFile('f-1', { name: 'renamed.png' });
    const next = useChatStore.getState();
    expect(next.activeMessages[0].variants?.[0].files?.[0].name).toBe('renamed.png');
    expect(switchMessageVariant(next.savedSessions[0], 'new', 0).messages[0].files?.[0].name).toBe('renamed.png');
  });
});
