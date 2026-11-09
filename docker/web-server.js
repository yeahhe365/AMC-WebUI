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
const tls = require('tls');
const https = require('https');
const zlib = require('zlib');
const { pipeline } = require('stream');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 80);
const ROOT = path.resolve(process.env.WEB_ROOT || '/app/public');
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
    // The password itself must never appear here: this file is served at a
    // public path and anyone can read it. Only say whether this deployment
    // needs one, so the client can prompt for it instead of guessing.
    serverAccessPasswordRequired: Boolean(readWsAccessPassword()),
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

// --- deployment access password for the WS upgrade ---
// Browsers cannot set custom headers on a WebSocket handshake, so a Live
// connection to the api container carries no credential at all and would be
// rejected with 401 as soon as ACCESS_PASSWORD is set. This bridge re-emits the
// handshake itself, so it is the only place that can add the header.
const ACCESS_PASSWORD_HEADER = 'x-access-token';

const readWsAccessPassword = () => {
  const raw = trim(process.env.RUNTIME_SERVER_ACCESS_PASSWORD);
  if (!raw) return null;
  // Refuse anything that could smuggle extra header lines into the handshake.
  if (/[\r\n]/.test(raw)) {
    console.error('[web] RUNTIME_SERVER_ACCESS_PASSWORD contains CR/LF; not injecting it into the WS handshake');
    return null;
  }
  return raw;
};

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
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// --- proxy /api/* to upstream, preserving method/path/query/body, streaming response ---
function resolveUpstream() {
  const upstream = new URL(API_UPSTREAM);
  if (!['http:', 'https:'].includes(upstream.protocol)) throw new Error('Unsupported API upstream protocol');
  return upstream;
}

function proxyApi(req, res, url) {
  const upstream = resolveUpstream();
  upstream.pathname = url.pathname;
  upstream.search = url.search;

  const proxyReq = (upstream.protocol === 'https:' ? https : http).request(
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
      pipeline(proxyRes, res, () => {});
    },
  );

  proxyReq.on('error', (err) => {
    console.error('[web] api proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
    } else {
      res.destroy();
    }
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      proxyReq.destroy();
    }
  });

  req.pipe(proxyReq);
}

const withinRoot = (file) => file === ROOT || file.startsWith(ROOT + path.sep);
const compressible = (ext) =>
  ['.html', '.js', '.mjs', '.css', '.json', '.svg', '.map', '.txt', '.wasm', '.ttf'].includes(ext);

function chooseEncoding(header, canCompress) {
  const accepted = new Map();
  for (const item of String(header || '')
    .toLowerCase()
    .split(',')) {
    const [name, ...params] = item.trim().split(';');
    if (!name) continue;
    const qParam = params.map((part) => part.trim()).find((part) => part.startsWith('q='));
    const quality = qParam === undefined ? 1 : Number(qParam.slice(2));
    accepted.set(name, Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0);
  }
  const quality = (name) => accepted.get(name) ?? accepted.get('*') ?? 0;
  const choices = canCompress
    ? [
        ['br', quality('br')],
        ['gzip', quality('gzip')],
      ]
    : [];
  // Identity is always available unless explicitly excluded. With no explicit
  // identity preference, prefer an acceptable compressed representation.
  const identity = accepted.get('identity') ?? (accepted.get('*') === 0 ? 0 : 0.001);
  choices.push(['identity', identity]);
  choices.sort((a, b) => b[1] - a[1]);
  return choices[0][1] > 0 ? choices[0][0] : null;
}

async function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  if (pathname.includes('\0')) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }
  const resolved = path.resolve(ROOT, `.${pathname}`);
  if (!withinRoot(resolved)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  let filePath = resolved;
  let stat;
  try {
    stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = await fs.promises.stat(filePath);
    }
  } catch {
    if (path.extname(pathname) !== '') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    filePath = path.join(ROOT, 'index.html');
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
  }
  // Async metadata avoids blocking every request. Resolve symlinks too: a
  // lexical path check alone permits an in-root link to expose outside files.
  const realFile = await fs.promises.realpath(filePath);
  const realRoot = await fs.promises.realpath(ROOT);
  if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const encoding = chooseEncoding(req.headers['accept-encoding'], compressible(ext) && stat.size >= 1024);
  if (!encoding) {
    res.writeHead(406, { vary: 'Accept-Encoding' });
    res.end('Not Acceptable');
    return;
  }
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}-${encoding}"`;
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    vary: 'Accept-Encoding',
    etag,
    'last-modified': stat.mtime.toUTCString(),
  };
  if (pathname === '/runtime-config.js') headers['cache-control'] = 'no-store';
  else if (pathname.startsWith('/assets/')) headers['cache-control'] = 'public, max-age=31536000, immutable';
  else if (ext === '.mjs' || ext === '.html') headers['cache-control'] = 'no-cache';
  if (encoding !== 'identity') headers['content-encoding'] = encoding;
  const ifNoneMatch = req.headers['if-none-match'];
  const matches =
    ifNoneMatch &&
    String(ifNoneMatch)
      .split(',')
      .some((tag) => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''));
  const modifiedSince = req.headers['if-modified-since'];
  if (
    matches ||
    (!ifNoneMatch && modifiedSince && Math.floor(stat.mtimeMs / 1000) <= Math.floor(Date.parse(modifiedSince) / 1000))
  ) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  if (encoding === 'identity') headers['content-length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = fs.createReadStream(realFile);
  const completed = (error) => {
    if (error && !res.destroyed) res.destroy();
  };
  if (encoding === 'br')
    pipeline(
      stream,
      zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }),
      res,
      completed,
    );
  else if (encoding === 'gzip') pipeline(stream, zlib.createGzip(), res, completed);
  else pipeline(stream, res, completed);
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  const pathname = url.pathname;
  if (req.method === 'GET' && (pathname === '/healthz' || pathname === '/health')) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ status: 'ok', service: 'web' }));
    return;
  }
  const api = pathname === '/api' || pathname.startsWith('/api/');
  try {
    if (api) proxyApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    console.error('[web] request error:', error.message);
    if (res.headersSent) res.destroy();
    else {
      res.writeHead(api ? 502 : 500);
      res.end(api ? 'Bad Gateway' : 'Internal Server Error');
    }
  }
});

// WebSocket upgrade for /api/live: bridge the raw TCP socket to api:3001.
// http.request-based proxyApi cannot forward the WS upgrade handshake, so we
// open a plain TCP socket to the upstream and splice the two sockets together,
// letting the api container terminate the actual WS frames.
server.on('upgrade', (req, socket, head) => {
  // Attach error handling before validation so an early rejected handshake
  // cannot emit an unhandled socket error.
  socket.on('error', () => {});
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  if (pathname !== LIVE_WS_PATH && !pathname.startsWith(`${LIVE_WS_PATH}/`)) {
    socket.destroy();
    return;
  }
  let upstream;
  try {
    upstream = resolveUpstream();
  } catch {
    socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  const upstreamPort = Number(upstream.port) || (upstream.protocol === 'https:' ? 443 : 80);
  const host = upstream.hostname.replace(/^\[|\]$/g, '');
  const upstreamSocket =
    upstream.protocol === 'https:'
      ? tls.connect({ port: upstreamPort, host, servername: net.isIP(host) ? undefined : host })
      : net.connect(upstreamPort, host);

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
  upstreamSocket.on('close', cleanup);
  socket.on('error', () => {
    cleanup();
  });
  socket.on('close', cleanup);

  upstreamSocket.on(upstream.protocol === 'https:' ? 'secureConnect' : 'connect', () => {
    // Re-emit the exact upgrade request bytes the browser sent so the api
    // container sees the original path, query, and headers (incl. the WS key).
    // The deployment password is appended here because the browser cannot send
    // it on a WS handshake; any browser-supplied copy is dropped first so the
    // header never appears twice.
    const wsAccessPassword = readWsAccessPassword();
    const headerLines = Object.entries(req.headers)
      .filter(([name]) => !(wsAccessPassword && name.toLowerCase() === ACCESS_PASSWORD_HEADER))
      .map(([name, value]) => {
        const headerValue = Array.isArray(value) ? value.join(', ') : value;
        return `${name}: ${headerValue}`;
      });
    if (wsAccessPassword) {
      headerLines.push(`${ACCESS_PASSWORD_HEADER}: ${wsAccessPassword}`);
    }
    const reqLines = [`${req.method} ${req.url} HTTP/1.1`, ...headerLines, '', ''];
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

const handleShutdown = (signal) => {
  console.log(`[web] received ${signal}, closing gracefully...`);
  server.close(() => {
    console.log('[web] server closed cleanly');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[web] forced exit after timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
