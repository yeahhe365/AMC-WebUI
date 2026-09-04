import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedChatSession } from '@/types';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { autoTitleSession, hasNonOverridableTitle, isSessionAutoTitleEligible } from './autoTitleSession';
import { generateSessionTitle } from '@/utils/chat/session';

const { generateTitleApiMock, getGeminiKeyForRequestMock, mockDbGetSession } = vi.hoisted(() => ({
  generateTitleApiMock: vi.fn(),
  getGeminiKeyForRequestMock: vi.fn(),
  mockDbGetSession: vi.fn(),
}));

vi.mock('@/services/api/generation/textApi', () => ({
  generateTitleApi: generateTitleApiMock,
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getGeminiKeyForRequest: getGeminiKeyForRequestMock,
}));

vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('@/test/doubles/moduleMocks');

  return createDbServiceMockModule({
    getSession: mockDbGetSession,
    getSessionMetadataOnly: mockDbGetSession,
  });
});

const makeUserMessage = (content: string) => ({
  id: `user-${content.length}`,
  role: 'user' as const,
  content,
  timestamp: new Date('2026-05-09T00:00:00.000Z'),
});

const makeModelMessage = (content: string) => ({
  id: 'model-1',
  role: 'model' as const,
  content,
  timestamp: new Date('2026-05-09T00:00:01.000Z'),
});

const createSession = (overrides: Partial<SavedChatSession> = {}): SavedChatSession => ({
  id: 'session-1',
  title: 'New Chat',
  timestamp: 1,
  settings: { ...DEFAULT_APP_SETTINGS, modelId: 'gemini-3-flash-preview' },
  messages: [makeUserMessage('Explain routing'), makeModelMessage('Routing decides which handler receives a request.')],
  ...overrides,
});

const updateAndPersistSessions = vi.fn(
  (updater: (prev: SavedChatSession[]) => SavedChatSession[], _options?: { persist?: boolean }) => {
    sessions = updater(sessions);
  },
);
let sessions: SavedChatSession[];

describe('isSessionAutoTitleEligible', () => {
  it('accepts a default session with a completed exchange', () => {
    expect(isSessionAutoTitleEligible(createSession())).toBe(true);
  });

  it('rejects auto-titled sessions', () => {
    expect(isSessionAutoTitleEligible(createSession({ title: 'AI Title', titleSource: 'auto' }))).toBe(false);
  });

  it('rejects manually renamed sessions', () => {
    expect(isSessionAutoTitleEligible(createSession({ title: 'My Title', titleSource: 'manual' }))).toBe(false);
  });

  it('keeps a default session eligible after the first message is edited', () => {
    const edited = createSession({ titleSource: 'default' });
    // Simulate editing the first user message: content changed, title is now a
    // fresh heuristic that no longer matches the original exchange.
    const editedMessage = makeUserMessage('Completely different wording here');
    const editedSession: SavedChatSession = {
      ...edited,
      messages: [editedMessage, edited.messages[1]],
    };
    // The pre-refactor string-coincidence check would reject this; titleSource
    // now makes it eligible.
    expect(editedSession.title).not.toBe(generateSessionTitle(editedSession.messages));
    expect(isSessionAutoTitleEligible(editedSession)).toBe(true);
  });

  it('infers legacy manual titles from heuristic mismatch', () => {
    const legacy = createSession({ titleSource: undefined, title: 'Custom legacy title' });
    expect(isSessionAutoTitleEligible(legacy)).toBe(false);
  });

  it('accepts legacy sessions whose title matches the pre-refactor heuristic', () => {
    const longCjk = '这是一个没有任何空格的很长很长的中文句子用来测试标题的字符截断逻辑是否正确生效';
    // Pre-refactor heuristic: whole spaceless message becomes the title.
    const legacy = createSession({
      titleSource: undefined,
      title: longCjk,
      messages: [makeUserMessage(longCjk), makeModelMessage('好')],
    });
    expect(isSessionAutoTitleEligible(legacy)).toBe(true);
  });

  it('requires a completed (non-loading, non-stopped) exchange', () => {
    const loading = createSession({
      messages: [makeUserMessage('hi'), { ...makeModelMessage('thinking...'), isLoading: true }],
    });
    expect(isSessionAutoTitleEligible(loading)).toBe(false);
    const stopped = createSession({
      messages: [makeUserMessage('hi'), { ...makeModelMessage('partial'), stoppedByUser: true }],
    });
    expect(isSessionAutoTitleEligible(stopped)).toBe(false);
  });
});

describe('hasNonOverridableTitle', () => {
  it('treats auto/manual/undefined-mismatch as protected', () => {
    expect(hasNonOverridableTitle(createSession({ titleSource: 'auto' }))).toBe(true);
    expect(hasNonOverridableTitle(createSession({ titleSource: 'manual' }))).toBe(true);
    expect(hasNonOverridableTitle(createSession({ titleSource: undefined, title: 'Legacy custom' }))).toBe(true);
    expect(hasNonOverridableTitle(createSession({ titleSource: undefined, title: 'New Chat' }))).toBe(false);
  });
});

describe('autoTitleSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGeminiKeyForRequestMock.mockReturnValue({ key: 'gemini-key', isNewKey: true });
    generateTitleApiMock.mockResolvedValue('Routing Basics');
    sessions = [createSession()];
    mockDbGetSession.mockImplementation(async (sessionId: string) => sessions.find((s) => s.id === sessionId) ?? null);
  });

  it('truncates long content before calling the title API and tags titleSource auto', async () => {
    const longContent = 'x'.repeat(5000);
    const session = createSession({
      messages: [makeUserMessage(longContent), makeModelMessage('short')],
    });
    sessions = [session];

    const result = await autoTitleSession({
      session,
      appSettings: DEFAULT_APP_SETTINGS,
      language: 'en',
      updateAndPersistSessions,
    });

    expect(result).toBe(true);
    expect(generateTitleApiMock).toHaveBeenCalledWith('gemini-key', `${longContent.slice(0, 2000)}…`, 'short', 'en');
    expect(sessions[0].title).toBe('Routing Basics');
    expect(sessions[0].titleSource).toBe('auto');
  });

  it('writes the heuristic fallback and keeps titleSource default when the API errors', async () => {
    generateTitleApiMock.mockRejectedValue(new Error('API down'));
    const session = createSession({ title: 'New Chat' });
    sessions = [session];

    const result = await autoTitleSession({
      session,
      appSettings: DEFAULT_APP_SETTINGS,
      language: 'en',
      updateAndPersistSessions,
    });

    expect(result).toBe(true);
    expect(sessions[0].title).toBe('Explain routing');
    expect(sessions[0].titleSource).toBe('default');
  });

  it('writes the heuristic fallback (titleSource stays default) when the API returns an empty string', async () => {
    generateTitleApiMock.mockResolvedValue('');
    const session = createSession({ title: 'New Chat' });
    sessions = [session];

    const result = await autoTitleSession({
      session,
      appSettings: DEFAULT_APP_SETTINGS,
      language: 'en',
      updateAndPersistSessions,
    });

    // Unified failure semantics: the empty API response also falls back to the
    // heuristic title, keeping titleSource 'default' so a later retry can still
    // produce an AI title.
    expect(result).toBe(true);
    expect(sessions[0].title).toBe('Explain routing');
    expect(sessions[0].titleSource).toBe('default');
  });

  it('skips when another tab already auto-titled the session', async () => {
    const session = createSession({ title: 'Routing Basics', titleSource: 'auto' });
    sessions = [session];

    const result = await autoTitleSession({
      session,
      appSettings: DEFAULT_APP_SETTINGS,
      language: 'en',
      updateAndPersistSessions,
    });

    expect(result).toBe(false);
    expect(generateTitleApiMock).not.toHaveBeenCalled();
  });

  it('skips when the title changed mid-flight (write-back re-check)', async () => {
    const session = createSession({ title: 'New Chat' });
    sessions = [session];
    // The user renames while the API call is pending.
    mockDbGetSession.mockImplementation(async (sessionId: string) =>
      sessions.find((s) => s.id === sessionId)?.id === sessionId
        ? { ...sessions.find((s) => s.id === sessionId)!, title: 'User Renamed', titleSource: 'manual' }
        : null,
    );

    const result = await autoTitleSession({
      session,
      appSettings: DEFAULT_APP_SETTINGS,
      language: 'en',
      updateAndPersistSessions,
    });

    expect(result).toBe(false);
    expect(sessions[0].title).toBe('New Chat');
    expect(sessions[0].titleSource).toBeUndefined();
  });

  it('titles an in-flight exchange once its content passes the title truncation threshold', async () => {
    // A streaming model reply long enough that title input is already capped:
    // auto-titling may start early instead of waiting for the stream to end.
    const longModelContent = 'x'.repeat(2500);
    const session = createSession({
      title: 'New Chat',
      messages: [makeUserMessage('Build a landing page'), { ...makeModelMessage(longModelContent), isLoading: true }],
    });
    sessions = [session];

    const result = await autoTitleSession({
      session,
      appSettings: DEFAULT_APP_SETTINGS,
      language: 'en',
      updateAndPersistSessions,
    });

    expect(result).toBe(true);
    // Only the first 2000 chars are sent to the title API.
    expect(generateTitleApiMock).toHaveBeenCalledWith(
      'gemini-key',
      'Build a landing page',
      `${longModelContent.slice(0, 2000)}…`,
      'en',
    );
    expect(sessions[0].title).toBe('Routing Basics');
    expect(sessions[0].titleSource).toBe('auto');
  });

  it('does not write a heuristic fallback for an in-flight exchange', async () => {
    // When the model is still streaming (early title attempt) and the API fails,
    // no heuristic fallback is written — the partial content would make a bad
    // title, and the finished exchange will retry later.
    const longModelContent = 'x'.repeat(2500);
    const session = createSession({
      title: 'New Chat',
      messages: [makeUserMessage('Build a landing page'), { ...makeModelMessage(longModelContent), isLoading: true }],
    });
    sessions = [session];
    generateTitleApiMock.mockRejectedValue(new Error('API down'));

    const result = await autoTitleSession({
      session,
      appSettings: DEFAULT_APP_SETTINGS,
      language: 'en',
      updateAndPersistSessions,
    });

    expect(result).toBe(false);
    expect(sessions[0].title).toBe('New Chat');
    expect(sessions[0].titleSource).toBeUndefined();
  });
});
