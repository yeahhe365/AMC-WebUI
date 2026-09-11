import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '@/test/render/providerRenderer';
import { createChatSettings, createUploadedFile } from '@/test/data/factories';
import { INVALID_FILE_API_KEY_FINGERPRINT } from '@/utils/chat/geminiFilesApi';
import type { SavedChatSession } from '@/types';
import { useApiErrorHandler } from './useApiErrorHandler';

const createSession = (): SavedChatSession => ({
  id: 'session-1',
  title: 'Session',
  timestamp: 1,
  settings: createChatSettings(),
  messages: [
    {
      id: 'generation-1',
      role: 'model',
      content: '',
      isLoading: true,
      timestamp: new Date('2026-04-21T00:00:00.000Z'),
    },
  ],
});

describe('useApiErrorHandler', () => {
  it('writes generic API errors in the active language when no prefix is supplied', () => {
    const updateAndPersistSessions = vi.fn();
    const { result } = renderHookWithProviders(() => useApiErrorHandler(updateAndPersistSessions), { language: 'zh' });

    act(() => {
      result.current.handleApiError(new Error('boom'), 'session-1', 'generation-1');
    });

    const updater = updateAndPersistSessions.mock.calls[0]?.[0];
    expect(updater).toBeTypeOf('function');

    const finalState = updater([createSession()]);
    expect(finalState[0].messages[0]).toEqual(
      expect.objectContaining({
        role: 'error',
        content: '\n\n[错误：boom]',
        isLoading: false,
      }),
    );
  });

  it('writes empty-reply notices without API-error quoting', () => {
    const updateAndPersistSessions = vi.fn();
    const { result } = renderHookWithProviders(() => useApiErrorHandler(updateAndPersistSessions), { language: 'zh' });
    const error = Object.assign(new Error('模型结束了这一轮，但没有给出可见回复。请重试。'), {
      name: 'EmptyReplyError',
    });

    act(() => {
      result.current.handleApiError(error, 'session-1', 'generation-1');
    });

    const updater = updateAndPersistSessions.mock.calls[0]?.[0];
    const finalState = updater([createSession()]);
    expect(finalState[0].messages[0]).toEqual(
      expect.objectContaining({
        role: 'error',
        content: '模型结束了这一轮，但没有给出可见回复。请重试。',
        isLoading: false,
      }),
    );
  });

  it('localizes silent API key configuration errors', () => {
    const updateAndPersistSessions = vi.fn();
    const { result } = renderHookWithProviders(() => useApiErrorHandler(updateAndPersistSessions), { language: 'zh' });
    const error = Object.assign(new Error('missing key'), { name: 'SilentError' });

    act(() => {
      result.current.handleApiError(error, 'session-1', 'generation-1');
    });

    const updater = updateAndPersistSessions.mock.calls[0]?.[0];
    const finalState = updater([createSession()]);
    expect(finalState[0].messages[0].content).toBe('\n\n[未在设置中配置 API 密钥。]');
  });

  it('localizes the legacy default Error prefix when callers pass it explicitly', () => {
    const updateAndPersistSessions = vi.fn();
    const { result } = renderHookWithProviders(() => useApiErrorHandler(updateAndPersistSessions), { language: 'zh' });

    act(() => {
      result.current.handleApiError(new Error('boom'), 'session-1', 'generation-1', 'Error');
    });

    const updater = updateAndPersistSessions.mock.calls[0]?.[0];
    const finalState = updater([createSession()]);
    expect(finalState[0].messages[0].content).toBe('\n\n[错误：boom]');
  });

  it('fills in a thinking time fallback when a thought-carrying message errors out', () => {
    const updateAndPersistSessions = vi.fn();
    const { result } = renderHookWithProviders(() => useApiErrorHandler(updateAndPersistSessions), { language: 'zh' });
    const session = createSession();
    const generationStartTime = new Date('2026-04-21T00:00:00.000Z');
    session.messages = [
      {
        ...session.messages[0],
        thoughts: 'Only reasoning happened before the failure.',
        generationStartTime,
      },
    ];

    act(() => {
      result.current.handleApiError(
        new Error('network down'),
        'session-1',
        'generation-1',
        'Error',
        '',
        session.messages[0].thoughts,
      );
    });

    const updater = updateAndPersistSessions.mock.calls[0]?.[0];
    const finalState = updater([session]);
    expect(finalState[0].messages[0].thinkingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('does not stamp a thinking time fallback on an aborted reply without thoughts', () => {
    const updateAndPersistSessions = vi.fn();
    const { result } = renderHookWithProviders(() => useApiErrorHandler(updateAndPersistSessions), { language: 'zh' });

    act(() => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      result.current.handleApiError(abortError, 'session-1', 'generation-1', 'Error', 'partial', undefined);
    });

    const updater = updateAndPersistSessions.mock.calls[0]?.[0];
    const finalState = updater([createSession()]);
    expect(finalState[0].messages[0].thinkingTimeMs).toBeUndefined();
  });

  it('finalizes an aborted message even when no partial content or thoughts were produced', () => {
    const updateAndPersistSessions = vi.fn();
    const { result } = renderHookWithProviders(() => useApiErrorHandler(updateAndPersistSessions), { language: 'zh' });
    const session = createSession();

    act(() => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      result.current.handleApiError(abortError, 'session-1', 'generation-1', 'Error');
    });

    expect(updateAndPersistSessions).toHaveBeenCalledTimes(1);
    const updater = updateAndPersistSessions.mock.calls[0]?.[0];
    const finalState = updater([session]);
    expect(finalState[0].messages[0].isLoading).toBe(false);
    expect(finalState[0].messages[0].stoppedByUser).toBe(true);
    expect(finalState[0].messages[0].generationEndTime).toBeInstanceOf(Date);
  });

  it('invalidates matching file references and clears lockedApiKey on Files API permission denied errors', () => {
    const updateAndPersistSessions = vi.fn();
    const { result } = renderHookWithProviders(() => useApiErrorHandler(updateAndPersistSessions), { language: 'zh' });
    const session = createSession();
    session.settings = createChatSettings({ lockedApiKey: 'old-key' });
    session.messages.unshift({
      id: 'user-1',
      role: 'user',
      content: 'Analyze this file',
      timestamp: new Date('2026-04-20T00:00:00.000Z'),
      files: [
        createUploadedFile({
          id: 'file-1',
          name: 'doc.pdf',
          fileApiName: 'files/5aa5e27996bcaf1603af49ec6d30f7c40bac24ab',
          fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/5aa5e27996bcaf1603af49ec6d30f7c40bac24ab',
          fileApiKeyFingerprint: 'fnv1a-123-7',
          fileApiExpirationTime: new Date(Date.now() + 86400000).toISOString(),
        }),
      ],
    });

    const error = new Error(
      'upstream 403: 403 INTERNAL Proxy browser error: Google API returned error: 403 PERMISSION_DENIED {"error":{"code":403,"message":"You do not have permission to access the File 5aa5e27996bcaf1603af49ec6d30f7c40bac24ab or it may not exist.","status":"PERMISSION_DENIED"}}',
    );

    act(() => {
      result.current.handleApiError(error, 'session-1', 'generation-1');
    });

    const updater = updateAndPersistSessions.mock.calls[0]?.[0];
    const finalState = updater([session]);
    expect(finalState[0].settings.lockedApiKey).toBeNull();
    const userFile = finalState[0].messages[0].files![0];
    expect(userFile.fileApiKeyFingerprint).toBe(INVALID_FILE_API_KEY_FINGERPRINT);
    expect(userFile.fileApiExpirationTime).toBe(new Date(0).toISOString());
  });

  it('correctly updates and invalidates file references when target session is not at index 0', () => {
    const updateAndPersistSessions = vi.fn();
    const { result } = renderHookWithProviders(() => useApiErrorHandler(updateAndPersistSessions), { language: 'zh' });
    const firstSession = createSession();
    firstSession.id = 'session-first';

    const targetSession = createSession();
    targetSession.id = 'session-target';
    targetSession.messages[0].id = 'gen-target';
    targetSession.messages.unshift({
      id: 'user-target',
      role: 'user',
      content: 'analyze video',
      timestamp: new Date('2026-04-20T00:00:00.000Z'),
      files: [
        createUploadedFile({
          id: 'file-target-1',
          name: 'clip.mp4',
          fileApiName: 'files/targetfile123',
          fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/targetfile123',
          fileApiKeyFingerprint: 'fnv1a-abc',
          fileApiExpirationTime: new Date(Date.now() + 86400000).toISOString(),
        }),
      ],
    });

    const error = new Error('You do not have permission to access the File targetfile123 or it may not exist.');

    act(() => {
      result.current.handleApiError(error, 'session-target', 'gen-target');
    });

    const updater = updateAndPersistSessions.mock.calls[0]?.[0];
    const finalState = updater([firstSession, targetSession]);

    expect(finalState[0].id).toBe('session-first');
    expect(finalState[1].id).toBe('session-target');
    const targetUserFile = finalState[1].messages[0].files![0];
    expect(targetUserFile.fileApiKeyFingerprint).toBe(INVALID_FILE_API_KEY_FINGERPRINT);
    expect(targetUserFile.fileApiExpirationTime).toBe(new Date(0).toISOString());
  });

  it('prunes un-responded internal tool calls for the aborted model turn', () => {
    const updateAndPersistSessions = vi.fn();
    const { result } = renderHookWithProviders(() => useApiErrorHandler(updateAndPersistSessions), { language: 'zh' });

    const session = createSession();
    session.id = 'session-tool-abort';
    session.messages = [
      { id: 'user-1', role: 'user', content: 'run tool' } as any,
      {
        id: 'call-1',
        role: 'model',
        isInternalToolMessage: true,
        toolParentMessageId: 'generation-tool',
        apiParts: [{ functionCall: { name: 'search' } }],
      } as any,
      { id: 'generation-tool', role: 'model', content: '', isLoading: true } as any,
    ];

    act(() => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      result.current.handleApiError(abortError, 'session-tool-abort', 'generation-tool', 'Error', '', undefined);
    });

    const updater = updateAndPersistSessions.mock.calls[0]?.[0];
    const finalState = updater([session]);
    const finalMessageIds = finalState[0].messages.map((m: any) => m.id);
    // call-1 was never responded to, so it must be pruned
    expect(finalMessageIds).toEqual(['user-1', 'generation-tool']);
    expect(finalState[0].messages[1].stoppedByUser).toBe(true);
  });
});
