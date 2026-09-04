import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '@/test/render/providerRenderer';

// Fixed tab id so the multi-tab guard compares against a known value.
vi.mock('@/stores/tabIdentity', () => ({
  TAB_ID: 'test-tab',
}));

const {
  mockSendStatelessMessageStreamApi,
  mockIsGeminiProxyRelativePath,
  mockCreateChatHistoryForApi,
  mockBuildGenerationConfig,
  mockGetGeminiKeyForRequest,
  mockIsServerManagedApiEnabledForProxyRequests,
  mockGetStreamHandlers,
} = vi.hoisted(() => ({
  mockSendStatelessMessageStreamApi: vi.fn(),
  mockIsGeminiProxyRelativePath: vi.fn(() => true),
  mockCreateChatHistoryForApi: vi.fn(async () => []),
  mockBuildGenerationConfig: vi.fn(async () => ({ temperature: 1 })),
  mockGetGeminiKeyForRequest: vi.fn(() => ({ key: 'byok-key', isNewKey: false })),
  mockIsServerManagedApiEnabledForProxyRequests: vi.fn(() => false),
  mockGetStreamHandlers: vi.fn(() => ({
    streamOnError: vi.fn(),
    streamOnComplete: vi.fn(),
    streamOnPart: vi.fn(),
    onThoughtChunk: vi.fn(),
  })),
}));

vi.mock('@/services/api/chatApi', () => ({
  sendStatelessMessageStreamApi: mockSendStatelessMessageStreamApi,
}));

vi.mock('@/services/api/geminiApiBaseUrl', () => ({
  isGeminiProxyRelativePath: mockIsGeminiProxyRelativePath,
}));

vi.mock('@/utils/chat/builder', () => ({
  createChatHistoryForApi: mockCreateChatHistoryForApi,
}));

vi.mock('@/services/api/generationConfig', () => ({
  buildGenerationConfig: mockBuildGenerationConfig,
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getGeminiKeyForRequest: mockGetGeminiKeyForRequest,
  isServerManagedApiEnabledForProxyRequests: mockIsServerManagedApiEnabledForProxyRequests,
  SERVER_MANAGED_API_KEY: '__SERVER_MANAGED_API_KEY__',
}));

vi.mock('./generationLease', () => ({
  tryAcquireGenerationLease: vi.fn(() => true),
  releaseGenerationLease: vi.fn(),
  startGenerationLeaseHeartbeat: vi.fn(),
  stopGenerationLeaseHeartbeat: vi.fn(),
  isGenerationLeaseHeldByTab: vi.fn(() => false),
}));

vi.mock('./activeGenerationJobs', () => ({
  startActiveGenerationJob: vi.fn(),
  unregisterActiveGenerationJob: vi.fn(),
  hasActiveGenerationJobForSession: vi.fn(() => false),
}));

import { useStreamResume } from './useStreamResume';
import { createAppSettings, createChatSettings } from '@/test/data/factories';
import {
  startActiveGenerationJob,
  unregisterActiveGenerationJob,
  hasActiveGenerationJobForSession,
} from './activeGenerationJobs';
import { tryAcquireGenerationLease, isGenerationLeaseHeldByTab } from './generationLease';
const SESSION_ID = 'session-1';
const GENERATION_ID = 'gen-1';
const MODEL_ID = 'gemini-3.1-pro-preview';
const STARTED_AT = Date.now() - 1000;

interface RenderOpts {
  serverManaged?: boolean;
  byokKey?: string | null;
  cachedKey?: string;
  proxyRelative?: boolean;
}

const renderResume = (opts: RenderOpts = {}) => {
  const appSettings = createAppSettings({
    apiKey: opts.byokKey ?? 'byok-key',
    useCustomApiConfig: true,
    useApiProxy: true,
    apiProxyUrl: opts.serverManaged ? '/api/gemini' : 'https://api-proxy.de/gemini',
    serverManagedApi: opts.serverManaged ?? false,
  });

  mockIsGeminiProxyRelativePath.mockReturnValue(opts.proxyRelative ?? true);
  mockIsServerManagedApiEnabledForProxyRequests.mockReturnValue(opts.serverManaged ?? false);
  mockGetGeminiKeyForRequest.mockImplementation(() =>
    opts.byokKey === null
      ? ({ error: 'No valid API keys found.' } as unknown as { key: string; isNewKey: boolean })
      : { key: opts.byokKey ?? 'byok-key', isNewKey: false },
  );

  const sessionKeyMapRef = { current: new Map<string, string>() };
  if (opts.cachedKey) {
    sessionKeyMapRef.current.set(SESSION_ID, opts.cachedKey);
  }
  const activeJobs = { current: new Map<string, AbortController>() };
  const setSessionLoading = vi.fn();

  const getStreamHandlers = mockGetStreamHandlers as unknown as (
    ...args: unknown[]
  ) => ReturnType<typeof mockGetStreamHandlers>;

  const { result } = renderHookWithProviders(
    () =>
      useStreamResume({
        appSettings,
        getStreamHandlers,
        activeJobs,
        sessionKeyMapRef,
        setSessionLoading,
      }),
    { language: 'en' },
  );

  return { result, sessionKeyMapRef, activeJobs, setSessionLoading };
};

const recordJob = (overrides: Partial<{ tabId: string; generationId: string; lastSeq: number }> = {}) => {
  // amcStreamJobs stamps TAB_ID itself; we want to control tabId, so write raw.
  const storage = window.localStorage;
  storage.setItem(
    `amc_stream_job:${SESSION_ID}`,
    JSON.stringify({
      sessionId: SESSION_ID,
      generationId: overrides.generationId ?? GENERATION_ID,
      jobId: overrides.generationId ?? GENERATION_ID,
      startedAt: STARTED_AT,
      lastSeq: overrides.lastSeq ?? 0,
      tabId: overrides.tabId ?? 'test-tab',
    }),
  );
};

describe('useStreamResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsGeminiProxyRelativePath.mockReturnValue(true);
    mockIsServerManagedApiEnabledForProxyRequests.mockReturnValue(false);
    mockGetGeminiKeyForRequest.mockReturnValue({ key: 'byok-key', isNewKey: false });
    (isGenerationLeaseHeldByTab as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockSendStatelessMessageStreamApi.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips resume when THIS tab holds the lease AND a live in-memory job (send in flight)', async () => {
    recordJob();
    (isGenerationLeaseHeldByTab as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.mocked(hasActiveGenerationJobForSession).mockReturnValue(true);
    const { result } = renderResume();

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    // No second stream attach: the live send already consumes the buffered job.
    expect(mockSendStatelessMessageStreamApi).not.toHaveBeenCalled();
    expect(tryAcquireGenerationLease).not.toHaveBeenCalled();
  });

  it('resumes a refresh even when a stale lease for this tab survives in localStorage', async () => {
    recordJob();
    // A refresh keeps the sessionStorage TAB_ID and the localStorage lease, but
    // the in-memory job map is empty — the guard must NOT treat that as a live
    // send and must not block refresh-resume.
    (isGenerationLeaseHeldByTab as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.mocked(hasActiveGenerationJobForSession).mockReturnValue(false);
    const { result } = renderResume();

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    // Resume proceeds: the stream reattaches and the lease is reacquired.
    expect(mockSendStatelessMessageStreamApi).toHaveBeenCalled();
    expect(tryAcquireGenerationLease).toHaveBeenCalled();
  });

  it('sets the session loading state when a resume starts', async () => {
    recordJob();
    const { result, setSessionLoading } = renderResume();

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    expect(setSessionLoading).toHaveBeenCalledWith(SESSION_ID, true);
  });

  it('resumes with the server-managed sentinel when no key is cached and the proxy is server-managed', async () => {
    recordJob();
    const { result } = renderResume({ serverManaged: true });

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    const call = mockSendStatelessMessageStreamApi.mock.calls[0];
    expect(call[0]).toBe('__SERVER_MANAGED_API_KEY__');
    // streamResume context is passed through.
    expect(call[12]).toEqual({ jobId: GENERATION_ID, lastSeq: 0, onSeq: expect.any(Function) });
  });

  it('resolves a BYOK key via getGeminiKeyForRequest when the session key map is empty', async () => {
    recordJob();
    const { result } = renderResume({ byokKey: 'user-supplied-key' });

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    expect(mockGetGeminiKeyForRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ modelId: MODEL_ID }),
      { skipIncrement: true },
    );
    expect(mockSendStatelessMessageStreamApi.mock.calls[0][0]).toBe('user-supplied-key');
  });

  it('uses the cached key without re-resolving when the in-memory map has one', async () => {
    recordJob();
    const { result } = renderResume({ cachedKey: 'cached-key' });

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    expect(mockGetGeminiKeyForRequest).not.toHaveBeenCalled();
    expect(mockSendStatelessMessageStreamApi.mock.calls[0][0]).toBe('cached-key');
  });

  it('clears the pending job and does not call the API when key resolution fails', async () => {
    recordJob();
    const { result } = renderResume({ byokKey: null });

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    expect(mockSendStatelessMessageStreamApi).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(`amc_stream_job:${SESSION_ID}`)).toBeNull();
  });

  it('skips resume and keeps the pending record when the job belongs to another tab', async () => {
    recordJob({ tabId: 'other-tab' });
    const { result } = renderResume();

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    expect(mockSendStatelessMessageStreamApi).not.toHaveBeenCalled();
    // The foreign-tab record survives for its owning tab.
    expect(window.localStorage.getItem(`amc_stream_job:${SESSION_ID}`)).not.toBeNull();
  });

  it('skips resume and clears the pending job when another tab holds the generation lease', async () => {
    recordJob();
    vi.mocked(tryAcquireGenerationLease).mockReturnValueOnce(false);

    const { result } = renderResume();

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    expect(mockSendStatelessMessageStreamApi).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(`amc_stream_job:${SESSION_ID}`)).toBeNull();
  });

  it('registers the job in activeJobs (stop button available) and unregisters it after completion', async () => {
    recordJob();
    const { result, activeJobs } = renderResume();

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    expect(startActiveGenerationJob).toHaveBeenCalledWith(
      activeJobs,
      SESSION_ID,
      GENERATION_ID,
      expect.any(AbortController),
    );
    expect(unregisterActiveGenerationJob).toHaveBeenCalledWith(activeJobs, GENERATION_ID);
  });

  it('awaits buildGenerationConfig instead of passing a Promise object', async () => {
    recordJob();
    const { result } = renderResume();

    const captured: unknown[] = [];
    mockSendStatelessMessageStreamApi.mockImplementation(
      async (_k: string, _m: string, _h: unknown, _p: unknown, config: unknown) => {
        captured.push(config);
      },
    );

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    // The resolved config object is passed, not a Promise.
    expect(mockBuildGenerationConfig).toHaveBeenCalled();
    expect(captured[0]).toEqual({ temperature: 1 });
  });

  it('clears the pending job on stream error', async () => {
    recordJob();
    const { result } = renderResume();
    mockSendStatelessMessageStreamApi.mockRejectedValueOnce(new Error('boom'));

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    expect(window.localStorage.getItem(`amc_stream_job:${SESSION_ID}`)).toBeNull();
  });

  it('clears the loading state when resume setup fails before the stream starts', async () => {
    recordJob();
    const { result, setSessionLoading } = renderResume();
    // A setup step (buildGenerationConfig) throwing before the stream attaches
    // never reaches streamOnError — the loading flag must still be released or
    // the session is stuck permanently generating.
    mockBuildGenerationConfig.mockRejectedValueOnce(new Error('config boom'));

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    expect(setSessionLoading).toHaveBeenCalledWith(SESSION_ID, false);
    expect(window.localStorage.getItem(`amc_stream_job:${SESSION_ID}`)).toBeNull();
  });

  it('is a no-op when the configured proxy is an absolute URL', async () => {
    recordJob();
    const { result } = renderResume({ proxyRelative: false });

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    expect(mockSendStatelessMessageStreamApi).not.toHaveBeenCalled();
    // Not cleared either — resume simply does not engage.
    expect(window.localStorage.getItem(`amc_stream_job:${SESSION_ID}`)).not.toBeNull();
  });

  it('passes full sessionSettings to getStreamHandlers when provided', async () => {
    recordJob();
    const { result } = renderResume();
    const fullSettings = createChatSettings({ modelId: MODEL_ID, temperature: 0.7 });

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
        sessionSettings: fullSettings,
      });
    });

    const handlerArgs = mockGetStreamHandlers.mock.calls[0] as unknown[];
    // 5th positional arg (index 4) is currentChatSettings.
    expect(handlerArgs[4]).toBe(fullSettings);
  });

  it('replays from seq 0 when resuming, discarding the stale pre-refresh cursor', async () => {
    // A job whose cursor was advanced to 5 by the PREVIOUS page instance. After
    // a refresh the browser has lost the prefix it consumed (streamingStore is
    // gone, DB content is still empty), so resuming from 5 would truncate the
    // message to the tail. The fix replays the full buffered stream from 0.
    recordJob({ lastSeq: 5 });
    const { result } = renderResume();

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    expect(mockSendStatelessMessageStreamApi).toHaveBeenCalledTimes(1);
    const streamResume = mockSendStatelessMessageStreamApi.mock.calls[0][12] as {
      jobId: string;
      lastSeq: number;
      onSeq: (seq: number) => void;
    };
    expect(streamResume.jobId).toBe(GENERATION_ID);
    expect(streamResume.lastSeq).toBe(0);
  });

  it('clears the pending record after a successful resume', async () => {
    recordJob();
    const { result } = renderResume();
    mockSendStatelessMessageStreamApi.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.resumePendingStream({
        sessionId: SESSION_ID,
        generationId: GENERATION_ID,
        modelId: MODEL_ID,
        startedAt: STARTED_AT,
      });
    });

    // The completed job must not linger in localStorage where a later refresh
    // could re-attach it.
    expect(window.localStorage.getItem(`amc_stream_job:${SESSION_ID}`)).toBeNull();
  });
});
