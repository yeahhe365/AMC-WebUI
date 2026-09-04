// @vitest-environment node
// Liveness (ping-before-reuse) tests live in their own file so the pooled
// session mock state stays isolated from the main mcpClient suite.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMcpClientBridge } from './mcpClient';

const sdkMocks = vi.hoisted(() => {
  const clientInstances: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
  const clientConstructor = vi.fn(function MockClient() {
    const instance = {
      connect: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      ping: vi.fn(async () => undefined),
      listTools: vi.fn(async () => ({ tools: [] })),
      callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
    };
    clientInstances.push(instance);
    return instance;
  });
  return { clientInstances, clientConstructor };
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: sdkMocks.clientConstructor,
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  getDefaultEnvironment: () => ({ PATH: '/usr/bin' }),
  StdioClientTransport: vi.fn(),
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn(),
}));
vi.mock('node:fs', () => ({
  readFileSync: () => JSON.stringify({ version: '9.9.9-test' }),
}));
vi.mock('./mcpHttpSecurity.js', async () => {
  const actual = await vi.importActual<typeof import('./mcpHttpSecurity.js')>('./mcpHttpSecurity.js');
  return {
    ...actual,
    assertMcpHttpUrlAllowed: vi.fn(async () => undefined),
    createSafeMcpFetch: vi.fn((_allowPrivate: boolean, baseFetch: typeof fetch = fetch) => baseFetch),
  };
});

describe('mcp client liveness (ping before reuse)', () => {
  const server = {
    id: 'r2',
    name: 'R2',
    enabled: true,
    transport: 'http' as const,
    url: 'https://n.example.com',
  };
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

  it('pings an idle pooled session before reusing it and keeps a healthy session', async () => {
    const bridge = createMcpClientBridge({ sessionPingAfterMs: 0 });
    bridges.push(bridge);
    await bridge.listTools(server);
    await bridge.listTools(server);

    expect(sdkMocks.clientInstances).toHaveLength(1);
    expect(sdkMocks.clientInstances[0].ping).toHaveBeenCalledOnce();
    expect(sdkMocks.clientInstances[0].listTools).toHaveBeenCalledTimes(2);
  });

  it('reconnects with a fresh client when the stale session fails its ping', async () => {
    const bridge = createMcpClientBridge({ sessionPingAfterMs: 0 });
    bridges.push(bridge);
    await bridge.listTools(server);
    sdkMocks.clientInstances[0].ping.mockRejectedValue(new Error('stale'));

    await expect(bridge.listTools(server)).resolves.toEqual([]);

    expect(sdkMocks.clientInstances).toHaveLength(2);
    expect(sdkMocks.clientInstances[0].close).toHaveBeenCalled();
  });
});
