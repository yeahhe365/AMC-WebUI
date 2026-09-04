import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/file/filePreviewUrls', () => ({
  cleanupFilePreviewUrls: vi.fn(),
}));

// Tab id / lease / stream-job / active-jobs are read straight from the chat
// store's module-level refs; stub them so resume behavior is controllable.
vi.mock('@/stores/chatStore', () => ({
  useChatStore: {
    getState: () => mockChatStoreState,
  },
}));

const mockChatStoreState = vi.hoisted(() => ({
  activeMessages: [] as ChatMessage[],
  _activeJobs: { current: new Map<string, AbortController>() },
}));

vi.mock('@/features/message-sender/generationLease', () => ({
  isGenerationLeaseHeldByTab: vi.fn(() => false),
}));

vi.mock('@/features/stream-jobs/amcStreamJobs', () => ({
  readPendingStreamJob: vi.fn(() => null),
}));

import { useChatEffects } from './useChatEffects';
import { renderHook } from '@/test/render/renderer';
import { createChatSettings } from '@/test/data/factories';
import type { ChatMessage } from '@/types';
import { readPendingStreamJob } from '@/features/stream-jobs/amcStreamJobs';
import { isGenerationLeaseHeldByTab } from '@/features/message-sender/generationLease';
import { startActiveGenerationJob } from '@/features/message-sender/activeGenerationJobs';

const createProps = (overrides: Partial<Parameters<typeof useChatEffects>[0]> = {}) => ({
  activeSessionId: null,
  savedSessions: [],
  selectedFiles: [],
  appFileError: null,
  setAppFileError: vi.fn(),
  isModelsLoading: false,
  apiModels: [],
  activeChat: undefined,
  updateAndPersistSessions: vi.fn(),
  isSwitchingModel: false,
  setIsSwitchingModel: vi.fn(),
  currentChatSettings: createChatSettings(),
  aspectRatio: '1:1',
  setAspectRatio: vi.fn(),
  imageSize: '1K',
  setImageSize: vi.fn(),
  isSettingsLoaded: true,
  loadInitialData: vi.fn(async () => undefined),
  loadChatSession: vi.fn(),
  startNewChat: vi.fn(),
  ...overrides,
});

describe('useChatEffects', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    mockChatStoreState.activeMessages = [];
    mockChatStoreState._activeJobs.current.clear();
    (isGenerationLeaseHeldByTab as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (readPendingStreamJob as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('switches Nano Banana 2 to Auto aspect ratio on model change', () => {
    const setAspectRatio = vi.fn();
    const props = createProps({
      currentChatSettings: createChatSettings({
        modelId: 'gemini-3-pro-image-preview',
      }),
      setAspectRatio,
    });

    const hook = renderHook(() => useChatEffects(props));

    props.currentChatSettings = createChatSettings({
      modelId: 'gemini-3.1-flash-image-preview',
    });

    hook.rerender();

    expect(setAspectRatio).toHaveBeenCalledWith('Auto');
    hook.unmount();
  });

  it('clamps stale image settings when switching from Nano Banana 2 to Nano Banana Lite', () => {
    const setAspectRatio = vi.fn();
    const setImageSize = vi.fn();
    const props = createProps({
      currentChatSettings: createChatSettings({
        modelId: 'gemini-3.1-flash-image-preview',
      }),
      aspectRatio: '1:4',
      imageSize: '4K',
      setAspectRatio,
      setImageSize,
    });

    const hook = renderHook(() => useChatEffects(props));

    props.currentChatSettings = createChatSettings({
      modelId: 'gemini-3.1-flash-lite-image',
    });

    hook.rerender();

    expect(setAspectRatio).toHaveBeenCalledWith('1:1');
    expect(setImageSize).toHaveBeenCalledWith('1K');
    hook.unmount();
  });

  it('resets Auto back to 1:1 when switching away from Banana models', () => {
    const setAspectRatio = vi.fn();
    const props = createProps({
      currentChatSettings: createChatSettings({
        modelId: 'gemini-3.1-flash-image-preview',
      }),
      aspectRatio: 'Auto',
      setAspectRatio,
    });

    const hook = renderHook(() => useChatEffects(props));

    props.currentChatSettings = createChatSettings({
      modelId: 'gemini-3.1-pro-preview',
    });

    hook.rerender();

    expect(setAspectRatio).toHaveBeenCalledWith('1:1');
    hook.unmount();
  });

  it('switches to another session when the active session is missing after initial history load', async () => {
    const loadChatSession = vi.fn();
    const props = createProps({
      activeSessionId: 'deleted-session',
      savedSessions: [
        {
          id: 'session-alive',
          title: 'Alive',
          timestamp: 2,
          messages: [],
          settings: createChatSettings(),
        },
      ],
      loadInitialData: vi.fn(async () => undefined),
      loadChatSession,
    });

    const hook = renderHook(() => useChatEffects(props));

    await act(async () => {
      await Promise.resolve();
    });

    expect(loadChatSession).toHaveBeenCalledWith('session-alive');
    hook.unmount();
  });

  it('does not blank the restored active session while the metadata list is still empty', async () => {
    // A refresh that restored the active session (setActiveSessionId ran) but
    // whose DB metadata read failed (savedSessions stayed []) must not conclude
    // the session is gone and start a fresh chat — that would wipe the user's
    // conversation.
    const startNewChat = vi.fn();
    const props = createProps({
      activeSessionId: 'session-abc',
      savedSessions: [],
      loadInitialData: vi.fn(async () => undefined),
      startNewChat,
    });

    const hook = renderHook(() => useChatEffects(props));

    await act(async () => {
      await Promise.resolve();
    });

    expect(startNewChat).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('does not require model-list fallback props that can silently rewrite session models', () => {
    const props = createProps({
      activeSessionId: 'session-1',
    });

    const hook = renderHook(() => useChatEffects(props));

    expect(props.startNewChat).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('waits for app settings to load before creating the initial chat session', async () => {
    const loadInitialData = vi.fn(async () => undefined);
    const props = createProps({
      isSettingsLoaded: false,
      loadInitialData,
    });

    const hook = renderHook(() => useChatEffects(props));

    await act(async () => {
      await Promise.resolve();
    });
    expect(loadInitialData).not.toHaveBeenCalled();

    props.isSettingsLoaded = true;
    hook.rerender();

    await act(async () => {
      await Promise.resolve();
    });
    expect(loadInitialData).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('does not restart initial history load when loadInitialData identity changes', async () => {
    const firstLoad = vi.fn(async () => undefined);
    const secondLoad = vi.fn(async () => undefined);
    const props = createProps({
      isSettingsLoaded: true,
      loadInitialData: firstLoad,
    });

    const hook = renderHook(() => useChatEffects(props));

    await act(async () => {
      await Promise.resolve();
    });
    expect(firstLoad).toHaveBeenCalledTimes(1);

    props.loadInitialData = secondLoad;
    hook.rerender();

    await act(async () => {
      await Promise.resolve();
    });
    expect(firstLoad).toHaveBeenCalledTimes(1);
    expect(secondLoad).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('resumes a pending stream after a refresh even when a stale lease survives', async () => {
    const resumePendingStream = vi.fn(async () => undefined);
    const props = createProps({
      activeSessionId: 'session-1',
      resumePendingStream,
    });
    mockChatStoreState.activeMessages = [
      {
        id: 'gen-1',
        role: 'model',
        content: '',
        timestamp: new Date(),
        generationStartTime: new Date(),
        isLoading: true,
      },
    ];
    (readPendingStreamJob as ReturnType<typeof vi.fn>).mockReturnValue({
      sessionId: 'session-1',
      generationId: 'gen-1',
      jobId: 'gen-1',
      startedAt: Date.now() - 1000,
      lastSeq: 0,
      tabId: 'test-tab',
    });
    // Refresh keeps the sessionStorage TAB_ID and the localStorage lease, but
    // the in-memory job map is empty. The resume must NOT be blocked.
    (isGenerationLeaseHeldByTab as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const hook = renderHook(() => useChatEffects(props));

    await act(async () => {
      await Promise.resolve();
    });

    expect(resumePendingStream).toHaveBeenCalledTimes(1);
    expect(resumePendingStream).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        generationId: 'gen-1',
      }),
    );
    hook.unmount();
  });

  it('skips resume when the lease is held AND an in-memory job is live (send in flight)', async () => {
    const resumePendingStream = vi.fn(async () => undefined);
    const props = createProps({
      activeSessionId: 'session-1',
      resumePendingStream,
    });
    mockChatStoreState.activeMessages = [
      {
        id: 'gen-1',
        role: 'model',
        content: '',
        timestamp: new Date(),
        generationStartTime: new Date(),
        isLoading: true,
      },
    ];
    (readPendingStreamJob as ReturnType<typeof vi.fn>).mockReturnValue({
      sessionId: 'session-1',
      generationId: 'gen-1',
      jobId: 'gen-1',
      startedAt: Date.now() - 1000,
      lastSeq: 0,
      tabId: 'test-tab',
    });
    (isGenerationLeaseHeldByTab as ReturnType<typeof vi.fn>).mockReturnValue(true);
    // A live send registered an in-memory job for this session via the real
    // bookkeeping module (keyed by the ref object, not just the Map entry).
    const controller = new AbortController();
    startActiveGenerationJob(mockChatStoreState._activeJobs, 'session-1', 'gen-1', controller);

    const hook = renderHook(() => useChatEffects(props));

    await act(async () => {
      await Promise.resolve();
    });

    expect(resumePendingStream).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('does not resume when the loading message is missing from activeMessages', async () => {
    const resumePendingStream = vi.fn(async () => undefined);
    const props = createProps({
      activeSessionId: 'session-1',
      resumePendingStream,
    });
    // activeMessages has no matching isLoading message for gen-1.
    mockChatStoreState.activeMessages = [];
    (readPendingStreamJob as ReturnType<typeof vi.fn>).mockReturnValue({
      sessionId: 'session-1',
      generationId: 'gen-1',
      jobId: 'gen-1',
      startedAt: Date.now() - 1000,
      lastSeq: 0,
      tabId: 'test-tab',
    });

    const hook = renderHook(() => useChatEffects(props));

    await act(async () => {
      await Promise.resolve();
    });

    expect(resumePendingStream).not.toHaveBeenCalled();
    hook.unmount();
  });
});
