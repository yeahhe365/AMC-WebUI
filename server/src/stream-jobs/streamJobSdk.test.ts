// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startHttpServer } from '../../test/httpServer';
import type { StreamJob } from './streamJobStore';

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  vi.unstubAllEnvs();
});

async function startWeb(upstream: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amc-stream-sdk-'));
  cleanups.push(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'index.html'), '<html>Stream SDK test</html>');
  const source = await fs.readFile(path.resolve('docker/web-server.js'), 'utf8');
  const child = spawn(
    process.execPath,
    [
      '--input-type=commonjs',
      '-e',
      `${source}\nserver.on('listening', () => process.send({ port: server.address().port }));`,
    ],
    {
      env: { PATH: process.env.PATH, PORT: '0', WEB_ROOT: root, API_UPSTREAM: upstream },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  );
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
      throw new Error('Web server exited before listening');
    }),
  ]);
  return `http://127.0.0.1:${(message as { port: number }).port}/api/gemini`;
}

describe('real Gemini SDK stream failures', () => {
  it.each([
    ['direct', 'coalesced'],
    ['direct', 'split'],
    ['direct', 'delayed'],
    ['web', 'coalesced'],
    ['web', 'split'],
    ['web', 'delayed'],
  ])('rejects overflow after valid SSE through %s with %s upstream chunks', async (route, chunks) => {
    vi.resetModules();
    vi.stubEnv('AMC_STREAM_JOB_EVENT_BYTES', '256');
    const store = await import('./streamJobStore');
    let job: StreamJob | undefined;
    const partial = `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'partial' }] } }] })}\n\n`;
    const overflow = `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'x'.repeat(300) }] } }] })}\n\n`;
    const api = http.createServer((req, res) => {
      req.resume();
      void store.maybeStreamWithSharedJob(req, res, { allowedOrigins: [] }, (created) => {
        job = created;
        void store.runDetachedUpstream(
          created,
          req,
          'https://fixture.test',
          () => new Headers(),
          async () =>
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  const encode = (data: string) => new TextEncoder().encode(data);
                  if (chunks === 'coalesced') {
                    controller.enqueue(encode(partial + overflow));
                    controller.close();
                  } else if (chunks === 'split') {
                    controller.enqueue(encode(partial + overflow.slice(0, 80)));
                    controller.enqueue(encode(overflow.slice(80)));
                    controller.close();
                  } else {
                    controller.enqueue(encode(partial));
                    const timer = setTimeout(() => {
                      controller.enqueue(encode(overflow));
                      controller.close();
                    }, 30);
                    cleanups.push(async () => {
                      clearTimeout(timer);
                    });
                  }
                },
              }),
            ),
        );
      });
    });
    const started = await startHttpServer(api);
    cleanups.push(async () => {
      api.closeAllConnections();
      await started.close();
    });
    const baseUrl = route === 'web' ? await startWeb(started.baseUrl) : started.baseUrl;
    const ai = new GoogleGenAI({
      apiKey: 'fake-sdk-test-key',
      httpOptions: { baseUrl, headers: { 'x-amc-job-id': `sdk-${route}-${chunks}` } },
    });
    const received: string[] = [];
    const consume = async () => {
      const response = await ai.models.generateContentStream({ model: 'gemini-test', contents: 'hello' });
      for await (const chunk of response) if (chunk.text) received.push(chunk.text);
    };
    await expect(consume()).rejects.toThrow();
    if (chunks === 'delayed') expect(received).toEqual(['partial']);
    expect(job?.error).toBe('stream event byte limit exceeded');
    // Retain the specific reason for reconnects even though an established
    // response must fail at the transport boundary to avoid truncated success.
    const replay = await fetch(`${started.baseUrl}/stream`, { headers: { 'x-amc-job-id': `sdk-${route}-${chunks}` } });
    expect(replay.status).toBe(502);
    expect(await replay.json()).toEqual({ error: 'stream event byte limit exceeded' });
  });
});
