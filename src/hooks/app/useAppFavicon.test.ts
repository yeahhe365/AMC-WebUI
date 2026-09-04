import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render/renderer';
import type { ChatMessage } from '@/types';
import type { GenerationLease } from '@/features/message-sender/generationLease';

// Fixed tab id so isLocalGeneration's ownership check is deterministic.
vi.mock('@/stores/tabIdentity', () => ({
  TAB_ID: 'test-tab',
}));

const { mockReadGenerationLease, mockIsGenerationLeaseFresh, mockGetTintedFaviconUrl } = vi.hoisted(() => ({
  mockReadGenerationLease: vi.fn<(sessionId: string) => GenerationLease | null>(() => null),
  mockIsGenerationLeaseFresh: vi.fn<(lease: GenerationLease) => boolean>(() => true),
  // The hook tints the favicon at runtime via canvas. In jsdom there's no real
  // image decode, so mock the tinting to return a deterministic href per state
  // color. The color→state mapping mirrors FAVICON_STATE_COLORS in the source.
  mockGetTintedFaviconUrl: vi.fn<(baseSrc: string, color: string) => Promise<string | null>>((_baseSrc, color) => {
    if (color === '#4f7cf5') {
      return Promise.resolve('http://localhost/favicon-generating.png');
    }
    if (color === '#22c55e') {
      return Promise.resolve('http://localhost/favicon-success.png');
    }
    if (color === '#ef4444') {
      return Promise.resolve('http://localhost/favicon-error.png');
    }
    return Promise.resolve(null);
  }),
}));

vi.mock('@/features/message-sender/generationLease', () => ({
  readGenerationLease: mockReadGenerationLease,
  isGenerationLeaseFresh: mockIsGenerationLeaseFresh,
}));

vi.mock('@/utils/faviconTint', () => ({
  getTintedFaviconUrl: mockGetTintedFaviconUrl,
}));

// Minimal mutable chatStore mock: the hook subscribes to loadingSessionIds /
// activeMessages via the selector form, and also reads them imperatively via
// getState() inside evaluate() (and the visibility handler reads activeSessionId
// from the store, not props). The mock keeps a single shared state object so
// setState mutations are observed by both paths.
const mockChatStoreState = vi.hoisted(() => ({
  activeSessionId: null as string | null,
  loadingSessionIds: new Set<string>(),
  activeMessages: [] as ChatMessage[],
}));

const mockChatStoreSubscribers = vi.hoisted(() => new Set<(state: unknown, previousState: unknown) => void>());

vi.mock('@/stores/chatStore', () => {
  const useChatStore = Object.assign(
    (selector?: (state: typeof mockChatStoreState) => unknown) =>
      selector ? selector(mockChatStoreState) : mockChatStoreState,
    {
      getState: () => mockChatStoreState,
      setState: (partial: Partial<typeof mockChatStoreState>) => {
        const previous = { ...mockChatStoreState };
        Object.assign(mockChatStoreState, partial);
        mockChatStoreSubscribers.forEach((subscriber) => subscriber(mockChatStoreState, previous));
      },
      subscribe: (listener: (state: unknown, previousState: unknown) => void) => {
        mockChatStoreSubscribers.add(listener);
        return () => mockChatStoreSubscribers.delete(listener);
      },
    },
  );
  return { useChatStore };
});

import { useAppFavicon, isLocalGeneration, getOutcomeFromMessage } from './useAppFavicon';

const DEFAULT_HREF = 'http://localhost/favicon.png';
const GENERATING_HREF = 'http://localhost/favicon-generating.png';
const SUCCESS_HREF = 'http://localhost/favicon-success.png';
const ERROR_HREF = 'http://localhost/favicon-error.png';

const setFaviconLink = (href = DEFAULT_HREF) => {
  document.head.innerHTML = `<link rel="icon" id="favicon" href="${href}" type="image/png">`;
};

const faviconHref = () => document.querySelector<HTMLLinkElement>('#favicon')?.href ?? null;

const setLease = (tabId: string) => {
  mockReadGenerationLease.mockReturnValue({ tabId, generationId: 'gen-1', ts: Date.now() });
  mockIsGenerationLeaseFresh.mockReturnValue(true);
};

const clearLease = () => {
  mockReadGenerationLease.mockReturnValue(null);
};

const setActiveMessages = (messages: ChatMessage[]) => {
  mockChatStoreState.activeMessages = messages;
};

const setLoading = (sessionId: string, isLoading: boolean) => {
  const next = new Set(mockChatStoreState.loadingSessionIds);
  if (isLoading) {
    next.add(sessionId);
  } else {
    next.delete(sessionId);
  }
  mockChatStoreState.loadingSessionIds = next;
};

// Keep the store's activeSessionId in sync with the prop the hook receives,
// so the visibility handler — which reads activeSessionId from the store —
// evaluates against the same session the test rerendered with.
const setActiveSession = (sessionId: string | null) => {
  mockChatStoreState.activeSessionId = sessionId;
};

const setDocumentHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
};

const fireVisibility = (hidden: boolean) => {
  setDocumentHidden(hidden);
  document.dispatchEvent(new Event('visibilitychange'));
};

// Drain the async favicon-tinting IIFE so stateHrefs is populated before the
// test asserts. Microtasks are not faked by vi.useFakeTimers(), so a single
// awaited microtask inside act flushes the Promise.all in the tinting effect.
const flushTinting = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

interface Props {
  activeSessionId: string | null;
}

const render = async (initial: Props) => {
  let props: Props = initial;
  setActiveSession(initial.activeSessionId);
  const view = renderHook(() => useAppFavicon(props));
  await flushTinting();
  const rerender = async (next: Props) => {
    await act(async () => {
      props = next;
      setActiveSession(next.activeSessionId);
      view.rerender();
    });
  };
  return { rerender, unmount: view.unmount };
};

const modelMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'gen-1',
  role: 'model',
  content: 'hello',
  timestamp: new Date(),
  generationStartTime: new Date(),
  ...overrides,
});

describe('getOutcomeFromMessage', () => {
  it('classifies an error-role message as error', () => {
    expect(getOutcomeFromMessage({ role: 'error', stoppedByUser: false })).toBe('error');
  });

  it('classifies a user-stopped message as stopped', () => {
    expect(getOutcomeFromMessage({ role: 'model', stoppedByUser: true })).toBe('stopped');
  });

  it('classifies a normal model message as success', () => {
    expect(getOutcomeFromMessage({ role: 'model', stoppedByUser: false })).toBe('success');
  });

  it('defaults to success when no message is supplied', () => {
    expect(getOutcomeFromMessage(undefined)).toBe('success');
  });
});

describe('useAppFavicon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setFaviconLink();
    setDocumentHidden(false);
    clearLease();
    mockIsGenerationLeaseFresh.mockReturnValue(true);
    mockChatStoreState.loadingSessionIds = new Set();
    mockChatStoreState.activeMessages = [];
    mockChatStoreState.activeSessionId = null;
    mockChatStoreSubscribers.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows generating while a locally-owned generation is in flight, then success on completion', async () => {
    setLease('test-tab');
    setActiveMessages([modelMessage()]);
    const { rerender } = await render({ activeSessionId: 'session-1' });

    setLoading('session-1', true);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(GENERATING_HREF);

    setLoading('session-1', false);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(SUCCESS_HREF);
  });

  it('shows the generating variant immediately when mounted mid-generation this tab owns', async () => {
    setLease('test-tab');
    setActiveMessages([modelMessage()]);
    setLoading('session-1', true);
    await render({ activeSessionId: 'session-1' });

    expect(faviconHref()).toBe(GENERATING_HREF);
  });

  it('does not change the favicon for a generation owned by another tab', async () => {
    setLease('other-tab');
    setActiveMessages([modelMessage()]);
    const { rerender } = await render({ activeSessionId: 'session-1' });

    setLoading('session-1', true);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(DEFAULT_HREF);

    setLoading('session-1', false);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(DEFAULT_HREF);
  });

  it('keeps showing generating through a visibilitychange while still in flight (regression)', async () => {
    setLease('test-tab');
    setActiveMessages([modelMessage()]);
    setLoading('session-1', true);
    const { rerender } = await render({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(GENERATING_HREF);

    // Switch away and back: the favicon must stay generating, not be cleared.
    fireVisibility(true);
    expect(faviconHref()).toBe(GENERATING_HREF);
    fireVisibility(false);
    expect(faviconHref()).toBe(GENERATING_HREF);

    // Completing after the round-trip still lands on success.
    setLoading('session-1', false);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(SUCCESS_HREF);
  });

  it('keeps the completion badge indefinitely until the user interacts (pointerdown clears it)', async () => {
    setLease('test-tab');
    setActiveMessages([modelMessage()]);
    const { rerender } = await render({ activeSessionId: 'session-1' });
    setLoading('session-1', true);
    await rerender({ activeSessionId: 'session-1' });
    setLoading('session-1', false);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(SUCCESS_HREF);

    // Even after a long fake-timer advance the badge must stay.
    act(() => {
      vi.advanceTimersByTime(1_000_000);
    });
    expect(faviconHref()).toBe(SUCCESS_HREF);

    // pointerdown on the document dismisses it.
    act(() => {
      document.dispatchEvent(new Event('pointerdown'));
    });
    expect(faviconHref()).toBe(DEFAULT_HREF);
  });

  it.each([
    ['wheel', () => document.dispatchEvent(new Event('wheel'))],
    ['mousemove', () => document.dispatchEvent(new Event('mousemove'))],
    [
      // scroll 不冒泡：必须从内层容器派发，以此验证监听用的是捕获阶段。
      'scroll inside a nested container',
      () => {
        const child = document.createElement('div');
        document.body.appendChild(child);
        try {
          child.dispatchEvent(new Event('scroll', { bubbles: false }));
        } finally {
          child.remove();
        }
      },
    ],
  ])('treats %s as a "viewed" signal', async (_label, dispatch) => {
    setLease('test-tab');
    setActiveMessages([modelMessage()]);
    const { rerender, unmount } = await render({ activeSessionId: 'session-1' });
    try {
      setLoading('session-1', true);
      await rerender({ activeSessionId: 'session-1' });
      setLoading('session-1', false);
      await rerender({ activeSessionId: 'session-1' });
      expect(faviconHref()).toBe(SUCCESS_HREF);

      act(() => {
        dispatch();
      });
      expect(faviconHref()).toBe(DEFAULT_HREF);
    } finally {
      // 每个用例独立挂载：节流窗口是 per-effect 的，复用挂载会让后一个
      // 用例落在前一个的窗口内而与真实时钟赛跑。
      act(() => {
        unmount();
      });
    }
  });

  it('keeps the generating favicon through activity (activity is not a "viewed" signal yet)', async () => {
    setLease('test-tab');
    setActiveMessages([modelMessage()]);
    setLoading('session-1', true);
    await render({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(GENERATING_HREF);

    act(() => {
      document.dispatchEvent(new Event('wheel'));
      document.dispatchEvent(new Event('mousemove'));
      document.dispatchEvent(new Event('pointerdown'));
    });
    expect(faviconHref()).toBe(GENERATING_HREF);
  });

  it('shows the error favicon when the completed message has role=error', async () => {
    setLease('test-tab');
    setActiveMessages([modelMessage({ role: 'error' })]);
    const { rerender } = await render({ activeSessionId: 'session-1' });
    setLoading('session-1', true);
    await rerender({ activeSessionId: 'session-1' });
    setLoading('session-1', false);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(ERROR_HREF);
  });

  it('goes straight to default with no badge when the generation was stopped by the user', async () => {
    setLease('test-tab');
    setActiveMessages([modelMessage({ stoppedByUser: true })]);
    const { rerender } = await render({ activeSessionId: 'session-1' });
    setLoading('session-1', true);
    await rerender({ activeSessionId: 'session-1' });
    setLoading('session-1', false);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(DEFAULT_HREF);
  });

  it('resets to default when the active session changes after a done state', async () => {
    setLease('test-tab');
    setActiveMessages([modelMessage()]);
    const { rerender } = await render({ activeSessionId: 'session-1' });
    setLoading('session-1', true);
    await rerender({ activeSessionId: 'session-1' });
    setLoading('session-1', false);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(SUCCESS_HREF);

    await rerender({ activeSessionId: 'session-2' });
    expect(faviconHref()).toBe(DEFAULT_HREF);
  });

  it('re-arms generating when switching back to a session this tab is still generating', async () => {
    setLease('test-tab');
    setActiveMessages([modelMessage()]);
    setLoading('session-1', true);
    const { rerender } = await render({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(GENERATING_HREF);

    // Switch away to a session this tab is not generating → default.
    clearLease();
    setLoading('session-2', true);
    await rerender({ activeSessionId: 'session-2' });
    expect(faviconHref()).toBe(DEFAULT_HREF);

    // Switch back to the still-generating session this tab owns → generating.
    setLease('test-tab');
    setLoading('session-1', true);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(GENERATING_HREF);
  });

  it('shows success when returning to a session that completed while away, then clears on visibilitychange', async () => {
    setLease('test-tab');
    setActiveMessages([modelMessage()]);
    setLoading('session-1', true);
    const { rerender } = await render({ activeSessionId: 'session-1' });

    // Switch to session-2 before completion.
    clearLease();
    await rerender({ activeSessionId: 'session-2' });

    // session-1 completes while away: clear lease + loading, but leave the
    // terminal message so the outcome can be read on return.
    setLoading('session-1', false);
    setLease('test-tab');
    clearLease(); // generation over → lease released

    // Switch back: completed badge shows, not default.
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(SUCCESS_HREF);

    // Switched back is considered "returning to the tab", so the next
    // visibilitychange to visible clears it.
    fireVisibility(true);
    expect(faviconHref()).toBe(SUCCESS_HREF);
    fireVisibility(false);
    expect(faviconHref()).toBe(DEFAULT_HREF);
  });

  it('does not flash success across a retry where loading never flips false', async () => {
    setLease('test-tab');
    setActiveMessages([modelMessage()]);
    const { rerender } = await render({ activeSessionId: 'session-1' });
    setLoading('session-1', true);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(GENERATING_HREF);

    // Retry handoff: lease is re-acquired under a fresh generation id without
    // isLoading ever going false. The favicon stays generating throughout.
    setLease('test-tab');
    setLoading('session-1', true);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(GENERATING_HREF);

    setLoading('session-1', false);
    await rerender({ activeSessionId: 'session-1' });
    expect(faviconHref()).toBe(SUCCESS_HREF);
  });

  it('falls back to the default href when tinting fails for a state', async () => {
    // Make tinting return null for every color → getStateHref falls back.
    mockGetTintedFaviconUrl.mockResolvedValue(null);
    setLease('test-tab');
    setActiveMessages([modelMessage()]);
    setLoading('session-1', true);
    await render({ activeSessionId: 'session-1' });

    expect(faviconHref()).toBe(DEFAULT_HREF);
  });
});

describe('isLocalGeneration', () => {
  it('returns true when a fresh lease matches the tab id', () => {
    mockReadGenerationLease.mockReturnValue({ tabId: 'test-tab', generationId: 'g', ts: Date.now() });
    mockIsGenerationLeaseFresh.mockReturnValue(true);
    expect(isLocalGeneration('session-1')).toBe(true);
  });

  it('returns false when the lease belongs to another tab', () => {
    mockReadGenerationLease.mockReturnValue({ tabId: 'other-tab', generationId: 'g', ts: Date.now() });
    expect(isLocalGeneration('session-1')).toBe(false);
  });

  it('returns false when there is no lease or no session', () => {
    mockReadGenerationLease.mockReturnValue(null);
    expect(isLocalGeneration('session-1')).toBe(false);
    expect(isLocalGeneration(null)).toBe(false);
  });

  it('returns false when the lease is stale', () => {
    mockReadGenerationLease.mockReturnValue({ tabId: 'test-tab', generationId: 'g', ts: 0 });
    mockIsGenerationLeaseFresh.mockReturnValue(false);
    expect(isLocalGeneration('session-1')).toBe(false);
  });
});
