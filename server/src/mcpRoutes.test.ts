// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from './createServer';
import { createHttpServerCleanup, startHttpServer } from '../test/httpServer';

const serverCleanup = createHttpServerCleanup();

afterEach(serverCleanup.cleanup);

describe('MCP routes', () => {
  it('does not execute stdio MCP servers unless the API server enables stdio transport', async () => {
    const listTools = vi.fn();
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools,
          callTool: vi.fn(),
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servers: [
          {
            id: 'filesystem',
            name: 'Filesystem',
            enabled: true,
            transport: 'stdio',
            command: 'npx',
          },
        ],
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(listTools).not.toHaveBeenCalled();
    expect(body).toEqual({
      servers: [],
      errors: [
        {
          serverId: 'filesystem',
          serverName: 'Filesystem',
          error: 'MCP stdio transport is disabled on this API server.',
        },
      ],
    });
  });

  it('lists tools for enabled MCP servers', async () => {
    const listTools = vi.fn(async () => [
      {
        name: 'read_file',
        description: 'Read a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      },
    ]);
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
        enableMcpStdio: true,
      },
      {
        mcpClient: {
          listTools,
          callTool: vi.fn(),
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const enabledServer = {
      id: 'filesystem',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    };
    const disabledServer = {
      id: 'disabled',
      name: 'Disabled',
      enabled: false,
      transport: 'stdio',
      command: 'node',
    };

    const response = await fetch(`${started.baseUrl}/api/mcp/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servers: [enabledServer, disabledServer] }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(listTools).toHaveBeenCalledTimes(1);
    expect(listTools).toHaveBeenCalledWith(enabledServer);
    expect(body).toEqual({
      servers: [
        {
          serverId: 'filesystem',
          serverName: 'Filesystem',
          tools: [
            {
              name: 'read_file',
              description: 'Read a file',
              inputSchema: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                },
                required: ['path'],
              },
            },
          ],
        },
      ],
      errors: [],
    });
  });

  it('rejects HTTP MCP servers that do not use HTTP or HTTPS URLs', async () => {
    const listTools = vi.fn();
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools,
          callTool: vi.fn(),
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servers: [
          {
            id: 'local-file',
            name: 'Local File',
            enabled: true,
            transport: 'http',
            url: 'file:///tmp/mcp',
          },
        ],
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(listTools).not.toHaveBeenCalled();
    expect(body).toEqual({
      servers: [],
      errors: [
        {
          serverId: 'local-file',
          serverName: 'Local File',
          error: 'MCP HTTP server URL must use http:// or https://.',
        },
      ],
    });
  });

  it('rejects private HTTP MCP server URLs unless private HTTP is explicitly enabled', async () => {
    const listTools = vi.fn();
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools,
          callTool: vi.fn(),
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servers: [
          {
            id: 'local-http',
            name: 'Local HTTP',
            enabled: true,
            transport: 'http',
            url: 'http://127.0.0.1:3333/mcp',
          },
        ],
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(listTools).not.toHaveBeenCalled();
    expect(body).toEqual({
      servers: [],
      errors: [
        {
          serverId: 'local-http',
          serverName: 'Local HTTP',
          error: 'Private MCP HTTP server URLs are disabled on this API server.',
        },
      ],
    });
  });

  it('ignores disabled MCP servers without reporting URL validation errors', async () => {
    const listTools = vi.fn();
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools,
          callTool: vi.fn(),
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servers: [
          {
            id: 'disabled-local',
            name: 'Disabled Local',
            enabled: false,
            transport: 'http',
            url: 'http://127.0.0.1:3333/mcp',
          },
        ],
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(listTools).not.toHaveBeenCalled();
    expect(body).toEqual({
      servers: [],
      errors: [],
    });
  });

  it('allows private HTTP MCP server URLs when private HTTP is explicitly enabled', async () => {
    const listTools = vi.fn(async () => [
      {
        name: 'local_tool',
        inputSchema: {
          type: 'object',
        },
      },
    ]);
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
        enableMcpPrivateHttp: true,
      },
      {
        mcpClient: {
          listTools,
          callTool: vi.fn(),
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const localServer = {
      id: 'local-http',
      name: 'Local HTTP',
      enabled: true,
      transport: 'http',
      url: 'http://127.0.0.1:3333/mcp',
    };
    const response = await fetch(`${started.baseUrl}/api/mcp/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servers: [localServer],
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(listTools).toHaveBeenCalledWith(localServer);
    expect(body).toEqual({
      servers: [
        {
          serverId: 'local-http',
          serverName: 'Local HTTP',
          tools: [
            {
              name: 'local_tool',
              inputSchema: {
                type: 'object',
              },
            },
          ],
        },
      ],
      errors: [],
    });
  });

  it('returns a client error for malformed MCP JSON request bodies', async () => {
    const listTools = vi.fn();
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools,
          callTool: vi.fn(),
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(listTools).not.toHaveBeenCalled();
    expect(body).toEqual({
      error: 'MCP request body must be valid JSON.',
    });
  });

  it('calls an MCP tool on the selected server', async () => {
    const callTool = vi.fn(async () => ({
      content: [{ type: 'text', text: 'hello from MCP' }],
      structuredContent: { ok: true },
    }));
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
        enableMcpStdio: true,
      },
      {
        mcpClient: {
          listTools: vi.fn(),
          callTool,
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const server = {
      id: 'filesystem',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    };
    const args = { path: '/tmp/example.txt' };

    const response = await fetch(`${started.baseUrl}/api/mcp/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server, toolName: 'read_file', args }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(callTool).toHaveBeenCalledWith(server, 'read_file', args);
    expect(body).toEqual({
      result: {
        content: [{ type: 'text', text: 'hello from MCP' }],
        structuredContent: { ok: true },
      },
    });
  });

  it('returns the underlying MCP error message when a tool call fails', async () => {
    const callTool = vi.fn(async () => {
      throw new Error('ENOENT: no such file or directory');
    });
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
        enableMcpStdio: true,
      },
      {
        mcpClient: {
          listTools: vi.fn(),
          callTool,
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        server: {
          id: 'filesystem',
          name: 'Filesystem',
          enabled: true,
          transport: 'stdio',
          command: 'npx',
        },
        toolName: 'read_file',
        args: { path: '/missing' },
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: 'ENOENT: no such file or directory',
    });
  });

  it('accepts SSE transport server configs for listing tools', async () => {
    const listTools = vi.fn(async () => [{ name: 'ping', inputSchema: { type: 'object' } }]);
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools,
          callTool: vi.fn(),
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const server = {
      id: 'legacy',
      name: 'Legacy',
      enabled: true,
      transport: 'sse',
      url: 'https://mcp.example.com/sse',
    };
    const response = await fetch(`${started.baseUrl}/api/mcp/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servers: [server] }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(listTools).toHaveBeenCalledWith(server);
    expect(body).toEqual({
      servers: [
        {
          serverId: 'legacy',
          serverName: 'Legacy',
          tools: [{ name: 'ping', inputSchema: { type: 'object' } }],
        },
      ],
      errors: [],
    });
  });

  it('lists MCP resources and prompts for enabled HTTP servers', async () => {
    const listResourcesAndTemplates = vi.fn(async () => ({
      resources: [
        {
          uri: 'file:///tmp/readme.md',
          name: 'README',
          description: 'Project notes',
          mimeType: 'text/markdown',
        },
      ],
      resourceTemplates: [
        {
          uriTemplate: 'file:///{path}',
          name: 'Workspace file',
          description: 'Read a workspace file by path',
        },
      ],
    }));
    const listPrompts = vi.fn(async () => [
      {
        name: 'summarize',
        description: 'Summarize a topic',
        arguments: [{ name: 'topic', required: true }],
      },
    ]);
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools: vi.fn(),
          callTool: vi.fn(),
          listResourcesAndTemplates,
          listPrompts,
          readResource: vi.fn(),
          getPrompt: vi.fn(),
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const server = {
      id: 'remote',
      name: 'Remote',
      enabled: true,
      transport: 'http',
      url: 'https://mcp.example.com/mcp',
    };

    const resourcesResponse = await fetch(`${started.baseUrl}/api/mcp/resources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servers: [server] }),
    });
    const resourcesBody = (await resourcesResponse.json()) as Record<string, unknown>;

    expect(resourcesResponse.status).toBe(200);
    expect(listResourcesAndTemplates).toHaveBeenCalledWith(server);
    expect(resourcesBody).toEqual({
      servers: [
        {
          serverId: 'remote',
          serverName: 'Remote',
          resources: [
            {
              uri: 'file:///tmp/readme.md',
              name: 'README',
              description: 'Project notes',
              mimeType: 'text/markdown',
            },
          ],
          resourceTemplates: [
            {
              uriTemplate: 'file:///{path}',
              name: 'Workspace file',
              description: 'Read a workspace file by path',
            },
          ],
        },
      ],
      errors: [],
    });

    const promptsResponse = await fetch(`${started.baseUrl}/api/mcp/prompts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servers: [server] }),
    });
    const promptsBody = (await promptsResponse.json()) as Record<string, unknown>;

    expect(promptsResponse.status).toBe(200);
    expect(listPrompts).toHaveBeenCalledWith(server);
    expect(promptsBody).toEqual({
      servers: [
        {
          serverId: 'remote',
          serverName: 'Remote',
          prompts: [
            {
              name: 'summarize',
              description: 'Summarize a topic',
              arguments: [{ name: 'topic', required: true }],
            },
          ],
        },
      ],
      errors: [],
    });
  });

  it('reads MCP resources and gets prompts from the selected server', async () => {
    const readResource = vi.fn(async () => ({
      contents: [{ uri: 'file:///tmp/readme.md', text: 'hello', mimeType: 'text/markdown' }],
    }));
    const getPrompt = vi.fn(async () => ({
      description: 'Summarize a topic',
      messages: [{ role: 'user', content: { type: 'text', text: 'Summarize MCP' } }],
    }));
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools: vi.fn(),
          callTool: vi.fn(),
          listResourcesAndTemplates: vi.fn(),
          listPrompts: vi.fn(),
          readResource,
          getPrompt,
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const server = {
      id: 'remote',
      name: 'Remote',
      enabled: true,
      transport: 'http',
      url: 'https://mcp.example.com/mcp',
    };

    const resourceResponse = await fetch(`${started.baseUrl}/api/mcp/resource`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server, uri: 'file:///tmp/readme.md' }),
    });
    const resourceBody = (await resourceResponse.json()) as Record<string, unknown>;

    expect(resourceResponse.status).toBe(200);
    expect(readResource).toHaveBeenCalledWith(server, 'file:///tmp/readme.md');
    expect(resourceBody).toEqual({
      result: {
        contents: [{ uri: 'file:///tmp/readme.md', text: 'hello', mimeType: 'text/markdown' }],
      },
    });

    const promptArgs = { topic: 'MCP' };
    const promptResponse = await fetch(`${started.baseUrl}/api/mcp/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server, promptName: 'summarize', args: promptArgs }),
    });
    const promptBody = (await promptResponse.json()) as Record<string, unknown>;

    expect(promptResponse.status).toBe(200);
    expect(getPrompt).toHaveBeenCalledWith(server, 'summarize', promptArgs);
    expect(promptBody).toEqual({
      result: {
        description: 'Summarize a topic',
        messages: [{ role: 'user', content: { type: 'text', text: 'Summarize MCP' } }],
      },
    });
  });

  it('reports per-server errors for structurally invalid MCP configs instead of silently dropping them', async () => {
    const listTools = vi.fn(async () => [{ name: 'echo', description: 'Echo', inputSchema: {} }]);
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
        enableMcpStdio: true,
      },
      {
        mcpClient: {
          listTools,
          callTool: vi.fn(),
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servers: [
          { id: 'no-command', name: 'No Command', enabled: true, transport: 'stdio' },
          { id: 'no-name', enabled: true, transport: 'stdio', command: 'npx' },
          { id: 'bad-transport', name: 'Bad Transport', enabled: true, transport: 'grpc' },
          { id: 'no-url', name: 'No URL', enabled: true, transport: 'http' },
          {
            id: 'valid',
            name: 'Valid',
            enabled: true,
            transport: 'stdio',
            command: 'node',
            args: ['server.js'],
          },
        ],
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      servers: [
        {
          serverId: 'valid',
          serverName: 'Valid',
          tools: [{ name: 'echo', description: 'Echo', inputSchema: {} }],
        },
      ],
      errors: [
        { serverId: 'no-command', serverName: 'No Command', error: 'MCP stdio server requires a command.' },
        { serverId: 'no-name', serverName: '(missing name)', error: 'MCP server configuration is missing a name.' },
        {
          serverId: 'bad-transport',
          serverName: 'Bad Transport',
          error: 'MCP server transport must be stdio, http, or sse.',
        },
        { serverId: 'no-url', serverName: 'No URL', error: 'MCP http/sse server requires a URL.' },
      ],
    });
    expect(listTools).toHaveBeenCalledTimes(1);
  });

  it('returns a distinct error when calling a tool on a disabled MCP server', async () => {
    const callTool = vi.fn();
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools: vi.fn(),
          callTool,
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        server: {
          id: 'remote',
          name: 'Remote',
          enabled: false,
          transport: 'http',
          url: 'https://mcp.example.com/mcp',
        },
        toolName: 'echo',
        args: { text: 'hi' },
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'MCP server is disabled.' });
    expect(callTool).not.toHaveBeenCalled();
  });

  it('GET /api/mcp/logs returns 200 ring', async () => {
    const getLogs = vi.fn(() => [{ level: 'info', message: 'hi', timestamp: Date.now() }]);
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools: vi.fn(),
          callTool: vi.fn(),
          getLogs,
        } as any,
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/logs?serverId=s1`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(getLogs).toHaveBeenCalledWith('s1');
    expect(body.logs).toEqual(expect.arrayContaining([expect.objectContaining({ message: 'hi' })]));
    expect((body.logs as unknown[]).length).toBe(1);
  });

  it('GET /api/mcp/logs returns 400 when serverId is missing', async () => {
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools: vi.fn(),
          callTool: vi.fn(),
          getLogs: vi.fn(() => []),
        } as any,
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/logs`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'serverId required' });
  });

  it('lists tools across servers concurrently so one slow server does not block the rest', async () => {
    let fastServerStarted = false;
    const listTools = vi.fn(async (server: { id: string }) => {
      if (server.id === 'slow') {
        // Resolve only once the other server's listing has begun.
        await new Promise((resolve) => {
          const check = () => (fastServerStarted ? resolve(undefined) : setTimeout(check, 5));
          check();
        });
        return [{ name: 'slow_tool', description: 'Slow', inputSchema: {} }];
      }
      fastServerStarted = true;
      return [{ name: 'fast_tool', description: 'Fast', inputSchema: {} }];
    });
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      {
        mcpClient: {
          listTools,
          callTool: vi.fn(),
        },
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servers: [
          { id: 'slow', name: 'Slow', enabled: true, transport: 'http', url: 'https://slow.example.com/mcp' },
          { id: 'fast', name: 'Fast', enabled: true, transport: 'http', url: 'https://fast.example.com/mcp' },
        ],
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      servers: [
        { serverId: 'slow', serverName: 'Slow', tools: [{ name: 'slow_tool', description: 'Slow', inputSchema: {} }] },
        { serverId: 'fast', serverName: 'Fast', tools: [{ name: 'fast_tool', description: 'Fast', inputSchema: {} }] },
      ],
      errors: [],
    });
  });
});

describe('MCP server config hardening', () => {
  const serverCleanup2 = createHttpServerCleanup();

  afterEach(serverCleanup2.cleanup);

  it('refuses dangerous stdio environment variables with a per-server error', async () => {
    const callTool = vi.fn();
    const app = createServer(
      { geminiApiBase: 'https://example.test', geminiApiKey: 'k', enableMcpStdio: true },
      { mcpClient: { listTools: vi.fn(), callTool } },
    );
    const started = serverCleanup2.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/tools`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servers: [
          {
            id: 'evil',
            name: 'Evil',
            enabled: true,
            transport: 'stdio',
            command: 'npx',
            env: { NODE_OPTIONS: '--require pwn', GOOD: '1' },
          },
        ],
      }),
    });
    const body = (await response.json()) as { errors: Array<{ error: string }> };

    expect(response.status).toBe(200);
    expect(callTool).not.toHaveBeenCalled();
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].error).toMatch(/NODE_OPTIONS/);
  });

  it('passes configured timeout and longRunning through to the client bridge', async () => {
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    const app = createServer(
      { geminiApiBase: 'https://example.test', geminiApiKey: 'k' },
      { mcpClient: { listTools: vi.fn(), callTool } },
    );
    const started = serverCleanup2.track(await startHttpServer(app));

    const server = {
      id: 'slowish',
      name: 'Slowish',
      enabled: true,
      transport: 'http',
      url: 'https://s.example.com/mcp',
      timeout: 300,
      longRunning: true,
    };
    const response = await fetch(`${started.baseUrl}/api/mcp/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server, toolName: 'long_task', args: {} }),
    });

    expect(response.status).toBe(200);
    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'slowish', timeout: 300, longRunning: true }),
      'long_task',
      {},
    );
  });

  it('streams progress notifications as NDJSON lines when the caller asks for them', async () => {
    const callTool = vi.fn(async (_server, _toolName, _args, onProgress) => {
      onProgress?.({ progress: 1, total: 2, message: 'halfway' });
      onProgress?.({ progress: 2, total: 2 });
      return { ok: true };
    });
    const app = createServer(
      { geminiApiBase: 'https://example.test', geminiApiKey: 'k', enableMcpStdio: true },
      { mcpClient: { listTools: vi.fn(), callTool } },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
      body: JSON.stringify({
        server: { id: 'fs', name: 'Filesystem', enabled: true, transport: 'stdio', command: 'npx' },
        toolName: 'read_file',
        args: { path: '/tmp/a.txt' },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await response.text())
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual([
      { type: 'start' },
      { type: 'progress', progress: 1, total: 2, message: 'halfway' },
      { type: 'progress', progress: 2, total: 2 },
      { type: 'result', result: { ok: true } },
    ]);
    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs' }),
      'read_file',
      { path: '/tmp/a.txt' },
      expect.any(Function),
    );
  });

  it('reports mid-stream tool failures as a terminal error line', async () => {
    const callTool = vi.fn(async (_server, _toolName, _args, onProgress) => {
      onProgress?.({ message: 'starting' });
      throw new Error('boom during execution');
    });
    const app = createServer(
      { geminiApiBase: 'https://example.test', geminiApiKey: 'k', enableMcpStdio: true },
      { mcpClient: { listTools: vi.fn(), callTool } },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
      body: JSON.stringify({
        server: { id: 'fs', name: 'Filesystem', enabled: true, transport: 'stdio', command: 'npx' },
        toolName: 'read_file',
        args: {},
      }),
    });

    expect(response.status).toBe(200);
    const lines = (await response.text())
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual([
      { type: 'start' },
      { type: 'progress', message: 'starting' },
      { type: 'error', error: 'boom during execution' },
    ]);
  });

  it('keeps validation failures as plain JSON even when NDJSON was requested', async () => {
    const callTool = vi.fn();
    const app = createServer(
      { geminiApiBase: 'https://example.test', geminiApiKey: 'k' },
      { mcpClient: { listTools: vi.fn(), callTool } },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/mcp/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
      body: JSON.stringify({
        server: { id: 'fs', name: 'Filesystem', enabled: true, transport: 'stdio', command: 'npx' },
        toolName: '',
        args: {},
      }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect((await response.json()) as Record<string, unknown>).toEqual({ error: 'MCP tool name is required.' });
    expect(callTool).not.toHaveBeenCalled();
  });
});
