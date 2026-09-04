import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@/test/render/renderer';
import type { SavedChatSession } from '@/types';
import { createAppSettings, createChatMessage, createChatSettings, createUploadedFile } from '@/test/data/factories';
import { useModelRequestRunner } from './useModelRequestRunner';

const { mockGetKeyForRequest, mockGenerateUniqueId } = vi.hoisted(() => ({
  mockGetKeyForRequest: vi.fn(),
  mockGenerateUniqueId: vi.fn(),
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getKeyForRequest: mockGetKeyForRequest,
}));

vi.mock('@/utils/chat/ids', () => ({
  generateUniqueId: mockGenerateUniqueId,
}));

vi.mock('@/constants/settingsDefaults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/constants/settingsDefaults')>();
  return {
    ...actual,
    DEFAULT_CHAT_SETTINGS: { modelId: 'default-model', temperature: 0.3 },
  };
});

describe('useModelRequestRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateUniqueId.mockReturnValue('generated-id');
  });

  it('returns a prepared request with one API key lookup, generation metadata, and key-lock intent', () => {
    mockGetKeyForRequest.mockReturnValue({ key: 'api-key', isNewKey: true });
    const updateAndPersistSessions = vi.fn();
    const activeFile = createUploadedFile({
      name: 'sample.png',
      fileUri: 'files/abc',
    });
    const generationStartTime = new Date('2026-05-04T08:00:00.000Z');

    const { result, unmount } = renderHook(() =>
      useModelRequestRunner({
        appSettings: createAppSettings({ modelId: 'gemini-default', apiKey: 'stored-key' }),
        currentChatSettings: createChatSettings({ modelId: 'gemini-3-pro' }),
        updateAndPersistSessions,
        setActiveSessionId: vi.fn(),
        translateApiKeyError: (error) => `translated:${error}`,
      }),
    );

    const prepared = result.current.prepareModelRequest({
      activeModelId: 'gemini-3-pro',
      files: [activeFile],
      generationStartTime,
      messages: {
        noModelSelected: 'No model selected.',
        noModelTitle: 'Model Error',
        apiKeyTitle: 'API Key Error',
      },
    });

    expect(prepared).toEqual(
      expect.objectContaining({
        ok: true,
        keyToUse: 'api-key',
        isNewKey: true,
        shouldLockKey: true,
        generationId: 'generated-id',
        generationStartTime,
      }),
    );
    expect(prepared.ok && prepared.abortController).toBeInstanceOf(AbortController);
    expect(mockGetKeyForRequest).toHaveBeenCalledOnce();
    expect(updateAndPersistSessions).not.toHaveBeenCalled();

    unmount();
  });

  it('locks the API key for a text follow-up when history still has Files API references', () => {
    mockGetKeyForRequest.mockReturnValue({ key: 'api-key', isNewKey: true });

    const { result, unmount } = renderHook(() =>
      useModelRequestRunner({
        appSettings: createAppSettings({ modelId: 'gemini-default', apiKey: 'stored-key' }),
        currentChatSettings: createChatSettings({ modelId: 'gemini-3-pro' }),
        updateAndPersistSessions: vi.fn(),
        setActiveSessionId: vi.fn(),
        translateApiKeyError: (error) => error,
      }),
    );

    const prepared = result.current.prepareModelRequest({
      activeModelId: 'gemini-3-pro',
      files: [],
      historyMessages: [
        createChatMessage({
          files: [createUploadedFile({ fileApiName: 'files/abc', fileUri: 'https://files/abc' })],
        }),
      ],
      messages: {
        noModelSelected: 'No model selected.',
        noModelTitle: 'Model Error',
        apiKeyTitle: 'API Key Error',
      },
    });

    expect(prepared).toEqual(expect.objectContaining({ ok: true, shouldLockKey: true }));
    unmount();
  });

  it('does not lock the API key for a text-only turn without Files API history', () => {
    mockGetKeyForRequest.mockReturnValue({ key: 'api-key', isNewKey: true });

    const { result, unmount } = renderHook(() =>
      useModelRequestRunner({
        appSettings: createAppSettings({ modelId: 'gemini-default', apiKey: 'stored-key' }),
        currentChatSettings: createChatSettings({ modelId: 'gemini-3-pro' }),
        updateAndPersistSessions: vi.fn(),
        setActiveSessionId: vi.fn(),
        translateApiKeyError: (error) => error,
      }),
    );

    const prepared = result.current.prepareModelRequest({
      activeModelId: 'gemini-3-pro',
      files: [],
      historyMessages: [createChatMessage()],
      messages: {
        noModelSelected: 'No model selected.',
        noModelTitle: 'Model Error',
        apiKeyTitle: 'API Key Error',
      },
    });

    expect(prepared).toEqual(expect.objectContaining({ ok: true, shouldLockKey: false }));
    unmount();
  });

  it('creates a translated API-key error session when key preparation fails', () => {
    mockGetKeyForRequest.mockReturnValue({ error: 'API key missing' });
    mockGenerateUniqueId.mockReturnValueOnce('error-message-id').mockReturnValueOnce('error-session-id');
    let sessions: SavedChatSession[] = [];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });
    const setActiveSessionId = vi.fn();

    const { result, unmount } = renderHook(() =>
      useModelRequestRunner({
        appSettings: createAppSettings({ modelId: 'gemini-default', apiKey: '' }),
        currentChatSettings: createChatSettings({ modelId: 'gemini-3-pro' }),
        updateAndPersistSessions,
        setActiveSessionId,
        translateApiKeyError: (error) => `translated:${error}`,
      }),
    );

    const prepared = result.current.prepareModelRequest({
      activeModelId: 'gemini-3-pro',
      files: [],
      messages: {
        noModelSelected: 'No model selected.',
        noModelTitle: 'Model Error',
        apiKeyTitle: 'API Key Error',
      },
    });

    expect(prepared).toEqual({ ok: false });
    expect(updateAndPersistSessions).toHaveBeenCalledOnce();
    expect(setActiveSessionId).toHaveBeenCalledWith('error-session-id');
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        id: 'error-session-id',
        title: 'API Key Error',
        messages: [
          expect.objectContaining({
            id: 'error-message-id',
            role: 'error',
            content: 'translated:API key missing',
          }),
        ],
      }),
    );

    unmount();
  });
});
