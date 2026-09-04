// Minimal static + reverse-proxy server for the Docker web container (Dockerfile.web).
// Serves the web container:
//   - serves static files from /usr/share/nginx/html with SPA fallback to index.html
//   - proxies /api/* to http://api:3001 (path preserved, body + response streamed)
//   - raw-socket-forwards the /api/live WebSocket upgrade to api:3001 (http.request
//     cannot carry the WS upgrade frame, so upgrades must be bridged at the socket
//     layer rather than proxied like a normal request)
//   - generates /runtime-config.js at startup from RUNTIME_* env vars
//   - long-cache headers for /assets/*, no-store for /runtime-config.js
// Uses only Node built-ins (http, fs, path) so no npm install is needed in the image.
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 80);
const ROOT = process.env.WEB_ROOT || '/app/public';
const API_UPSTREAM = process.env.API_UPSTREAM || 'http://api:3001';
const LIVE_WS_PATH = '/api/live';

// --- runtime-config.js generation ---
const toBool = (value) => /^(1|true|yes|on)$/i.test(String(value || '').trim());
const trim = (value) => String(value || '').trim();
const jsonStringOrNull = (value) => {
  const trimmed = trim(value);
  if (!trimmed) return 'null';
  return JSON.stringify(trimmed);
};

function writeRuntimeConfig() {
  const config = {
    serverManagedApi: toBool(process.env.RUNTIME_SERVER_MANAGED_API),
    useCustomApiConfig: toBool(process.env.RUNTIME_USE_CUSTOM_API_CONFIG ?? 'true'),
    useApiProxy: toBool(process.env.RUNTIME_USE_API_PROXY ?? 'true'),
    apiProxyUrl: JSON.parse(jsonStringOrNull(process.env.RUNTIME_API_PROXY_URL ?? '/api/gemini')),
    liveApiBaseUrl: JSON.parse(jsonStringOrNull(process.env.RUNTIME_LIVE_API_BASE_URL)),
    thirdPartyProxyUrl: JSON.parse(jsonStringOrNull(process.env.RUNTIME_THIRD_PARTY_PROXY_URL)),
    pyodideBaseUrl: JSON.parse(jsonStringOrNull(process.env.RUNTIME_PYODIDE_BASE_URL)),
  };
  const content = `window.__AMC_RUNTIME_CONFIG__ = ${JSON.stringify({ ...(globalThis.__AMC_RUNTIME_CONFIG__ || {}), ...config }, null, 2)};`;
  fs.writeFileSync(path.join(ROOT, 'runtime-config.js'), content);
  console.log('[web] runtime-config.js written');
}

// --- MIME types ---
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// --- proxy /api/* to upstream, preserving method/path/query/body, streaming response ---
function proxyApi(req, res) {
  const url = new URL(req.url, API_UPSTREAM);
  const upstream = new URL(url.pathname + url.search, API_UPSTREAM);

  const proxyReq = http.request(
    upstream,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: upstream.host,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    console.error('[web] api proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
    }
  });

  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);

  // Guard against path traversal.
  const resolved = path.normalize(path.join(ROOT, pathname));
  if (!resolved.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let filePath = resolved;
  let stat;
  try {
    stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = fs.statSync(filePath);
    }
  } catch {
    // SPA fallback: serve index.html for unknown routes (non-asset requests)
    if (path.extname(pathname) === '') {
      try {
        filePath = path.join(ROOT, 'index.html');
        stat = fs.statSync(filePath);
      } catch {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };

  // Cache policy
  if (pathname === '/runtime-config.js') {
    headers['cache-control'] = 'no-store';
  } else if (pathname.startsWith('/assets/')) {
    headers['cache-control'] = 'public, max-age=31536000, immutable';
  } else if (ext === '.mjs') {
    headers['cache-control'] = 'no-cache';
  } else if (ext === '.html') {
    // index.html must always revalidate so new builds' chunk hashes replace stale ones.
    headers['cache-control'] = 'no-cache';
  }

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return proxyApi(req, res);
  }
  return serveStatic(req, res);
});

// WebSocket upgrade for /api/live: bridge the raw TCP socket to api:3001.
// http.request-based proxyApi cannot forward the WS upgrade handshake, so we
// open a plain TCP socket to the upstream and splice the two sockets together,
// letting the api container terminate the actual WS frames.
const isLiveWsUpgrade = (req) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  return pathname === LIVE_WS_PATH || pathname.startsWith(`${LIVE_WS_PATH}/`);
};

server.on('upgrade', (req, socket, head) => {
  if (!isLiveWsUpgrade(req)) {
    socket.destroy();
    return;
  }

  const upstream = new URL(API_UPSTREAM);
  const upstreamPort = Number(upstream.port) || (upstream.protocol === 'https:' ? 443 : 80);
  const upstreamSocket = net.connect(upstreamPort, upstream.hostname);

  let cleanup = () => {
    cleanup = () => {};
    try {
      upstreamSocket.destroy();
    } catch {
      /* ignore */
    }
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  };

  upstreamSocket.on('error', (err) => {
    console.error('[web] live ws upstream connect error:', err.message);
    cleanup();
  });
  socket.on('error', () => {
    cleanup();
  });

  upstreamSocket.on('connect', () => {
    // Re-emit the exact upgrade request bytes the browser sent so the api
    // container sees the original path, query, and headers (incl. the WS key).
    const reqLines = [
      `${req.method} ${req.url} HTTP/1.1`,
      ...Object.entries(req.headers).map(([name, value]) => {
        const headerValue = Array.isArray(value) ? value.join(', ') : value;
        return `${name}: ${headerValue}`;
      }),
      '',
      '',
    ];
    upstreamSocket.write(reqLines.join('\r\n'));
    if (head && head.length > 0) {
      upstreamSocket.write(head);
    }
    socket.pipe(upstreamSocket);
    upstreamSocket.pipe(socket);
    socket.on('end', () => upstreamSocket.end());
    upstreamSocket.on('end', () => socket.end());
  });
});

writeRuntimeConfig();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[web] serving ${ROOT} on :${PORT} (api upstream: ${API_UPSTREAM})`);
});
