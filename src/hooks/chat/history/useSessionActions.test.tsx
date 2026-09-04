import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, SavedChatSession, UploadedFile } from '@/types';
import { dbService } from '@/services/db/dbService';
import { createChatSettings } from '@/test/data/factories';
import { useSessionActions } from './useSessionActions';
import { renderHook } from '@/test/render/renderer';
import { useSettingsStore } from '@/stores/settingsStore';

vi.mock('@/utils/chat/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/chat/session')>();

  return {
    ...actual,
    createNewSession: vi.fn((settings, messages, title) => ({
      id: `copy-${Math.random().toString(36).slice(2, 8)}`,
      title,
      messages,
      settings,
      timestamp: Date.now(),
    })),
  };
});

vi.mock('@/utils/file/filePreviewUrls', () => ({
  cleanupFilePreviewUrls: vi.fn(),
}));

vi.mock('@/utils/chat/ids', () => ({
  generateUniqueId: vi.fn(() => `generated-${Math.random().toString(36).slice(2, 8)}`),
}));

const createFile = (overrides: Partial<UploadedFile> = {}): UploadedFile => ({
  id: 'file-1',
  name: 'notes.txt',
  type: 'text/plain',
  size: 5,
  rawFile: new File(['hello'], 'notes.txt', { type: 'text/plain' }),
  ...overrides,
});

const createMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'message-1',
  role: 'user',
  content: 'hello',
  timestamp: new Date('2026-04-19T00:00:00.000Z'),
  files: [createFile()],
  ...overrides,
});

const createSession = (overrides: Partial<SavedChatSession> = {}): SavedChatSession => ({
  id: 'session-1',
  title: 'Original',
  timestamp: 1,
  messages: [createMessage()],
  settings: createChatSettings(),
  ...overrides,
});

describe('useSessionActions', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'en' });
  });

  it('duplicates attachments with fresh file ids', async () => {
    let sessions: SavedChatSession[] = [createSession()];
    vi.mocked(dbService.getSession).mockResolvedValue(sessions[0]);
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });

    const { result, unmount } = renderHook(() =>
      useSessionActions({
        updateAndPersistSessions,
        activeJobs: { current: new Map() },
      }),
    );

    await act(async () => {
      await result.current.handleDuplicateSession('session-1');
    });

    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).not.toBe('session-1');
    expect(sessions[0].messages[0].id).not.toBe(sessions[1].messages[0].id);
    expect(sessions[0].messages[0].files?.[0].id).not.toBe(sessions[1].messages[0].files?.[0].id);

    unmount();
  });

  it('remaps internal tool message parent ids when duplicating a session', async () => {
    const toolCallMessage = createMessage({
      id: 'tool-model-1',
      role: 'model',
      content: '',
      isInternalToolMessage: true,
      toolParentMessageId: 'model-1',
      apiParts: [{ functionCall: { id: 'call-1', name: 'run_local_python', args: { code: 'print(42)' } } }],
      files: undefined,
    });
    const modelMessage = createMessage({
      id: 'model-1',
      role: 'model',
      content: 'The answer is 42.',
      files: undefined,
    });
    let sessions: SavedChatSession[] = [
      createSession({
        messages: [createMessage({ id: 'user-1', files: undefined }), toolCallMessage, modelMessage],
      }),
    ];
    vi.mocked(dbService.getSession).mockResolvedValue(sessions[0]);
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });

    const { result, unmount } = renderHook(() =>
      useSessionActions({
        updateAndPersistSessions,
        activeJobs: { current: new Map() },
      }),
    );

    await act(async () => {
      await result.current.handleDuplicateSession('session-1');
    });

    const duplicatedToolMessage = sessions[0].messages.find((message) => message.isInternalToolMessage);
    const duplicatedModelMessage = sessions[0].messages.find((message) => message.content === 'The answer is 42.');
    expect(duplicatedToolMessage?.toolParentMessageId).toBe(duplicatedModelMessage?.id);
    expect(duplicatedToolMessage?.toolParentMessageId).not.toBe('model-1');

    unmount();
  });

  it('duplicates a metadata-only session using the persisted full history', async () => {
    const persistedSession = createSession({
      id: 'session-2',
      title: 'Persisted',
      messages: [createMessage({ id: 'persisted-message' })],
    });
    let sessions: SavedChatSession[] = [{ ...persistedSession, messages: [] }];
    vi.mocked(dbService.getSession).mockResolvedValue(persistedSession);

    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });

    const { result, unmount } = renderHook(() =>
      useSessionActions({
        updateAndPersistSessions,
        activeJobs: { current: new Map() },
      }),
    );

    await act(async () => {
      await result.current.handleDuplicateSession('session-2');
    });

    expect(sessions).toHaveLength(2);
    expect(sessions[0].title).toBe('Persisted (Copy)');
    expect(sessions[0].messages).toHaveLength(1);
    expect(sessions[0].messages[0].content).toBe('hello');

    unmount();
  });

  it('localizes the default new chat title when duplicating in Chinese', async () => {
    useSettingsStore.setState({ language: 'zh' });
    let sessions: SavedChatSession[] = [createSession({ title: 'New Chat' })];
    vi.mocked(dbService.getSession).mockResolvedValue(sessions[0]);
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });

    const { result, unmount } = renderHook(() =>
      useSessionActions({
        updateAndPersistSessions,
        activeJobs: { current: new Map() },
      }),
    );

    await act(async () => {
      await result.current.handleDuplicateSession('session-1');
    });

    expect(sessions[0].title).toBe('新聊天（副本）');
    unmount();
  });
});
