import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Part } from '@google/genai';
import type { SavedChatSession } from '@/types';
import { useMessageUpdates } from './useMessageUpdates';
import {
  createAppSettings,
  createChatSettings,
  createSavedChatSession,
  createUploadedFile,
} from '@/test/data/factories';
import { renderHook } from '@/test/render/renderer';

describe('useMessageUpdates', () => {
  it('creates and updates a live model message when generated files arrive before text', () => {
    let sessions: SavedChatSession[] = [
      createSavedChatSession({
        id: 'session-1',
        title: 'Live Session',
        timestamp: Date.now(),
        messages: [],
      }),
    ];

    const updateAndPersistSessions = vi.fn(
      (updater: typeof sessions | ((prev: typeof sessions) => typeof sessions)) => {
        sessions =
          typeof updater === 'function' ? (updater as (prev: typeof sessions) => typeof sessions)(sessions) : updater;
        return sessions;
      },
    );

    const { result, unmount } = renderHook(() =>
      useMessageUpdates({
        activeSessionId: 'session-1',
        setActiveSessionId: vi.fn(),
        appSettings: createAppSettings(),
        currentChatSettings: createChatSettings(),
        updateAndPersistSessions,
        userScrolledUpRef: { current: false },
      }),
    );

    const generatedFile = createUploadedFile({
      name: 'chart.png',
    });

    act(() => {
      result.current.handleLiveTranscript('', 'model', false, 'content', undefined, [generatedFile]);
    });

    expect(sessions[0].messages).toHaveLength(1);
    expect(sessions[0].messages[0]).toEqual(
      expect.objectContaining({
        role: 'model',
        content: '',
        files: [generatedFile],
        isLoading: true,
      }),
    );

    act(() => {
      result.current.handleLiveTranscript('Done.', 'model', true, 'content');
    });

    expect(sessions[0].messages[0]).toEqual(
      expect.objectContaining({
        role: 'model',
        content: 'Done.',
        files: [generatedFile],
        isLoading: false,
      }),
    );

    unmount();
  });

  it('creates a new live session when generated files arrive before any transcript text', () => {
    let sessions: SavedChatSession[] = [];

    const updateAndPersistSessions = vi.fn(
      (updater: typeof sessions | ((prev: typeof sessions) => typeof sessions)) => {
        sessions =
          typeof updater === 'function' ? (updater as (prev: typeof sessions) => typeof sessions)(sessions) : updater;
        return sessions;
      },
    );
    const setActiveSessionId = vi.fn();

    const { result, unmount } = renderHook(() =>
      useMessageUpdates({
        activeSessionId: null,
        setActiveSessionId,
        appSettings: createAppSettings(),
        currentChatSettings: createChatSettings(),
        updateAndPersistSessions,
        userScrolledUpRef: { current: false },
      }),
    );

    const generatedFile = createUploadedFile({
      name: 'chart.png',
    });

    act(() => {
      result.current.handleLiveTranscript('', 'model', false, 'content', undefined, [generatedFile]);
    });

    expect(setActiveSessionId).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('Live Session');
    expect(sessions[0].messages).toHaveLength(1);
    expect(sessions[0].messages[0]).toEqual(
      expect.objectContaining({
        role: 'model',
        files: [generatedFile],
        isLoading: true,
      }),
    );

    unmount();
  });

  it('applies live model api parts through the shared stream reducer', () => {
    let sessions: SavedChatSession[] = [
      createSavedChatSession({
        id: 'session-1',
        title: 'Live Session',
        timestamp: Date.now(),
        messages: [],
      }),
    ];

    const updateAndPersistSessions = vi.fn(
      (updater: typeof sessions | ((prev: typeof sessions) => typeof sessions)) => {
        sessions =
          typeof updater === 'function' ? (updater as (prev: typeof sessions) => typeof sessions)(sessions) : updater;
        return sessions;
      },
    );

    const { result, unmount } = renderHook(() =>
      useMessageUpdates({
        activeSessionId: 'session-1',
        setActiveSessionId: vi.fn(),
        appSettings: createAppSettings(),
        currentChatSettings: createChatSettings(),
        updateAndPersistSessions,
        userScrolledUpRef: { current: false },
      }),
    );

    const part = { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '42\n' } } as Part;

    act(() => {
      result.current.handleLiveTranscript('', 'model', false, 'content', undefined, undefined, part);
    });

    expect(sessions[0].messages[0]).toEqual(
      expect.objectContaining({
        role: 'model',
        content:
          '\n\n<div class="tool-result outcome-ok"><pre><code class="language-text">42&#10;&#10;</code></pre></div>\n\n',
        apiParts: [part],
        isLoading: true,
      }),
    );

    unmount();
  });

  it('defers persistence for live transcript fragments until the turn is final', () => {
    let sessions: SavedChatSession[] = [
      createSavedChatSession({
        id: 'session-1',
        title: 'Live Session',
        timestamp: Date.now(),
        messages: [],
      }),
    ];

    const updateAndPersistSessions = vi.fn(
      (updater: typeof sessions | ((prev: typeof sessions) => typeof sessions)) => {
        sessions =
          typeof updater === 'function' ? (updater as (prev: typeof sessions) => typeof sessions)(sessions) : updater;
        return sessions;
      },
    );

    const { result, unmount } = renderHook(() =>
      useMessageUpdates({
        activeSessionId: 'session-1',
        setActiveSessionId: vi.fn(),
        appSettings: createAppSettings(),
        currentChatSettings: createChatSettings(),
        updateAndPersistSessions,
        userScrolledUpRef: { current: false },
      }),
    );

    act(() => {
      result.current.handleLiveTranscript('partial ', 'model', false, 'content');
      result.current.handleLiveTranscript('answer', 'model', true, 'content');
    });

    expect(updateAndPersistSessions).toHaveBeenNthCalledWith(1, expect.any(Function), { persist: false });
    expect(updateAndPersistSessions).toHaveBeenNthCalledWith(2, expect.any(Function), { persist: true });
    expect(sessions[0].messages[0]).toEqual(
      expect.objectContaining({
        content: 'partial answer',
        isLoading: false,
      }),
    );

    unmount();
  });

  it('does not stamp a zero first-token time on a live message that arrives without text', () => {
    let sessions: SavedChatSession[] = [
      createSavedChatSession({
        id: 'session-1',
        title: 'Live Session',
        timestamp: Date.now(),
        messages: [],
      }),
    ];

    const updateAndPersistSessions = vi.fn(
      (updater: typeof sessions | ((prev: typeof sessions) => typeof sessions)) => {
        sessions =
          typeof updater === 'function' ? (updater as (prev: typeof sessions) => typeof sessions)(sessions) : updater;
        return sessions;
      },
    );

    const { result, unmount } = renderHook(() =>
      useMessageUpdates({
        activeSessionId: 'session-1',
        setActiveSessionId: vi.fn(),
        appSettings: createAppSettings(),
        currentChatSettings: createChatSettings(),
        updateAndPersistSessions,
        userScrolledUpRef: { current: false },
      }),
    );

    // Audio-first live turn: no text payload yet, so firstTokenTimeMs must not
    // be pinned to 0 (which would make the TTFT badge jump when text arrives).
    act(() => {
      result.current.handleLiveTranscript('', 'model', false, 'content', 'blob:audio');
    });

    expect(sessions[0].messages[0].firstTokenTimeMs).toBeUndefined();
    expect(sessions[0].messages[0].audioSrc).toBe('blob:audio');

    unmount();
  });

  it('updates message content and attachments when handleUpdateMessageContent is called', () => {
    const existingFile = createUploadedFile({ id: 'file-1', name: 'old.mp4' });
    let sessions: SavedChatSession[] = [
      createSavedChatSession({
        id: 'session-1',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'Original prompt',
            files: [existingFile],
            timestamp: new Date('2026-05-01T00:00:00.000Z'),
          },
        ],
      }),
    ];

    const updateAndPersistSessions = vi.fn(
      (updater: typeof sessions | ((prev: typeof sessions) => typeof sessions)) => {
        sessions =
          typeof updater === 'function' ? (updater as (prev: typeof sessions) => typeof sessions)(sessions) : updater;
        return sessions;
      },
    );

    const { result, unmount } = renderHook(() =>
      useMessageUpdates({
        activeSessionId: 'session-1',
        setActiveSessionId: vi.fn(),
        appSettings: createAppSettings(),
        currentChatSettings: createChatSettings(),
        updateAndPersistSessions,
        userScrolledUpRef: { current: false },
      }),
    );

    // Updating with new files
    const newFile = createUploadedFile({ id: 'file-2', name: 'new.png' });
    act(() => {
      result.current.handleUpdateMessageContent('message-1', 'Updated prompt', [newFile]);
    });

    expect(sessions[0].messages[0].content).toBe('Updated prompt');
    expect(sessions[0].messages[0].files).toEqual([newFile]);

    // Updating with empty files array (removes attachments)
    act(() => {
      result.current.handleUpdateMessageContent('message-1', 'Clean prompt without files', []);
    });

    expect(sessions[0].messages[0].content).toBe('Clean prompt without files');
    expect(sessions[0].messages[0].files).toBeUndefined();

    unmount();
  });
});
