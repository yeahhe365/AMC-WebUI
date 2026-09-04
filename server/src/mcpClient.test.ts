// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMcpClientBridge, mcpConfigFingerprint } from './mcpClient';

interface MockClientInstance {
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  ping?: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  listResources: ReturnType<typeof vi.fn>;
  listResourceTemplates: ReturnType<typeof vi.fn>;
  readResource: ReturnType<typeof vi.fn>;
  listPrompts: ReturnType<typeof vi.fn>;
  getPrompt: ReturnType<typeof vi.fn>;
}

const sdkMocks = vi.hoisted(() => {
  const clientInstances: MockClientInstance[] = [];
  const clientConstructor = vi.fn(function MockClient() {
    const instance: MockClientInstance = {
      connect: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      ping: vi.fn(async () => undefined),
      listTools: vi.fn(async () => ({ tools: [] })),
      callTool: vi.fn(),
      listResources: vi.fn(),
      listResourceTemplates: vi.fn(),
      readResource: vi.fn(),
      listPrompts: vi.fn(),
      getPrompt: vi.fn(),
    };
    clientInstances.push(instance);
    return instance;
  });

  return {
    clientInstances,
    clientConstructor,
    stdioTransportConstructor: vi.fn(function MockStdioTransport() {
      return { transport: 'stdio' };
    }),
    streamableHttpTransportConstructor: vi.fn(function MockStreamableHttpTransport() {
      return { transport: 'http' };
    }),
    sseTransportConstructor: vi.fn(function MockSseTransport() {
      return { transport: 'sse' };
    }),
  };
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: sdkMocks.clientConstructor,
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  getDefaultEnvironment: () => ({ PATH: '/usr/bin' }),
  StdioClientTransport: sdkMocks.stdioTransportConstructor,
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: sdkMocks.streamableHttpTransportConstructor,
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: sdkMocks.sseTransportConstructor,
}));

// ponytail: decouple version assertion from the real package.json
vi.mock('node:fs', () => ({
  readFileSync: () => JSON.stringify({ version: '9.9.9-test' }),
}));

// Skip DNS rebinding checks in unit tests (public hostnames would otherwise hit the network).
vi.mock('./mcpHttpSecurity.js', async () => {
  const actual = await vi.importActual<typeof import('./mcpHttpSecurity.js')>('./mcpHttpSecurity.js');
  return {
    ...actual,
    assertMcpHttpUrlAllowed: vi.fn(async () => undefined),
    createSafeMcpFetch: vi.fn((_allowPrivate: boolean, baseFetch: typeof fetch = fetch) => baseFetch),
  };
});

describe('createMcpClientBridge', () => {
  let bridges: Array<ReturnType<typeof createMcpClientBridge>> = [];

  beforeEach(() => {
    sdkMocks.clientInstances.length = 0;
    bridges = [];
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await Promise.all(bridges.map((bridge) => bridge.dispose?.() ?? Promise.resolve()));
    bridges = [];
  });

  const createBridge = (...args: Parameters<typeof createMcpClientBridge>) => {
    const bridge = createMcpClientBridge(...args);
    bridges.push(bridge);
    return bridge;
  };

  it('fingerprints server configs without retaining secrets in plaintext', () => {
    const baseHttp = {
      id: 'remote',
      name: 'Remote',
      enabled: true,
      transport: 'http' as const,
      url: 'https://mcp.example.com/mcp',
    };
    const withToken = { ...baseHttp, auth: { type: 'bearer' as const, token: 'secret-token-value' } };

    const fingerprintA = mcpConfigFingerprint(withToken);
    const fingerprintB = mcpConfigFingerprint({ ...baseHttp, auth: { type: 'bearer', token: 'other-token' } });

    expect(fingerprintA).not.toContain('secret-token-value');
    expect(fingerprintA).not.toBe(fingerprintB);
    expect(mcpConfigFingerprint(withToken)).toBe(fingerprintA);

    const stdioSecret = {
      id: 'local',
      name: 'Local',
      enabled: true,
      transport: 'stdio' as const,
      command: 'npx',
      env: { API_TOKEN: 'env-secret-value' },
    };
    expect(mcpConfigFingerprint(stdioSecret)).not.toContain('env-secret-value');
  });

  it('lists all MCP tools across paginated SDK responses and reuses the pooled session', async () => {
    const bridge = createBridge();
    const server = {
      id: 'remote',
      name: 'Remote',
      enabled: true,
      transport: 'http' as const,
      url: 'https://mcp.example.com/mcp',
    };

    const listToolsResults = [
      {
        tools: [
          {
            name: 'first_tool',
            inputSchema: { type: 'object' },
          },
        ],
        nextCursor: 'page-2',
      },
      {
        tools: [
          {
            name: 'second_tool',
            description: 'Second page tool',
            inputSchema: { type: 'object' },
          },
        ],
      },
    ];
    sdkMocks.clientConstructor.mockImplementationOnce(function MockClient() {
      const instance: MockClientInstance = {
        connect: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        listTools: vi.fn().mockResolvedValueOnce(listToolsResults[0]).mockResolvedValueOnce(listToolsResults[1]),
        callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
        listResources: vi.fn(),
        listResourceTemplates: vi.fn(),
        readResource: vi.fn(),
        listPrompts: vi.fn(),
        getPrompt: vi.fn(),
      };
      sdkMocks.clientInstances.push(instance);
      return instance;
    });

    await expect(bridge.listTools(server)).resolves.toEqual([
      {
        name: 'first_tool',
        inputSchema: { type: 'object' },
      },
      {
        name: 'second_tool',
        description: 'Second page tool',
        inputSchema: { type: 'object' },
      },
    ]);

    const client = sdkMocks.clientInstances[0];
    expect(client.listTools).toHaveBeenNthCalledWith(1, undefined, { timeout: 60_000 });
    expect(client.listTools).toHaveBeenNthCalledWith(2, { cursor: 'page-2' }, { timeout: 60_000 });
    // Pooled: session stays open until dispose / idle eviction.
    expect(client.close).not.toHaveBeenCalled();
    expect(sdkMocks.clientConstructor).toHaveBeenCalledWith({
      name: 'amc-webui',
      version: '9.9.9-test',
    });

    // Second operation reuses the same client connection.
    await bridge.callTool(server, 'first_tool', {});
    expect(sdkMocks.clientConstructor).toHaveBeenCalledTimes(1);
    expect(client.callTool).toHaveBeenCalledOnce();
  });

  it('lists resources and prompts on a shared session; tolerates missing resource templates', async () => {
    const bridge = createBridge();
    const server = {
      id: 'remote',
      name: 'Remote',
      enabled: true,
      transport: 'http' as const,
      url: 'https://mcp.example.com/mcp',
    };

    sdkMocks.clientConstructor.mockImplementationOnce(function MockResourceClient() {
      const instance: MockClientInstance = {
        connect: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        listTools: vi.fn(),
        callTool: vi.fn(),
        listResources: vi
          .fn()
          .mockResolvedValueOnce({
            resources: [{ uri: 'file:///tmp/one.md', name: 'One' }],
            nextCursor: 'resources-2',
          })
          .mockResolvedValueOnce({
            resources: [{ uri: 'file:///tmp/two.md', name: 'Two' }],
          }),
        listResourceTemplates: vi.fn(async () => {
          throw new Error('Method not found');
        }),
        readResource: vi.fn(),
        listPrompts: vi
          .fn()
          .mockResolvedValueOnce({
            prompts: [{ name: 'summarize' }],
            nextCursor: 'prompts-2',
          })
          .mockResolvedValueOnce({
            prompts: [{ name: 'rewrite', description: 'Rewrite text' }],
          }),
        getPrompt: vi.fn(),
      };
      sdkMocks.clientInstances.push(instance);
      return instance;
    });

    await expect(bridge.listResourcesAndTemplates!(server)).resolves.toEqual({
      resources: [
        { uri: 'file:///tmp/one.md', name: 'One' },
        { uri: 'file:///tmp/two.md', name: 'Two' },
      ],
      resourceTemplates: [],
    });

    await expect(bridge.listPrompts!(server)).resolves.toEqual([
      { name: 'summarize' },
      { name: 'rewrite', description: 'Rewrite text' },
    ]);

    // Single pooled client for both operations.
    expect(sdkMocks.clientConstructor).toHaveBeenCalledTimes(1);
    expect(sdkMocks.clientInstances[0].listResources).toHaveBeenNthCalledWith(
      2,
      { cursor: 'resources-2' },
      { timeout: 60_000 },
    );
    expect(sdkMocks.clientInstances[0].listPrompts).toHaveBeenNthCalledWith(
      2,
      { cursor: 'prompts-2' },
      { timeout: 60_000 },
    );
  });

  it('reads resources, gets prompts, and sends bearer auth through HTTP transport headers', async () => {
    const bridge = createBridge();
    const server = {
      id: 'remote',
      name: 'Remote',
      enabled: true,
      transport: 'http' as const,
      url: 'https://mcp.example.com/mcp',
      auth: {
        type: 'bearer' as const,
        token: 'secret-token',
      },
    };

    sdkMocks.clientConstructor.mockImplementationOnce(function MockReadClient() {
      const instance: MockClientInstance = {
        connect: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        listTools: vi.fn(),
        callTool: vi.fn(),
        listResources: vi.fn(),
        listResourceTemplates: vi.fn(),
        readResource: vi.fn(async () => ({
          contents: [{ uri: 'file:///tmp/readme.md', text: 'hello' }],
        })),
        listPrompts: vi.fn(),
        getPrompt: vi.fn(async () => ({
          messages: [{ role: 'user', content: { type: 'text', text: 'hello prompt' } }],
        })),
      };
      sdkMocks.clientInstances.push(instance);
      return instance;
    });

    await expect(bridge.readResource!(server, 'file:///tmp/readme.md')).resolves.toEqual({
      contents: [{ uri: 'file:///tmp/readme.md', text: 'hello' }],
    });
    await expect(bridge.getPrompt!(server, 'summarize', { topic: 'MCP' })).resolves.toEqual({
      messages: [{ role: 'user', content: { type: 'text', text: 'hello prompt' } }],
    });

    expect(sdkMocks.clientInstances[0].readResource).toHaveBeenCalledWith(
      { uri: 'file:///tmp/readme.md' },
      { timeout: 60_000 },
    );
    expect(sdkMocks.clientInstances[0].getPrompt).toHaveBeenCalledWith(
      { name: 'summarize', arguments: { topic: 'MCP' } },
      { timeout: 60_000 },
    );
    expect(sdkMocks.streamableHttpTransportConstructor).toHaveBeenCalledWith(new URL('https://mcp.example.com/mcp'), {
      requestInit: {
        headers: {
          Authorization: 'Bearer secret-token',
        },
      },
      fetch: expect.any(Function),
    });
  });

  it('falls back to SSE when Streamable HTTP connect fails', async () => {
    const bridge = createBridge();
    const server = {
      id: 'legacy',
      name: 'Legacy SSE',
      enabled: true,
      transport: 'http' as const,
      url: 'https://mcp.example.com/sse',
    };

    let streamableConnects = 0;
    sdkMocks.streamableHttpTransportConstructor.mockImplementation(function FailingStreamable() {
      return { transport: 'http' };
    });
    sdkMocks.clientConstructor.mockImplementation(function MockClient() {
      const instance: MockClientInstance = {
        connect: vi.fn(async () => {
          streamableConnects += 1;
          if (streamableConnects === 1) {
            throw new Error('Streamable HTTP not supported');
          }
        }),
        close: vi.fn(async () => undefined),
        listTools: vi.fn(async () => ({ tools: [{ name: 'ping', inputSchema: { type: 'object' } }] })),
        callTool: vi.fn(),
        listResources: vi.fn(),
        listResourceTemplates: vi.fn(),
        readResource: vi.fn(),
        listPrompts: vi.fn(),
        getPrompt: vi.fn(),
      };
      sdkMocks.clientInstances.push(instance);
      return instance;
    });

    await expect(bridge.listTools(server)).resolves.toEqual([{ name: 'ping', inputSchema: { type: 'object' } }]);

    expect(sdkMocks.streamableHttpTransportConstructor).toHaveBeenCalled();
    expect(sdkMocks.sseTransportConstructor).toHaveBeenCalledWith(new URL('https://mcp.example.com/sse'), {
      requestInit: undefined,
      fetch: expect.any(Function),
    });
  });

  it('uses SSE transport only when transport is sse', async () => {
    const bridge = createBridge();
    const server = {
      id: 'sse-only',
      name: 'SSE Only',
      enabled: true,
      transport: 'sse' as const,
      url: 'https://mcp.example.com/sse',
    };

    sdkMocks.clientConstructor.mockImplementationOnce(function MockClient() {
      const instance: MockClientInstance = {
        connect: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        listTools: vi.fn(async () => ({ tools: [] })),
        callTool: vi.fn(),
        listResources: vi.fn(),
        listResourceTemplates: vi.fn(),
        readResource: vi.fn(),
        listPrompts: vi.fn(),
        getPrompt: vi.fn(),
      };
      sdkMocks.clientInstances.push(instance);
      return instance;
    });

    await bridge.listTools(server);

    expect(sdkMocks.streamableHttpTransportConstructor).not.toHaveBeenCalled();
    expect(sdkMocks.sseTransportConstructor).toHaveBeenCalledOnce();
  });

  describe('ServerLogBuffer', () => {
    it('retains last 200 and evicts oldest', () => {
      const bridge = createBridge({ allowPrivateHttp: true } as any);
      for (let i = 0; i < 210; i++) (bridge as any).appendLog('s1', 'info', `msg-${i}`);
      const logs = (bridge as any).getLogs('s1');
      expect(logs.length).toBe(200);
      expect(logs[0].message).toBe('msg-10');
      expect(logs[199].message).toBe('msg-209');
    });

    it('returns empty array for unknown server and isolates per serverId', () => {
      const bridge = createBridge({ allowPrivateHttp: true } as any);
      expect((bridge as any).getLogs('unknown')).toEqual([]);
      (bridge as any).appendLog('sA', 'info', 'hello-A');
      (bridge as any).appendLog('sB', 'error', 'hello-B');
      expect((bridge as any).getLogs('sA')).toHaveLength(1);
      expect((bridge as any).getLogs('sB')[0].message).toBe('hello-B');
    });

    it('appends error log when listTools fails', async () => {
      const bridge = createBridge();
      const server = {
        id: 'remote',
        name: 'Remote',
        enabled: true,
        transport: 'http' as const,
        url: 'https://mcp.example.com/mcp',
      };
      sdkMocks.clientConstructor.mockImplementationOnce(function MockFailClient() {
        const instance: MockClientInstance = {
          connect: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          listTools: vi.fn(async () => {
            throw new Error('boom');
          }),
          callTool: vi.fn(),
          listResources: vi.fn(),
          listResourceTemplates: vi.fn(),
          readResource: vi.fn(),
          listPrompts: vi.fn(),
          getPrompt: vi.fn(),
        };
        sdkMocks.clientInstances.push(instance);
        return instance;
      });

      await expect(bridge.listTools(server)).rejects.toThrow('boom');
      const logs = (bridge as any).getLogs('remote');
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toBe('boom');
    });
  });

  describe('per-server tool call timeouts', () => {
    const httpServer = { id: 'r', name: 'R', enabled: true, transport: 'http' as const, url: 'https://m.example.com' };

    it('passes default 60s timeout for servers without config', async () => {
      const bridge = createBridge();
      await bridge.callTool(httpServer, 't', {});
      const client = sdkMocks.clientInstances[0];
      expect(client.callTool).toHaveBeenCalledWith({ name: 't', arguments: {} }, undefined, {
        timeout: 60_000,
        resetTimeoutOnProgress: false,
        maxTotalTimeout: undefined,
      });
    });

    it('honors configured timeout seconds and longRunning progress resets', async () => {
      const bridge = createBridge();
      await bridge.callTool({ ...httpServer, timeout: 120, longRunning: true }, 't', {});
      const client = sdkMocks.clientInstances[0];
      expect(client.callTool).toHaveBeenCalledWith({ name: 't', arguments: {} }, undefined, {
        timeout: 120_000,
        resetTimeoutOnProgress: true,
        maxTotalTimeout: 600_000,
      });
    });

    it('raises the connect timeout floor when a larger per-server timeout is set', async () => {
      const bridge = createBridge();
      await bridge.listTools({ ...httpServer, timeout: 300 });
      const client = sdkMocks.clientInstances[0];
      expect(client.connect).toHaveBeenCalledWith(expect.anything(), { timeout: 300_000 });
    });

    it('forwards progress notifications to the onProgress callback', async () => {
      const updates: Array<{ progress?: number; total?: number; message?: string }> = [];
      const bridge = createBridge();
      await bridge.callTool(httpServer, 't', {}, (update) => updates.push(update));
      const client = sdkMocks.clientInstances[0];
      const options = client.callTool.mock.calls[0][2] as { onprogress?: (n: unknown) => void };
      expect(typeof options.onprogress).toBe('function');
      options.onprogress?.({ progress: 3, total: 9, message: 'step 3' });
      options.onprogress?.({ progress: 4 });
      expect(updates).toEqual([{ progress: 3, total: 9, message: 'step 3' }, { progress: 4 }]);
    });
  });

  describe('log redaction', () => {
    it('masks secrets captured in error logs', async () => {
      const server = {
        id: 'leaky',
        name: 'Leaky',
        enabled: true,
        transport: 'http' as const,
        url: 'https://l.example.com',
      };
      sdkMocks.clientConstructor.mockImplementationOnce(function MockLeakClient() {
        const instance: MockClientInstance = {
          connect: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          ping: vi.fn(async () => undefined),
          listTools: vi.fn(async () => {
            throw new Error('401 unauthorized for Bearer supersecret-token-value');
          }),
          callTool: vi.fn(),
          listResources: vi.fn(),
          listResourceTemplates: vi.fn(),
          readResource: vi.fn(),
          listPrompts: vi.fn(),
          getPrompt: vi.fn(),
        };
        sdkMocks.clientInstances.push(instance);
        return instance;
      });
      const bridge = createBridge();

      await expect(bridge.listTools(server)).rejects.toThrow();
      const logs = (bridge as any).getLogs('leaky') as Array<{ message: string }>;
      expect(logs[0].message).not.toContain('supersecret-token-value');
      expect(logs[0].message).toContain('Bearer ***');
    });
  });
});
