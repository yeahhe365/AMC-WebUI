import { describe, it, expect } from 'vitest';
import {
  attachPersistedSessionFiles,
  createMessage,
  createNewSession,
  extractPersistedSessionFileRecords,
  generateSessionTitle,
  performOptimisticSessionUpdate,
  serializeMessageForPortableExport,
  stripSessionFilePayloads,
} from './session';
import { type ChatMessage, type SavedChatSession, type ChatSettings, type PersistedSessionFileRecord } from '@/types';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { createSavedChatSessionMetadata, createUploadedFile } from '@/test/data/factories';

const makeMessage = (role: 'user' | 'model' | 'error', content: string, extra?: Partial<ChatMessage>): ChatMessage => ({
  id: `msg-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  timestamp: new Date(),
  ...extra,
});

const makeSettings = (overrides?: Partial<ChatSettings>): ChatSettings => ({
  ...DEFAULT_CHAT_SETTINGS,
  ...overrides,
});

const makeSession = (overrides?: Partial<SavedChatSession>): SavedChatSession =>
  createSavedChatSessionMetadata({
    id: 'sess-1',
    title: 'Test Session',
    settings: makeSettings(),
    timestamp: Date.now(),
    ...overrides,
  });

// ── createMessage ──

describe('createMessage', () => {
  it('creates a message with required fields', () => {
    const msg = createMessage('user', 'Hello');
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello');
    expect(msg.id).toBeTruthy();
    expect(msg.timestamp).toBeInstanceOf(Date);
  });

  it('accepts optional overrides', () => {
    const msg = createMessage('model', 'Response', { thoughts: 'thinking...' });
    expect(msg.thoughts).toBe('thinking...');
  });

  it('uses provided id and timestamp', () => {
    const ts = new Date('2024-01-01');
    const msg = createMessage('user', 'Hi', { id: 'custom-id', timestamp: ts });
    expect(msg.id).toBe('custom-id');
    expect(msg.timestamp).toBe(ts);
  });
});

// ── createNewSession ──

describe('createNewSession', () => {
  it('creates a session with defaults', () => {
    const session = createNewSession(makeSettings());
    expect(session.id).toBeTruthy();
    expect(session.title).toBe('New Chat');
    expect(session.messages).toEqual([]);
    expect(session.groupId).toBeNull();
  });

  it('uses provided title and messages', () => {
    const msgs = [makeMessage('user', 'Hi')];
    const session = createNewSession(makeSettings(), msgs, 'My Chat');
    expect(session.title).toBe('My Chat');
    expect(session.messages).toHaveLength(1);
  });

  it('sets groupId when provided', () => {
    const session = createNewSession(makeSettings(), [], 'Title', 'group-1');
    expect(session.groupId).toBe('group-1');
  });
});

// ── generateSessionTitle ──

describe('generateSessionTitle', () => {
  it('returns "New Chat" for empty messages', () => {
    expect(generateSessionTitle([])).toBe('New Chat');
  });

  it('uses first user message (first 7 words)', () => {
    const msgs = [makeMessage('user', 'How to write a unit test for React components properly')];
    expect(generateSessionTitle(msgs)).toBe('How to write a unit test for...');
  });

  it('does not add ellipsis when 7 words or fewer', () => {
    const msgs = [makeMessage('user', 'Hello world')];
    expect(generateSessionTitle(msgs)).toBe('Hello world');
  });

  it('falls back to model message (first 7 words) when no user message', () => {
    const msgs = [makeMessage('model', 'Here is a detailed response for you to read later')];
    expect(generateSessionTitle(msgs)).toBe('Model: Here is a detailed response for you...');
  });

  it('returns short spaceless text as-is', () => {
    const msgs = [makeMessage('user', '你好世界')];
    expect(generateSessionTitle(msgs)).toBe('你好世界');
  });

  it('truncates spaceless CJK text to 30 characters', () => {
    const longCjk = '这是一个没有任何空格的很长很长的中文句子用来测试标题的字符截断逻辑是否正确生效';
    const msgs = [makeMessage('user', longCjk)];
    const title = generateSessionTitle(msgs);
    expect(title.length).toBeLessThanOrEqual(31);
    expect(title).toBe(`${longCjk.slice(0, 30)}…`);
  });

  it('falls back to file name when no text messages', () => {
    const msgs = [makeMessage('user', '', { files: [createUploadedFile({ name: 'report.pdf' })] })];
    expect(generateSessionTitle(msgs)).toBe('Chat with report.pdf');
  });

  it('ignores internal tool messages when generating a title', () => {
    const msgs = [
      makeMessage('user', 'Plot sales by month for this CSV'),
      makeMessage('model', '', { isInternalToolMessage: true }),
      makeMessage('user', '', { isInternalToolMessage: true }),
      makeMessage('model', 'Here is the chart and analysis.'),
    ];

    expect(generateSessionTitle(msgs)).toBe('Plot sales by month for this CSV');
  });
});

// ── performOptimisticSessionUpdate ──

describe('performOptimisticSessionUpdate', () => {
  it('creates a new session when activeSessionId not found', () => {
    const result = performOptimisticSessionUpdate([], {
      activeSessionId: null,
      newSessionId: 'new-1',
      newMessages: [makeMessage('user', 'Hello')],
      settings: makeSettings(),
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('new-1');
    expect(result[0].messages).toHaveLength(1);
  });

  it('updates an existing session by appending messages', () => {
    const existing = makeSession({
      id: 'sess-1',
      messages: [makeMessage('user', 'First')],
    });
    const result = performOptimisticSessionUpdate([existing], {
      activeSessionId: 'sess-1',
      newSessionId: 'sess-1',
      newMessages: [makeMessage('model', 'Reply')],
      settings: makeSettings(),
    });
    expect(result).toHaveLength(1);
    expect(result[0].messages).toHaveLength(2);
  });

  it('handles edit mode by truncating at editingMessageId', () => {
    const msg1 = makeMessage('user', 'First');
    const msg2 = makeMessage('model', 'Reply');
    const msg3 = makeMessage('user', 'Second');
    const existing = makeSession({
      id: 'sess-1',
      messages: [msg1, msg2, msg3],
    });
    const result = performOptimisticSessionUpdate([existing], {
      activeSessionId: 'sess-1',
      newSessionId: 'sess-1',
      newMessages: [makeMessage('user', 'Edited second')],
      settings: makeSettings(),
      editingMessageId: msg3.id,
    });
    // Should have msg1, msg2, and new message (msg3 and after removed)
    expect(result[0].messages).toHaveLength(3);
    expect(result[0].messages[2].content).toBe('Edited second');
  });

  it('spreads new settings over existing (lockedApiKey can be overwritten by settings param)', () => {
    const existing = makeSession({
      id: 'sess-1',
      settings: makeSettings({ lockedApiKey: 'existing-key' }),
    });
    const result = performOptimisticSessionUpdate([existing], {
      activeSessionId: 'sess-1',
      newSessionId: 'sess-1',
      newMessages: [],
      settings: makeSettings({ lockedApiKey: 'new-key' }),
    });
    expect(result[0].settings.lockedApiKey).toBe('new-key');
  });

  it('locks API key on new session when shouldLockKey is true', () => {
    const result = performOptimisticSessionUpdate([], {
      activeSessionId: null,
      newSessionId: 'new-1',
      newMessages: [],
      settings: makeSettings(),
      shouldLockKey: true,
      keyToLock: 'my-api-key',
    });
    expect(result[0].settings.lockedApiKey).toBe('my-api-key');
  });

  it('does not lock key when session already has one and shouldLockKey is true', () => {
    // The spread overwrites, but the conditional lock only applies when no existing key
    const existing = makeSession({
      id: 'sess-1',
      settings: makeSettings({ lockedApiKey: 'existing-key' }),
    });
    const result = performOptimisticSessionUpdate([existing], {
      activeSessionId: 'sess-1',
      newSessionId: 'sess-1',
      newMessages: [],
      settings: makeSettings(), // lockedApiKey: null
      shouldLockKey: true,
      keyToLock: 'new-key',
    });
    // The settings spread overwrites lockedApiKey to null, then the lock check
    // sees session already had one, so doesn't re-lock
    expect(result[0].settings.lockedApiKey).toBeNull();
  });

  it('updates timestamp when messages are added', () => {
    const oldTime = 1000;
    const existing = makeSession({ id: 'sess-1', timestamp: oldTime });
    const result = performOptimisticSessionUpdate([existing], {
      activeSessionId: 'sess-1',
      newSessionId: 'sess-1',
      newMessages: [makeMessage('user', 'Hi')],
      settings: makeSettings(),
    });
    expect(result[0].timestamp).toBeGreaterThan(oldTime);
  });

  it('preserves timestamp when no messages added', () => {
    const oldTime = 1000;
    const existing = makeSession({ id: 'sess-1', timestamp: oldTime });
    const result = performOptimisticSessionUpdate([existing], {
      activeSessionId: 'sess-1',
      newSessionId: 'sess-1',
      newMessages: [],
      settings: makeSettings(),
    });
    expect(result[0].timestamp).toBe(oldTime);
  });
});

describe('serializeMessageForPortableExport', () => {
  it('converts attachment blobs to portable data URLs for single-message JSON export', async () => {
    const rawFile = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const message = makeMessage('user', 'with attachment', {
      files: [
        createUploadedFile({
          id: 'file-1',
          name: 'note.txt',
          type: 'text/plain',
          size: rawFile.size,
          rawFile,
          dataUrl: 'blob:http://localhost/ephemeral',
        }),
      ],
    });

    const result = await serializeMessageForPortableExport(message);

    expect(result.files?.[0].rawFile).toBeUndefined();
    expect(result.files?.[0].dataUrl).toBe('data:text/plain;base64,aGVsbG8=');
  });
});

describe('session file persistence helpers', () => {
  it('extracts file blobs into persisted file records', () => {
    const rawFile = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const session = makeSession({
      id: 'session-with-file',
      messages: [
        makeMessage('user', 'Hi', {
          files: [
            createUploadedFile({
              id: 'file-1',
              name: 'note.txt',
              type: 'text/plain',
              size: rawFile.size,
              rawFile,
            }),
          ],
        }),
      ],
    });

    const records = extractPersistedSessionFileRecords(session);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'file-1',
      sessionId: 'session-with-file',
      name: 'note.txt',
      type: 'text/plain',
    });
    expect(records[0].rawFile).toBe(rawFile);
  });

  it('strips runtime-only file payloads from persisted session metadata', () => {
    const rawFile = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const session = makeSession({
      messages: [
        makeMessage('user', 'Hi', {
          files: [
            createUploadedFile({
              id: 'file-1',
              name: 'note.txt',
              type: 'text/plain',
              size: rawFile.size,
              rawFile,
              dataUrl: 'blob:http://localhost/file-1',
              abortController: new AbortController(),
            }),
          ],
        }),
      ],
    });

    const stripped = stripSessionFilePayloads(session);

    expect(stripped.messages[0].files?.[0].rawFile).toBeUndefined();
    expect(stripped.messages[0].files?.[0].dataUrl).toBeUndefined();
    expect(stripped.messages[0].files?.[0].abortController).toBeUndefined();
  });

  it('attaches persisted file records back onto session metadata', () => {
    const rawFile = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const session = makeSession({
      messages: [
        makeMessage('user', 'Hi', {
          files: [
            createUploadedFile({
              id: 'file-1',
              name: 'note.txt',
              type: 'text/plain',
              size: rawFile.size,
            }),
          ],
        }),
      ],
    });
    const records = new Map<string, PersistedSessionFileRecord>([
      [
        'file-1',
        {
          id: 'file-1',
          sessionId: session.id,
          messageId: session.messages[0].id,
          name: 'note.txt',
          type: 'text/plain',
          rawFile,
        },
      ],
    ]);

    const hydrated = attachPersistedSessionFiles(session, records);

    expect(hydrated.messages[0].files?.[0].rawFile).toBe(rawFile);
  });
});
