import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServerConfig } from '@/types';
import {
  callMcpTool,
  fetchMcpLogs,
  fetchMcpPrompt,
  fetchMcpPrompts,
  fetchMcpResource,
  fetchMcpResources,
  fetchMcpServerCapabilities,
} from './mcpApi';

const fetchMock = vi.fn();

describe('mcpApi', () => {
  const server: McpServerConfig = {
    id: 'remote',
    name: 'Remote',
    enabled: true,
    transport: 'http',
    url: 'https://mcp.example.com/mcp',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
  });

  it('uses dedicated MCP endpoints for resources and prompts', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            servers: [{ serverId: 'remote', serverName: 'Remote', resources: [], resourceTemplates: [] }],
            errors: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            servers: [{ serverId: 'remote', serverName: 'Remote', prompts: [] }],
            errors: [],
          }),
          { status: 200 },
        ),
      );

    await fetchMcpResources([server]);
    await fetchMcpPrompts([server]);

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/mcp/resources', '/api/mcp/prompts']);
  });

  it('fetches logs', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ logs: [{ level: 'info', message: 'hi', timestamp: 1 }] }), { status: 200 }),
    );

    const res = await fetchMcpLogs(server as any);

    expect(res.logs[0].message).toBe('hi');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/mcp/logs?serverId=remote',
      expect.objectContaining({ signal: undefined }),
    );
  });

  it('forwards abort signal to fetchMcpLogs', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ logs: [] }), { status: 200 }));
    await fetchMcpLogs(server as any, controller.signal);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/mcp/logs'),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('combines tools, resources, resource templates, and prompts for one server capability check', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            servers: [{ serverId: 'remote', serverName: 'Remote', tools: [{ name: 'read_file' }] }],
            errors: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            servers: [
              {
                serverId: 'remote',
                serverName: 'Remote',
                resources: [{ uri: 'file:///tmp/readme.md', name: 'README' }],
                resourceTemplates: [{ uriTemplate: 'file:///{path}', name: 'File' }],
              },
            ],
            errors: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            servers: [{ serverId: 'remote', serverName: 'Remote', prompts: [{ name: 'summarize' }] }],
            errors: [],
          }),
          { status: 200 },
        ),
      );

    await expect(fetchMcpServerCapabilities(server)).resolves.toEqual({
      tools: [{ name: 'read_file' }],
      resources: [{ uri: 'file:///tmp/readme.md', name: 'README' }],
      resourceTemplates: [{ uriTemplate: 'file:///{path}', name: 'File' }],
      prompts: [{ name: 'summarize' }],
      errors: [],
    });
  });
});

describe('callMcpTool streaming progress', () => {
  const streamingServer: McpServerConfig = {
    id: 'remote',
    name: 'Remote',
    enabled: true,
    transport: 'http',
    url: 'https://mcp.example.com/mcp',
  };
  const streamFetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', streamFetchMock);
  });

  const ndjsonResponse = (chunks: string[]): Response => {
    const encoder = new TextEncoder();
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]));
          index += 1;
        } else {
          controller.close();
        }
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
  };

  it('forwards progress lines and resolves with the terminal result', async () => {
    streamFetchMock.mockResolvedValueOnce(
      ndjsonResponse([
        '{"type":"start"}\n{"type":"prog',
        'ress","progress":1,"total":2,"message":"halfway"}\n',
        '{"type":"result","result":{"ok":true}}\n',
      ]),
    );
    const onProgress = vi.fn();

    const result = await callMcpTool(streamingServer, 'crawl', {}, undefined, onProgress);

    expect(result).toEqual({ ok: true });
    expect(onProgress).toHaveBeenCalledWith({ progress: 1, total: 2, message: 'halfway' });
    expect(streamFetchMock).toHaveBeenCalledWith(
      '/api/mcp/call',
      expect.objectContaining({
        headers: expect.objectContaining({ accept: 'application/x-ndjson' }),
      }),
    );
  });

  it('rejects with the streamed error message', async () => {
    streamFetchMock.mockResolvedValueOnce(
      ndjsonResponse(['{"type":"progress","message":"starting"}\n', '{"type":"error","error":"boom"}\n']),
    );

    await expect(callMcpTool(streamingServer, 'crawl', {})).rejects.toThrow('boom');
  });

  it('falls back to whole-body JSON for a legacy non-streaming server', async () => {
    streamFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: { legacy: true } }), { status: 200 }));

    const onProgress = vi.fn();
    const result = await callMcpTool(streamingServer, 'crawl', {}, undefined, onProgress);

    expect(result).toEqual({ legacy: true });
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe('mcpApi resource/prompt reads', () => {
  const server: McpServerConfig = {
    id: 'remote',
    name: 'Remote',
    enabled: true,
    transport: 'http',
    url: 'https://mcp.example.com/mcp',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
  });

  it('posts the server and uri to /api/mcp/resource and unwraps result', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ result: { contents: [{ uri: 'file:///a.md', text: 'hello', mimeType: 'text/markdown' }] } }),
        { status: 200 },
      ),
    );

    const body = await fetchMcpResource(server, 'file:///a.md');

    expect(fetchMock).toHaveBeenCalledWith('/api/mcp/resource', expect.objectContaining({ method: 'POST' }));
    const callBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody).toEqual({ server, uri: 'file:///a.md' });
    expect(body.result?.contents[0].text).toBe('hello');
  });

  it('throws a readable error when resource read fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'boom' }), { status: 502 }));
    await expect(fetchMcpResource(server, 'file:///a.md')).rejects.toThrow('boom');
  });

  it('posts server, promptName and args to /api/mcp/prompt and unwraps result', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ result: { messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }] } }),
        { status: 200 },
      ),
    );

    const body = await fetchMcpPrompt(server, 'greet', { name: 'Ada' });

    const callBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody).toEqual({ server, promptName: 'greet', args: { name: 'Ada' } });
    expect(body.result?.messages[0]?.content?.text).toBe('hi');
  });
});
