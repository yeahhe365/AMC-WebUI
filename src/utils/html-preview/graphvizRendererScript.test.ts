import { describe, expect, it, vi } from 'vitest';
import { evictOldestPendingRender, isProbablyCompleteDot, GRAPHVIZ_RENDERER_SCRIPT } from './graphvizRendererScript';

type GraphvizApi = { renderAll: () => void };

describe('isProbablyCompleteDot', () => {
  it('accepts a complete digraph', () => {
    expect(isProbablyCompleteDot('digraph { A -> B }')).toBe(true);
  });

  it('accepts a multi-line dot with quoted labels', () => {
    const dot = `digraph {
      A[label="parse request"];
      B[label="return result"];
      A -> B;
    }`;
    expect(isProbablyCompleteDot(dot)).toBe(true);
  });

  it('rejects an unclosed opening brace', () => {
    expect(isProbablyCompleteDot('digraph { A -> B')).toBe(false);
  });

  it('rejects an unclosed double quote inside a label', () => {
    expect(isProbablyCompleteDot('digraph { A[label="x] }')).toBe(false);
  });

  it('ignores braces/operators inside a quoted label', () => {
    // The `{` and `->` inside the quoted label must not unbalance the scan.
    expect(isProbablyCompleteDot('digraph { A[label="a { b -> c"] }')).toBe(true);
  });

  it('rejects an unbalanced bracket (node attribute)', () => {
    expect(isProbablyCompleteDot('digraph { A[shape=box }')).toBe(false);
  });

  it('rejects empty / whitespace-only input', () => {
    expect(isProbablyCompleteDot('')).toBe(false);
    expect(isProbablyCompleteDot('   ')).toBe(false);
  });

  it('accepts a complete dot with a trailing # comment containing quotes/braces', () => {
    expect(isProbablyCompleteDot('digraph { a -> b } # comment " with { brace')).toBe(true);
  });

  it('accepts a complete dot with an unbalanced quote inside a // line comment', () => {
    expect(isProbablyCompleteDot('digraph { a -> b }\n// line " unbalanced')).toBe(true);
  });

  it('accepts a complete dot with a /* block { comment */', () => {
    expect(isProbablyCompleteDot('digraph { a -> b } /* block { comment */')).toBe(true);
  });

  it('accepts an escaped quote inside a label', () => {
    expect(isProbablyCompleteDot('digraph { a[label="say \\" hi"] -> b }')).toBe(true);
  });

  it('accepts a complete dot with a trailing # comment to EOF (line comments need no terminator)', () => {
    expect(isProbablyCompleteDot('digraph { a -> b } # trailing')).toBe(true);
  });

  it('rejects an unterminated block comment', () => {
    expect(isProbablyCompleteDot('digraph { a -> b } /* xxx')).toBe(false);
  });

  it('keeps braces inside a block comment from unbalancing the scan', () => {
    expect(isProbablyCompleteDot('digraph { a -> b } /* { } { */')).toBe(true);
  });
});

describe('evictOldestPendingRender', () => {
  const SIG = 'data-amc-graphviz-sig';
  const STATE = 'data-amc-graphviz-state';

  const connectedNode = (): Element => {
    const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html');
    const div = doc.createElement('div');
    div.setAttribute(SIG, 'abc');
    div.setAttribute(STATE, 'pending');
    doc.body.appendChild(div);
    return div;
  };

  it('removes the oldest entry and clears the evicted node sig/state so it can be re-requested', () => {
    const node = connectedNode();
    const pendingById = new Map<string, { node: Element; sig: string }>([
      ['a', { node, sig: 'abc' }],
      ['b', { node: connectedNode(), sig: 'xyz' }],
    ]);

    evictOldestPendingRender(pendingById, SIG, STATE);

    expect(pendingById.has('a')).toBe(false);
    expect(pendingById.has('b')).toBe(true);
    // The evicted node's sig/state are cleared so the next scan re-requests.
    expect(node.hasAttribute(SIG)).toBe(false);
    expect(node.hasAttribute(STATE)).toBe(false);
  });

  it('does not touch the evicted node when it was disconnected', () => {
    const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html');
    const detached = doc.createElement('div');
    detached.setAttribute(SIG, 'abc');
    detached.setAttribute(STATE, 'pending');
    // Not appended to the document: isConnected is false.
    const pendingById = new Map<string, { node: Element; sig: string }>([['a', { node: detached, sig: 'abc' }]]);

    evictOldestPendingRender(pendingById, SIG, STATE);

    expect(pendingById.size).toBe(0);
    expect(detached.hasAttribute(SIG)).toBe(true);
  });

  it('is a no-op on an empty map', () => {
    expect(() => evictOldestPendingRender(new Map(), SIG, STATE)).not.toThrow();
  });
});

const createGraphvizDoc = (dot: string): Document => {
  const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html');
  const div = doc.createElement('div');
  div.setAttribute('data-amc-graphviz', dot);
  doc.body.appendChild(div);
  return doc;
};

/**
 * Runs the renderer against a detached jsdom document via the same `new
 * Function` bridge the export path uses. A stub `window.parent` records posted
 * render requests so tests can simulate a parent reply, and the window message
 * listener is exposed so tests can dispatch replies from any source (including
 * a forged self-post).
 */
const runRenderer = (
  doc: Document,
): {
  api: GraphvizApi;
  requests: Array<{ id: string; dot: string }>;
  dispatch: (payload: unknown, source?: unknown) => void;
} => {
  const requests: Array<{ id: string; dot: string }> = [];
  let messageListener: ((event: { data: unknown; source: unknown }) => void) | null = null;

  const parentStub = {
    postMessage: (message: { event: string; payload: { id: string; dot: string } }) => {
      requests.push(message.payload);
    },
  };

  const stubWindow: Record<string, unknown> = {
    document: doc,
    MutationObserver: undefined,
    requestAnimationFrame: (fn: () => void) => fn(),
    addEventListener: (_type: string, listener: unknown) => {
      messageListener = listener as (event: { data: unknown; source: unknown }) => void;
    },
    navigator: {},
    location: { origin: 'null' },
    parent: parentStub,
  };

  const run = new Function('window', 'document', GRAPHVIZ_RENDERER_SCRIPT);
  run(stubWindow, doc);

  return {
    api: (stubWindow as unknown as { __amcGraphviz: GraphvizApi }).__amcGraphviz,
    requests,
    dispatch: (payload, source = parentStub) => {
      messageListener?.({
        data: { channel: 'amc-webui-html-preview', event: 'graphviz-render-response', payload },
        source,
      });
    },
  };
};

/**
 * Runs the renderer against the REAL jsdom window/document so the MutationObserver
 * pipeline (P1-1/P1-4) is exercised end to end. The script is executed with the
 * real window (its own addEventListener/MutationObserver/timers), only
 * `window.parent` is stubbed to capture posted render requests. Timers are left
 * real so the test can drive the 350ms debounce with fake timers externally.
 */
const runRendererLive = (): {
  node: HTMLElement;
  requests: Array<{ id: string; dot: string }>;
  cleanup: () => void;
} => {
  const doc = window.document;
  // Reset the live body so each test starts from a clean document.
  doc.body.replaceChildren();
  const node = doc.createElement('div');
  node.setAttribute('data-amc-graphviz', 'digraph { A -> B }');
  doc.body.appendChild(node);

  const requests: Array<{ id: string; dot: string }> = [];
  const parentStub = {
    postMessage: (message: { event: string; payload: { id: string; dot: string } }) => {
      requests.push(message.payload);
    },
  };

  const originalParent = window.parent;
  Object.defineProperty(window, 'parent', { configurable: true, value: parentStub });

  const run = new Function('window', 'document', GRAPHVIZ_RENDERER_SCRIPT);
  run(window, doc);

  return {
    node,
    requests,
    cleanup: () => {
      doc.body.replaceChildren();
      Object.defineProperty(window, 'parent', { configurable: true, value: originalParent });
    },
  };
};

describe('GRAPHVIZ_RENDERER_SCRIPT', () => {
  it('posts a render request for a complete dot and injects the SVG reply', () => {
    const doc = createGraphvizDoc('digraph { A -> B }');
    const { requests, dispatch } = runRenderer(doc);

    const node = doc.querySelector('[data-amc-graphviz]')!;
    expect(requests).toHaveLength(1);
    expect(requests[0]!.dot).toBe('digraph { A -> B }');
    expect(node.getAttribute('data-amc-graphviz-state')).toBe('pending');

    dispatch({
      id: requests[0]!.id,
      ok: true,
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
    });

    expect(node.getAttribute('data-amc-graphviz-state')).toBe('rendered');
    expect(node.querySelector('svg')).not.toBeNull();
  });

  it('keeps an incomplete streaming dot pending without posting a request', () => {
    const doc = createGraphvizDoc('digraph { A ->');
    const { requests } = runRenderer(doc);

    const node = doc.querySelector('[data-amc-graphviz]')!;
    expect(requests).toHaveLength(0);
    expect(node.getAttribute('data-amc-graphviz-state')).toBe('pending');
  });

  it('renders once an incomplete dot becomes complete', () => {
    const doc = createGraphvizDoc('digraph { A ->');
    const { api, requests } = runRenderer(doc);
    expect(requests).toHaveLength(0);

    const node = doc.querySelector('[data-amc-graphviz]')!;
    node.setAttribute('data-amc-graphviz', 'digraph { A -> B }');
    api.renderAll();

    expect(requests).toHaveLength(1);
    expect(requests[0]!.dot).toBe('digraph { A -> B }');
  });

  it('shows the dot source as fallback and reports a diagnostic on render failure', () => {
    const doc = createGraphvizDoc('digraph { A -> B }');
    const { requests, dispatch } = runRenderer(doc);

    const node = doc.querySelector('[data-amc-graphviz]')!;
    dispatch({ id: requests[0]!.id, ok: false, error: 'too-large' });

    expect(node.getAttribute('data-amc-graphviz-state')).toBe('error');
    expect(node.textContent).toContain('digraph { A -> B }');
  });

  it('rejects a forged response from a non-parent source', () => {
    const doc = createGraphvizDoc('digraph { A -> B }');
    const { requests, dispatch } = runRenderer(doc);

    const node = doc.querySelector('[data-amc-graphviz]')!;
    // The node's sig is only set after the request is posted, so it is present.
    dispatch(
      { id: requests[0]!.id, ok: true, svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' },
      { postMessage: () => {} }, // a self-posted message: source !== window.parent
    );

    // A forged reply must not inject anything.
    expect(node.querySelector('svg')).toBeNull();
    expect(node.getAttribute('data-amc-graphviz-state')).toBe('pending');
  });

  it('drops a stale response when the dot advanced while the render was in flight', () => {
    const doc = createGraphvizDoc('digraph { A -> B }');
    const { requests, dispatch } = runRenderer(doc);

    const node = doc.querySelector('[data-amc-graphviz]')!;
    // Stream advances to a new dot while the request is pending.
    node.setAttribute('data-amc-graphviz', 'digraph { A -> C }');

    dispatch({ id: requests[0]!.id, ok: true, svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' });

    // The stale response must not inject an SVG for the old dot.
    expect(node.querySelector('svg')).toBeNull();
  });

  it('skips re-requesting a node whose sig already matches (self-render guard)', () => {
    const doc = createGraphvizDoc('digraph { A -> B }');
    const { api, requests } = runRenderer(doc);
    expect(requests).toHaveLength(1);

    // A mutation observer scan re-runs renderAll; the sig is unchanged so no
    // second request and no state churn.
    api.renderAll();
    expect(requests).toHaveLength(1);
  });

  it('evicts the oldest pending request and lets the evicted node be re-requested (no permanent pending)', () => {
    // More graphviz nodes than MAX_PENDING (64): the LRU eviction must clear the
    // evicted node's sig so the next scan re-requests it instead of leaving it
    // stuck in "pending" forever (P0-1 regression).
    const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html');
    const nodes: Element[] = [];
    for (let i = 0; i < 70; i += 1) {
      const div = doc.createElement('div');
      div.setAttribute('data-amc-graphviz', `digraph { N${i} -> M${i} }`);
      doc.body.appendChild(div);
      nodes.push(div);
    }

    const { api, requests } = runRenderer(doc);

    // Every node is requested at least once; the LRU cap keeps pendingById ≤ 64,
    // evicting the oldest entries as newer ones arrive.
    expect(requests.length).toBe(70);

    // The 6 evicted nodes are the earliest-scanned: their sig must be cleared so
    // a re-scan re-requests them (P0-1 regression — otherwise they'd stay in
    // "pending" forever with a dropped reply).
    const evictedCleared = nodes.slice(0, 6).every((n) => !n.hasAttribute('data-amc-graphviz-sig'));
    expect(evictedCleared).toBe(true);

    // A re-scan re-requests the evicted nodes (sig was cleared), so they are not
    // permanently stuck: the request count grows on the second pass.
    api.renderAll();
    expect(requests.length).toBeGreaterThan(70);
  });

  it('debounces repeated streaming dot updates into a single render request after the quiet period', async () => {
    vi.useFakeTimers();
    const { node, requests, cleanup } = runRendererLive();
    try {
      // The initial renderAll fires one request synchronously.
      await Promise.resolve();
      const baseline = requests.length;
      expect(baseline).toBeGreaterThan(0);

      // Simulate a streaming burst: 5 rapid attribute changes. The MutationObserver
      // collects them all as dirty; only a single debounced request should fire.
      const before = requests.length;
      for (let i = 0; i < 5; i += 1) {
        node.setAttribute('data-amc-graphviz', `digraph { A${i} -> B${i} }`);
        // Let the MutationObserver microtask run between changes.
        await Promise.resolve();
      }

      // Nothing should have fired yet (debounce is still quiet).
      expect(requests.length).toBe(before);

      // Advance past the 350ms debounce: exactly one new request.
      await vi.advanceTimersByTimeAsync(400);
      expect(requests.length).toBe(before + 1);
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it('drops the last streaming snapshot when the content advanced during the debounce window', async () => {
    vi.useFakeTimers();
    const { node, requests, cleanup } = runRendererLive();
    try {
      await Promise.resolve();
      const before = requests.length;

      // Change the dot, then change it again before the debounce fires.
      node.setAttribute('data-amc-graphviz', 'digraph { X -> Y }');
      await Promise.resolve();
      node.setAttribute('data-amc-graphviz', 'digraph { M -> N }');
      await Promise.resolve();

      await vi.advanceTimersByTimeAsync(400);
      // Exactly one request, carrying the final dot (not the intermediate one).
      expect(requests.length).toBe(before + 1);
      expect(requests[requests.length - 1]!.dot).toBe('digraph { M -> N }');
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });
});
