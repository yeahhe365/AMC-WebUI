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
});
