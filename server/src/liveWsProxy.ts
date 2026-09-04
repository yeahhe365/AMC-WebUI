import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ApiServerConfig } from './config.js';

// Sentinel the browser sends when Live should use the server-managed key
// (single-sourced in shared/, mirrored by src/utils/apiKeySelection).
import { SERVER_MANAGED_API_KEY as SERVER_MANAGED_API_KEY_SENTINEL } from '../../shared/serverManagedApiKey.js';

const LIVE_WS_PATH_PREFIX = '/api/live';
// Full upstream base (scheme + host). Production always bridges to the public
// Gemini Live API; the host can be overridden in tests to point the bridge at a
// local WS server.
const UPSTREAM_WS_BASE = 'wss://generativelanguage.googleapis.com';
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

interface LiveWsProxyConfig {
  enableLiveWsProxy: boolean;
  liveWsIdleTimeoutMs: number;
  geminiApiKey?: string;
  upstreamBase: string;
  allowedOrigins: string[];
}

// Log only non-secret context. The key and full upstream URL are never printed.
const logLiveEvent = (event: string, context: Record<string, unknown> = {}) => {
  console.log(`[live-ws] ${event}`, context);
};

const resolveLiveWsProxyConfig = (config: ApiServerConfig): LiveWsProxyConfig => ({
  enableLiveWsProxy: config.enableLiveWsProxy,
  liveWsIdleTimeoutMs: config.liveWsIdleTimeoutMs,
  geminiApiKey: config.liveGeminiApiKey || config.geminiApiKey,
  upstreamBase: config.liveWsUpstreamBase || UPSTREAM_WS_BASE,
  allowedOrigins: config.allowedOrigins,
});

const isPathHandled = (request: IncomingMessage): boolean => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  return requestUrl.pathname === LIVE_WS_PATH_PREFIX || requestUrl.pathname.startsWith(`${LIVE_WS_PATH_PREFIX}/`);
};

interface ResolvedUpstream {
  url: string;
  hadBrowserKey: boolean;
}

// Key priority (BYOK 兜底): a real browser key wins; the sentinel or a missing
// key falls back to the server-managed GEMINI_API_KEY.
export const resolveUpstream = (
  requestUrl: URL,
  upstreamBase: string,
  serverApiKey?: string,
): ResolvedUpstream | null => {
  const restPath = requestUrl.pathname.slice(LIVE_WS_PATH_PREFIX.length) || '/';
  const searchParams = new URLSearchParams(requestUrl.searchParams);

  const queryKey = searchParams.get('key') ?? '';
  const accessToken = searchParams.get('access_token') ?? '';

  let resolvedKey: string;
  let hadBrowserKey = false;

  if (queryKey && queryKey !== SERVER_MANAGED_API_KEY_SENTINEL) {
    resolvedKey = queryKey;
    hadBrowserKey = true;
  } else if (accessToken && accessToken !== SERVER_MANAGED_API_KEY_SENTINEL) {
    resolvedKey = accessToken;
    hadBrowserKey = true;
  } else {
    const serverKey = serverApiKey?.trim();
    if (!serverKey) {
      return null;
    }
    resolvedKey = serverKey;
  }

  // Overwrite the auth param with the resolved key (swaps the sentinel for the
  // real server key, or re-stamps a BYOK key).
  if (searchParams.has('access_token')) {
    searchParams.set('access_token', resolvedKey);
  } else {
    searchParams.set('key', resolvedKey);
  }

  const upstreamUrl = `${upstreamBase}${restPath}?${searchParams.toString()}`;
  return { url: upstreamUrl, hadBrowserKey };
};

const closeBoth = (a: WebSocket, b: WebSocket | null, code: number, reason: string) => {
  try {
    if (b && b.readyState === WebSocket.OPEN) b.close(code, reason);
  } catch {
    // ignore
  }
  try {
    if (a.readyState === WebSocket.OPEN) a.close(code, reason);
  } catch {
    // ignore
  }
};

const bridge = (clientWs: WebSocket, request: IncomingMessage, upstreamHost: string, config: LiveWsProxyConfig) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const resolved = resolveUpstream(requestUrl, upstreamHost, config.geminiApiKey);
  if (!resolved) {
    logLiveEvent('rejected', { reason: 'no-api-key' });
    clientWs.close(1011, 'Live API key not configured');
    return;
  }

  logLiveEvent('connecting', { byok: resolved.hadBrowserKey });

  const upstreamWs = new WebSocket(resolved.url, {
    maxPayload: MAX_MESSAGE_BYTES,
    // The upstream is a fixed public Google host; do not let redirects or
    // per-message headers leak the resolved key.
    perMessageDeflate: false,
  });

  let settled = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  // Client frames can arrive as soon as the browser's socket is open, while the
  // TLS/WS handshake to the upstream is still in flight. The Live SDK sends its
  // setup frame immediately; dropping those frames (the old behavior) hung the
  // session until the idle timeout. Buffer them until the upstream opens, then
  // flush in order.
  const pendingUpstreamMessages: { data: WebSocket.RawData; isBinary: boolean }[] = [];
  const flushPendingUpstreamMessages = () => {
    while (pendingUpstreamMessages.length > 0) {
      const { data, isBinary } = pendingUpstreamMessages.shift()!;
      upstreamWs.send(data, { binary: isBinary });
    }
  };
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logLiveEvent('idle-timeout');
      closeBoth(clientWs, upstreamWs, 1001, 'Idle timeout');
    }, config.liveWsIdleTimeoutMs);
    // Don't keep the event loop alive solely for the idle timer.
    idleTimer.unref?.();
  };

  const teardown = (reason: string) => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (!settled) {
      settled = true;
      logLiveEvent('closed', { reason });
    }
  };

  upstreamWs.on('open', () => {
    if (clientWs.readyState !== WebSocket.OPEN) {
      upstreamWs.close(1001, 'client gone');
      return;
    }
    resetIdle();
    flushPendingUpstreamMessages();
  });

  // client -> upstream
  clientWs.on('message', (data, isBinary) => {
    resetIdle();
    if (upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(data, { binary: isBinary });
    } else if (upstreamWs.readyState === WebSocket.CONNECTING) {
      // Not open yet — hold the frame and flush it once the handshake lands.
      pendingUpstreamMessages.push({ data, isBinary });
    }
    // Any other state (CLOSING/CLOSED) silently drops, matching prior behavior.
  });

  // upstream -> client
  upstreamWs.on('message', (data, isBinary) => {
    if (clientWs.readyState !== WebSocket.OPEN) return;
    resetIdle();
    clientWs.send(data, { binary: isBinary });
  });

  const forwardClose = (source: 'client' | 'upstream', ws: WebSocket, other: WebSocket | null) => {
    ws.on('close', (code, reasonBuf) => {
      teardown(`${source}-close`);
      if (!other) return;
      if (other.readyState === WebSocket.OPEN) {
        const reason = reasonBuf?.toString('utf8') ?? '';
        try {
          other.close(code || 1000, reason || undefined);
        } catch {
          other.close();
        }
      } else if (other.readyState === WebSocket.CONNECTING) {
        // close() is a no-op while the handshake is in flight; terminate forces
        // the socket down so the peer's connection isn't leaked.
        other.terminate();
      }
    });
    ws.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      teardown(`${source}-error`);
      logLiveEvent(`${source}-error`, { message });
      closeBoth(clientWs, upstreamWs, 1011, 'WebSocket error');
    });
  };

  forwardClose('client', clientWs, upstreamWs);
  forwardClose('upstream', upstreamWs, clientWs);

  // If the upstream never opens, surface a failure to the client.
  upstreamWs.on('unexpected-response', (_req, res) => {
    teardown('upstream-rejected');
    logLiveEvent('upstream-rejected', { status: res.statusCode });
    closeBoth(clientWs, upstreamWs, 1011, 'Upstream rejected upgrade');
  });
};

// Origin check mirrors the HTTP CORS layer (cors.ts): no allowlist configured →
// allow; non-browser clients send no Origin header → allow; otherwise the
// origin must match. WebSockets bypass CORS, so without this check any webpage
// could open a cross-site WS and consume the server-managed key (CSWSH).
const isOriginAllowed = (request: IncomingMessage, allowedOrigins: string[]): boolean => {
  if (!allowedOrigins.length) return true;
  const origin = request.headers.origin;
  if (!origin) return true;
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
};

export function attachLiveWsUpgrade(server: Server, config: ApiServerConfig): void {
  const liveConfig = resolveLiveWsProxyConfig(config);

  if (!liveConfig.enableLiveWsProxy) {
    // Owning the 'upgrade' event disables Node's default destroy-on-upgrade
    // behavior, so every non-matching request must be destroyed explicitly or
    // its socket leaks.
    server.on('upgrade', (_request, socket) => {
      socket.destroy();
    });
    return;
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on('upgrade', (request, socket, head) => {
    if (!isPathHandled(request)) {
      // Same as above: an upgrade listener takes over the event, so unhandled
      // paths must not leave the socket hanging.
      socket.destroy();
      return;
    }

    if (!isOriginAllowed(request, liveConfig.allowedOrigins)) {
      logLiveEvent('rejected', { reason: 'origin-not-allowed' });
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      bridge(clientWs, request, liveConfig.upstreamBase, liveConfig);
    });
  });
}
