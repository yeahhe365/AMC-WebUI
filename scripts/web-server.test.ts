// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { startHttpServer } from '../server/test/httpServer';

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const asset = 'export const greeting = "你好 compressed world";\n'.repeat(1200);

async function startWeb(upstream = 'http://127.0.0.1:9', extraEnv: Record<string, string> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amc-web-test-'));
  cleanups.push(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'assets'));
  await fs.writeFile(path.join(root, 'assets', 'app.js'), asset);
  await fs.writeFile(path.join(root, 'index.html'), '<html>AMC test</html>');
  const source = await fs.readFile(path.resolve('docker/web-server.js'), 'utf8');
  const child: ChildProcess = spawn(
    process.execPath,
    [
      '--input-type=commonjs',
      '-e',
      `${source}\nserver.on('listening', () => process.send({ port: server.address().port }));`,
    ],
    {
      env: { PATH: process.env.PATH, PORT: '0', WEB_ROOT: root, API_UPSTREAM: upstream, ...extraEnv },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    },
  );
  let stderr = '';
  child.stderr!.on('data', (chunk) => {
    stderr += String(chunk);
  });
  cleanups.push(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
  });
  const [message] = await Promise.race([
    once(child, 'message'),
    once(child, 'exit').then(() => {
      throw new Error(`Web failed to start: ${stderr}`);
    }),
  ]);
  return { port: (message as { port: number }).port, child };
}

function request(port: number, target: string, headers: http.OutgoingHttpHeaders = {}, method = 'GET') {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: target, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function rawUpgrade(port: number, target: string, headers: Record<string, string> = {}) {
  return new Promise<string>((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let result = '';
    const extra = Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}\r\n`)
      .join('');
    socket.on('connect', () =>
      socket.write(
        `GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n${extra}\r\n`,
      ),
    );
    socket.on('data', (chunk) => {
      result += chunk.toString();
      if (result.includes('\r\n\r\n')) socket.destroy();
    });
    socket.on('close', () => resolve(result));
    socket.on('error', reject);
  });
}

describe('Docker Web server process', () => {
  it('returns 404 for missing assets and uses the SPA shell only for page routes', async () => {
    const { port } = await startWeb();
    const missingAsset = await request(port, '/assets/missing-hash.js');
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.body.toString()).not.toContain('<html>');
    const page = await request(port, '/chat/session');
    expect(page.status).toBe(200);
    expect(page.body.toString()).toBe('<html>AMC test</html>');
  });

  it('returns 400 for a malformed request target and remains healthy', async () => {
    const { port, child } = await startWeb();
    const malformed = await request(port, '//').catch(() => ({ status: 0 }));
    expect(malformed.status).toBe(400);
    expect((await request(port, '/healthz')).status).toBe(200);
    expect(child.exitCode).toBeNull();
  });

  it('returns 400 for a malformed upgrade target and remains healthy', async () => {
    const { port, child } = await startWeb();
    expect(await rawUpgrade(port, '//')).toMatch(/^HTTP\/1.1 400 /);
    expect((await request(port, '/health')).status).toBe(200);
    expect(child.exitCode).toBeNull();
  });

  it('handles invalid upstream configuration without exiting', async () => {
    const { port } = await startWeb('http://[');
    expect((await request(port, '/api/test').catch(() => ({ status: 0 }))).status).toBe(502);
    expect(await rawUpgrade(port, '/api/live')).toMatch(/^HTTP\/1.1 502 /);
    expect((await request(port, '/healthz')).status).toBe(200);
  });

  it.each([
    ['gzip', 'gzip'],
    ['gzip, br', 'br'],
    ['br;q=0, gzip;q=0.8', 'gzip'],
    ['gzip;q=1, br;q=0.5', 'gzip'],
  ])('negotiates %s and transfers a compressed static asset', async (accept, encoding) => {
    const { port } = await startWeb();
    const res = await request(port, '/assets/app.js', { 'accept-encoding': accept });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe(encoding);
    expect(res.headers.vary).toContain('Accept-Encoding');
    expect(res.body.byteLength).toBeLessThan(Buffer.byteLength(asset) / 4);
    expect((encoding === 'br' ? brotliDecompressSync(res.body) : gunzipSync(res.body)).toString()).toBe(asset);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('honors validators and HEAD without sending a body', async () => {
    const { port } = await startWeb();
    const first = await request(port, '/assets/app.js', { 'accept-encoding': 'gzip' });
    expect(first.headers.etag).toBeTruthy();
    const cached = await request(port, '/assets/app.js', {
      'accept-encoding': 'gzip',
      'if-none-match': first.headers.etag,
    });
    expect(cached.status).toBe(304);
    expect(cached.body.length).toBe(0);
    const head = await request(port, '/assets/app.js', { 'accept-encoding': 'br' }, 'HEAD');
    expect(head.status).toBe(200);
    expect(head.headers['content-encoding']).toBe('br');
    expect(head.body.length).toBe(0);
  });

  it('rejects unacceptable encodings and supports identity', async () => {
    const { port } = await startWeb();
    const identity = await request(port, '/assets/app.js', { 'accept-encoding': 'gzip;q=0, br;q=0' });
    expect(identity.headers['content-encoding']).toBeUndefined();
    expect(identity.body.toString()).toBe(asset);
    expect((await request(port, '/assets/app.js', { 'accept-encoding': 'identity;q=0, *;q=0' })).status).toBe(406);
  });

  async function captureUpgradeHeaders(extraEnv: Record<string, string>, sentHeaders: Record<string, string>) {
    const seen: http.IncomingHttpHeaders[] = [];
    const upstream = http.createServer();
    upstream.on('upgrade', (req, socket) => {
      seen.push(req.headers);
      socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    });
    const started = await startHttpServer(upstream);
    cleanups.push(started.close);
    const { port } = await startWeb(started.baseUrl, extraEnv);
    const response = await rawUpgrade(port, '/api/live?model=test', sentHeaders);
    return { response, headers: seen[0] };
  }

  // runtime-config.js 是公开可取的静态文件,把口令写进去等于把口令公开(P0-3)。
  // 它只能声明"本部署需要口令",让客户端提示用户输入。
  it('never publishes the access password value in runtime-config.js', async () => {
    const secret = 'super-secret-deploy-password';
    const { port } = await startWeb('http://127.0.0.1:9', { RUNTIME_SERVER_ACCESS_PASSWORD: secret });
    const published = (await request(port, '/runtime-config.js')).body.toString();

    expect(published).not.toContain(secret);
    expect(published).toContain('"serverAccessPasswordRequired": true');
  });

  it('reports no password requirement when the deployment has none', async () => {
    const { port } = await startWeb();
    const published = (await request(port, '/runtime-config.js')).body.toString();

    expect(published).toContain('"serverAccessPasswordRequired": false');
  });

  // 浏览器无法为 WebSocket 握手加自定义头,所以口令只能由这层桥接补上;
  // 少了这一步,只要部署设了 ACCESS_PASSWORD,所有 Live 连接都会 401（P0-2）。
  it('injects the deployment access password into bridged live upgrades', async () => {
    const { response, headers } = await captureUpgradeHeaders({ RUNTIME_SERVER_ACCESS_PASSWORD: 'p@ss word' }, {});
    expect(response).toMatch(/^HTTP\/1\.1 101 /);
    expect(headers['x-access-token']).toBe('p@ss word');
  });

  it('does not duplicate a caller-supplied access token and skips injection when unset', async () => {
    const spoofed = await captureUpgradeHeaders(
      { RUNTIME_SERVER_ACCESS_PASSWORD: 'from-env' },
      { 'x-access-token': 'from-browser' },
    );
    expect(spoofed.headers['x-access-token']).toBe('from-env');

    const unset = await captureUpgradeHeaders({}, {});
    expect(unset.headers['x-access-token']).toBeUndefined();
  });

  it('refuses to inject an access password containing CR/LF', async () => {
    const { response, headers } = await captureUpgradeHeaders(
      { RUNTIME_SERVER_ACCESS_PASSWORD: 'evil\r\nX-Injected: 1' },
      {},
    );
    expect(response).toMatch(/^HTTP\/1\.1 101 /);
    expect(headers['x-access-token']).toBeUndefined();
    expect(headers['x-injected']).toBeUndefined();
  });

  it('streams API SSE before the upstream completes and bridges live upgrades', async () => {
    let finish: (() => void) | undefined;
    const upstream = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: first\n\n');
      finish = () => res.end('data: last\n\n');
    });
    upstream.on('upgrade', (_req, socket) =>
      socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'),
    );
    const started = await startHttpServer(upstream);
    cleanups.push(started.close);
    const { port } = await startWeb(started.baseUrl);
    await new Promise<void>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: '/api/events', headers: { 'accept-encoding': 'br, gzip' } }, (res) => {
          expect(res.headers['content-encoding']).toBeUndefined();
          res.once('data', (chunk) => {
            expect(chunk.toString()).toBe('data: first\n\n');
            finish!();
          });
          res.on('end', resolve);
          res.on('error', reject);
        })
        .on('error', reject);
    });
    expect(await rawUpgrade(port, '/api/live?model=test')).toMatch(/^HTTP\/1.1 101 /);
  });
});
