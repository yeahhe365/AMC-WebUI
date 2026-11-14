import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAppSettings,
  createChatMessage,
  createChatSettings,
  createSavedChatSession,
} from '@/test/data/factories';
import { getTranslator } from '@/i18n/translations';
import { getApiKeyFingerprint } from '@/utils/chat/geminiFilesApi';
import {
  attachPersistedSessionFiles,
  extractPersistedSessionFileRecords,
  rehydrateSessionFiles,
  stripSessionFilePayloads,
} from '@/utils/chat/session';

const { generateVideo } = vi.hoisted(() => ({ generateVideo: vi.fn() }));
vi.mock('@/services/api/generation/omniVideoApi', () => ({ generateOmniVideo: generateVideo }));
vi.mock('@/services/objectUrlManager', () => ({
  createManagedObjectUrl: vi.fn(() => 'blob:omni-video'),
  releaseManagedObjectUrlsByOwner: vi.fn(),
}));
import { sendOmniVideoMessage } from './omniVideoStrategy';

describe('sendOmniVideoMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateVideo.mockResolvedValue({ interactionId: 'turn-new', video: new Blob(['video'], { type: 'video/mp4' }) });
  });

  const run = async (history = [] as ReturnType<typeof createChatMessage>[], key = 'key') => {
    let sessions = [createSavedChatSession({ id: 'session-1', messages: history })];
    const lifecycle = vi.fn(async ({ execute }) => execute());
    await sendOmniVideoMessage({
      keyToUse: key,
      activeSessionId: 'session-1',
      messages: history,
      generationId: 'new-model',
      abortController: new AbortController(),
      appSettings: createAppSettings({ isCompletionSoundEnabled: false }),
      currentChatSettings: createChatSettings({ modelId: 'gemini-omni-1.2-flash' }),
      text: 'Make it blue',
      files: [],
      editingMessageId: null,
      updateAndPersistSessions: (updater) => {
        sessions = updater(sessions);
      },
      setActiveSessionId: vi.fn(),
      setActiveMessages: vi.fn(),
      runMessageLifecycle: lifecycle,
      t: getTranslator('en'),
    });
    return { sessions, lifecycle };
  };

  it('saves the returned video and interaction metadata for a follow-up turn', async () => {
    const prior = createChatMessage({
      id: 'prior',
      role: 'model',
      content: '',
      omniInteraction: {
        id: 'turn-previous',
        keyFingerprint: getApiKeyFingerprint('key'),
        apiBase: 'https://generativelanguage.googleapis.com',
      },
    });
    const { sessions } = await run([prior]);
    expect(generateVideo).toHaveBeenCalledWith(expect.objectContaining({ previousInteractionId: 'turn-previous' }));
    const result = sessions[0].messages.at(-1)!;
    expect(result.omniInteraction?.id).toBe('turn-new');
    expect(result.files?.[0]).toMatchObject({
      name: expect.stringMatching(/^generated-video-.*\.mp4$/),
      type: 'video/mp4',
      dataUrl: 'blob:omni-video',
      rawFile: expect.any(Blob),
    });
  });

  it('shows a text answer and preserves its interaction for the next turn', async () => {
    generateVideo.mockResolvedValueOnce({ interactionId: 'text-turn', text: '你好，我是 Gemini。' });

    const first = await run();
    const answer = first.sessions[0].messages.at(-1)!;
    expect(answer.content).toBe('你好，我是 Gemini。');
    expect(answer.files ?? []).toHaveLength(0);
    expect(answer.omniInteraction?.id).toBe('text-turn');

    await run([answer]);
    expect(generateVideo).toHaveBeenLastCalledWith(expect.objectContaining({ previousInteractionId: 'text-turn' }));
  });

  it('restores the video and editing context from persisted session records', async () => {
    const { sessions } = await run();
    const records = extractPersistedSessionFileRecords(sessions[0]);
    const metadata = stripSessionFilePayloads(sessions[0]);
    expect(metadata.messages.at(-1)?.files?.[0].rawFile).toBeUndefined();
    const restored = rehydrateSessionFiles(
      attachPersistedSessionFiles(metadata, new Map(records.map((record) => [record.id, record]))),
    );
    const videoMessage = restored.messages.at(-1)!;
    expect(videoMessage.omniInteraction?.id).toBe('turn-new');
    expect(videoMessage.files?.[0]).toMatchObject({ type: 'video/mp4', dataUrl: 'blob:omni-video' });
    expect(videoMessage.files?.[0].rawFile?.size).toBe(5);
  });

  it('does not send an old interaction to a different key', async () => {
    const prior = createChatMessage({
      role: 'model',
      omniInteraction: {
        id: 'turn-old',
        keyFingerprint: getApiKeyFingerprint('other-key'),
        apiBase: 'https://generativelanguage.googleapis.com',
      },
    });
    await expect(run([prior])).rejects.toThrow(/key|credential/i);
    expect(generateVideo).not.toHaveBeenCalled();
  });

  it('initializes messages when starting a new conversation', async () => {
    const setActiveMessages = vi.fn();
    await sendOmniVideoMessage({
      keyToUse: 'key',
      activeSessionId: null,
      messages: [],
      generationId: 'new-model',
      abortController: new AbortController(),
      appSettings: createAppSettings({ isCompletionSoundEnabled: false }),
      currentChatSettings: createChatSettings({ modelId: 'gemini-omni-1.2-flash' }),
      text: 'A cat running',
      files: [],
      editingMessageId: null,
      updateAndPersistSessions: vi.fn(),
      setActiveSessionId: vi.fn(),
      setActiveMessages,
      runMessageLifecycle: async ({ execute }) => execute(),
      t: getTranslator('en'),
    });
    expect(setActiveMessages).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'user', content: 'A cat running' }),
      expect.objectContaining({ role: 'model', id: 'new-model' }),
    ]);
  });

  it('explains when an earlier interaction is unavailable without retrying generation', async () => {
    const prior = createChatMessage({
      role: 'model',
      omniInteraction: {
        id: 'turn-old',
        keyFingerprint: getApiKeyFingerprint('key'),
        apiBase: 'https://generativelanguage.googleapis.com',
      },
    });
    generateVideo.mockRejectedValue(Object.assign(new Error('Interaction not found'), { status: 404 }));
    await expect(run([prior])).rejects.toThrow(/expired|unavailable/i);
    expect(generateVideo).toHaveBeenCalledTimes(1);
  });
});
