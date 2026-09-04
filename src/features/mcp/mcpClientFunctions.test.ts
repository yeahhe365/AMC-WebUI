import { Type } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { McpServerConfig } from '@/types';
import { logService } from '@/services/logService';
import type { McpToolDefinition } from '@/services/api/mcpApi';
import { useMcpToolRun } from '@/stores/mcpToolRuntimeStore';
import { createMcpClientFunctions } from './mcpClientFunctions';
import { toMcpFunctionName } from './mcpToolNames';

describe('createMcpClientFunctions', () => {
  const filesystemServer: McpServerConfig = {
    id: 'filesystem',
    name: 'Filesystem',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  };

  it('returns no functions when there are no enabled MCP servers', async () => {
    const listTools = vi.fn();

    await expect(
      createMcpClientFunctions({
        servers: [{ ...filesystemServer, enabled: false }],
        listTools,
        callTool: vi.fn(),
      }),
    ).resolves.toEqual({});

    expect(listTools).not.toHaveBeenCalled();
  });

  it('builds Gemini function declarations and handlers for discovered MCP tools', async () => {
    const listTools = vi.fn(async () => ({
      servers: [
        {
          serverId: 'filesystem',
          serverName: 'Filesystem',
          tools: [
            {
              name: 'read_file',
              description: 'Read a file from disk.',
              inputSchema: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                    description: 'Path to read.',
                  },
                  includeMetadata: {
                    type: 'boolean',
                  },
                },
                required: ['path'],
              },
            },
          ],
        },
      ],
      errors: [],
    }));
    const callTool = vi.fn(async () => ({
      content: [{ type: 'text', text: 'file contents' }],
    }));
    const abortController = new AbortController();

    const functions = await createMcpClientFunctions({
      servers: [filesystemServer],
      listTools,
      callTool,
      abortSignal: abortController.signal,
    });
    const functionName = toMcpFunctionName('filesystem', 'read_file');

    expect(listTools).toHaveBeenCalledWith([filesystemServer], abortController.signal);
    expect(functions[functionName].declaration).toMatchObject({
      name: functionName,
      description: 'MCP tool read_file from Filesystem. Read a file from disk.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          path: {
            type: Type.STRING,
            description: 'Path to read.',
          },
          includeMetadata: {
            type: Type.BOOLEAN,
          },
        },
        required: ['path'],
      },
    });

    await expect(
      functions[functionName].handler({ path: '/tmp/demo.txt' }, { abortSignal: abortController.signal }),
    ).resolves.toEqual({
      response: {
        content: [{ type: 'text', text: 'file contents' }],
      },
    });
    expect(callTool).toHaveBeenCalledWith(
      filesystemServer,
      'read_file',
      { path: '/tmp/demo.txt' },
      abortController.signal,
      expect.any(Function),
    );
  });

  it('uses runtime-unique server ids so duplicate user ids do not call the wrong MCP server', async () => {
    const secondServer: McpServerConfig = {
      ...filesystemServer,
      name: 'Second Filesystem',
      command: 'node',
      args: ['second-server.js'],
    };
    const listTools = vi.fn(async (servers: McpServerConfig[]) => ({
      servers: servers.map((server) => ({
        serverId: server.id,
        serverName: server.name,
        tools: [
          {
            name: 'read_file',
            inputSchema: {
              type: 'object',
            },
          },
        ],
      })),
      errors: [],
    }));
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));

    const functions = await createMcpClientFunctions({
      servers: [filesystemServer, secondServer],
      listTools,
      callTool,
    });

    const requestedServers = listTools.mock.calls[0][0] as McpServerConfig[];
    expect(requestedServers).toHaveLength(2);
    expect(requestedServers[0].id).not.toBe(requestedServers[1].id);

    const functionNames = Object.keys(functions);
    expect(functionNames).toHaveLength(2);

    await functions[functionNames[0]].handler({ path: '/tmp/first.txt' });
    await functions[functionNames[1]].handler({ path: '/tmp/second.txt' });

    expect(callTool).toHaveBeenNthCalledWith(
      1,
      filesystemServer,
      'read_file',
      { path: '/tmp/first.txt' },
      undefined,
      expect.any(Function),
    );
    expect(callTool).toHaveBeenNthCalledWith(
      2,
      secondServer,
      'read_file',
      { path: '/tmp/second.txt' },
      undefined,
      expect.any(Function),
    );
  });

  it('does not throw when listTools fails so chat can continue without MCP tools', async () => {
    const listTools = vi.fn(async () => {
      throw new Error('MCP API proxy request failed: ECONNREFUSED');
    });

    await expect(
      createMcpClientFunctions({
        servers: [filesystemServer],
        listTools,
        callTool: vi.fn(),
      }),
    ).resolves.toEqual({});
  });

  it('still registers tools from healthy servers when some discovery errors are reported', async () => {
    const listTools = vi.fn(async () => ({
      servers: [
        {
          serverId: 'filesystem',
          serverName: 'Filesystem',
          tools: [{ name: 'read_file', inputSchema: { type: 'object' } }],
        },
      ],
      errors: [
        {
          serverId: 'broken',
          serverName: 'Broken',
          error: 'MCP stdio transport is disabled on this API server.',
        },
      ],
    }));

    const functions = await createMcpClientFunctions({
      servers: [filesystemServer],
      listTools,
      callTool: vi.fn(),
    });

    expect(Object.keys(functions)).toHaveLength(1);
    expect(functions[toMcpFunctionName('filesystem', 'read_file')]).toBeDefined();
  });

  it('filters disabledTools before creating declarations', async () => {
    const servers = [
      {
        id: 's1',
        name: 'S1',
        enabled: true,
        transport: 'http',
        url: 'https://x',
        disabledTools: ['secret_tool'],
      } as any,
    ];
    const listTools = async () =>
      ({
        servers: [
          {
            serverId: 's1',
            serverName: 'S1',
            tools: [
              { name: 'secret_tool', description: '', inputSchema: { type: 'object' } } as any,
              { name: 'ok_tool', description: '', inputSchema: { type: 'object' } } as any,
            ],
          },
        ],
        errors: [],
      }) as any;
    const fns = await createMcpClientFunctions({ servers, listTools } as any);
    expect(Object.keys(fns).some((k) => k.includes('secret_tool'))).toBe(false);
    expect(Object.keys(fns).some((k) => k.includes('ok_tool'))).toBe(true);
  });

  it('re-checks latest servers at call time and rejects tools disabled mid-turn', async () => {
    const servers = [{ id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'https://x' } as any];
    const listTools = async () =>
      ({
        servers: [
          {
            serverId: 's1',
            serverName: 'S1',
            tools: [{ name: 'ok_tool', description: '', inputSchema: { type: 'object' } } as any],
          },
        ],
        errors: [],
      }) as any;
    const callTool = vi.fn(async () => ({ content: [] }));
    // Discovery cache is stale by construction here: the user disabled the
    // tool (then the whole server) after discovery ran.
    const fns = await createMcpClientFunctions({
      servers,
      listTools,
      callTool,
      resolveLatestServers: () => [{ ...servers[0], enabled: true, disabledTools: ['ok_tool'] }] as any,
    } as any);
    const handlerKey = Object.keys(fns).find((key) => key.includes('ok_tool'))!;
    await expect(fns[handlerKey].handler({}, {} as any)).rejects.toThrow(/disabled by the user/);
    expect(callTool).not.toHaveBeenCalled();

    const fns2 = await createMcpClientFunctions({
      servers,
      listTools,
      callTool,
      resolveLatestServers: () => [{ ...servers[0], enabled: false }] as any,
    } as any);
    const handlerKey2 = Object.keys(fns2).find((key) => key.includes('ok_tool'))!;
    await expect(fns2[handlerKey2].handler({}, {} as any)).rejects.toThrow(/disabled by the user/);
    expect(callTool).not.toHaveBeenCalled();

    // Unchanged config passes through to the real call.
    const fns3 = await createMcpClientFunctions({
      servers,
      listTools,
      callTool,
      resolveLatestServers: () => servers,
    } as any);
    const handlerKey3 = Object.keys(fns3).find((key) => key.includes('ok_tool'))!;
    await expect(fns3[handlerKey3].handler({}, {} as any)).resolves.toBeTruthy();
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('maps nullable JSON Schema types and anyOf object branches into Gemini schemas', async () => {
    const listTools = vi.fn(async () => ({
      servers: [
        {
          serverId: 'filesystem',
          serverName: 'Filesystem',
          tools: [
            {
              name: 'write_file',
              inputSchema: {
                type: 'object',
                properties: {
                  path: { type: ['string', 'null'], description: 'Target path' },
                  payload: {
                    anyOf: [
                      {
                        type: 'object',
                        properties: { text: { type: 'string' } },
                        required: ['text'],
                      },
                      { type: 'null' },
                    ],
                  },
                },
                required: ['path'],
              },
            },
          ],
        },
      ],
      errors: [],
    }));

    const functions = await createMcpClientFunctions({
      servers: [filesystemServer],
      listTools,
      callTool: vi.fn(),
    });
    const declaration = functions[toMcpFunctionName('filesystem', 'write_file')].declaration;

    expect(declaration.parameters).toMatchObject({
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'Target path',
          nullable: true,
        },
        payload: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
          },
          required: ['text'],
        },
      },
      required: ['path'],
    });
  });

  it('passes supported validation keywords through to Gemini schemas', async () => {
    const listTools = vi.fn(async () => ({
      servers: [
        {
          serverId: 'filesystem',
          serverName: 'Filesystem',
          tools: [
            {
              name: 'query',
              inputSchema: {
                type: 'object',
                properties: {
                  code: { type: 'string', pattern: '^[a-z]+$', minLength: 2, maxLength: 64 },
                  page: { type: 'integer', minimum: 1, maximum: 100 },
                  tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
                },
                minProperties: 1,
                maxProperties: 3,
                propertyOrdering: ['code', 'page', 'tags'],
              },
            },
          ],
        },
      ],
      errors: [],
    }));

    const functions = await createMcpClientFunctions({
      servers: [filesystemServer],
      listTools,
      callTool: vi.fn(),
    });
    const declaration = functions[toMcpFunctionName('filesystem', 'query')].declaration;
    const properties = (declaration.parameters as { properties: Record<string, object> }).properties;

    expect(properties.code).toMatchObject({ pattern: '^[a-z]+$', minLength: '2', maxLength: '64' });
    expect(properties.page).toMatchObject({ minimum: 1, maximum: 100 });
    expect(properties.tags).toMatchObject({ minItems: '1', maxItems: '5' });
    expect(declaration.parameters).toMatchObject({
      minProperties: '1',
      maxProperties: '3',
      propertyOrdering: ['code', 'page', 'tags'],
    });
  });

  it('warns only when the active tool count exceeds the recommended set', async () => {
    // logService comes from the global setup mock; clear its shared history
    // instead of stacking another spy on top of the existing vi.fn.
    const warnMock = vi.mocked(logService.warn);
    warnMock.mockClear();
    const toolsOf = (count: number): McpToolDefinition[] =>
      Array.from({ length: count }, (_unused, index) => ({
        name: `tool_${index}`,
        inputSchema: { type: 'object' },
      }));
    const listToolsFor = (tools: McpToolDefinition[]) =>
      vi.fn(async () => ({
        servers: [{ serverId: 'filesystem', serverName: 'Filesystem', tools }],
        errors: [],
      }));

    await createMcpClientFunctions({
      servers: [filesystemServer],
      listTools: listToolsFor(toolsOf(20)),
      callTool: vi.fn(),
    });
    expect(warnMock).not.toHaveBeenCalled();

    await createMcpClientFunctions({
      servers: [filesystemServer],
      listTools: listToolsFor(toolsOf(21)),
      callTool: vi.fn(),
    });
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('21 MCP tools are active'),
      expect.objectContaining({ totalToolCount: 21 }),
    );
  });
});

describe('createMcpClientFunctions discovery cache', () => {
  const httpServer: McpServerConfig = {
    id: 'cache-remote',
    name: 'Cache Remote',
    enabled: true,
    transport: 'http',
    url: 'https://mcp.example.com/mcp',
  };

  const toolResponse = {
    servers: [
      {
        serverId: 'cache-remote',
        serverName: 'Cache Remote',
        tools: [{ name: 'echo', description: 'Echo', inputSchema: { type: 'object' } }],
      },
    ],
    errors: [],
  };

  it('reuses a fresh discovery response across consecutive turns', async () => {
    const listTools = vi.fn(async () => toolResponse);

    const first = await createMcpClientFunctions({ servers: [httpServer], listTools, callTool: vi.fn() });
    const second = await createMcpClientFunctions({ servers: [httpServer], listTools, callTool: vi.fn() });

    expect(listTools).toHaveBeenCalledTimes(1);
    expect(Object.keys(second)).toEqual(Object.keys(first));
  });

  it('refetches when the server configuration changes', async () => {
    const listTools = vi.fn(async () => toolResponse);

    await createMcpClientFunctions({ servers: [httpServer], listTools, callTool: vi.fn() });
    await createMcpClientFunctions({
      servers: [{ ...httpServer, url: 'https://other.example.com/mcp' }],
      listTools,
      callTool: vi.fn(),
    });

    expect(listTools).toHaveBeenCalledTimes(2);
  });

  it('refetches after the discovery cache expires', async () => {
    vi.useFakeTimers();
    try {
      const listTools = vi.fn(async () => toolResponse);

      await createMcpClientFunctions({ servers: [httpServer], listTools, callTool: vi.fn() });
      vi.advanceTimersByTime(31_000);
      await createMcpClientFunctions({ servers: [httpServer], listTools, callTool: vi.fn() });

      expect(listTools).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createMcpClientFunctions approval gate', () => {
  const server: McpServerConfig = {
    id: 'fs',
    name: 'FS',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
    disabledAutoApproveTools: ['write_file'],
  };
  const listTools = vi.fn(async () => ({
    servers: [
      {
        serverId: 'fs',
        serverName: 'FS',
        tools: [
          { name: 'read_file', inputSchema: { type: 'object' } },
          { name: 'write_file', inputSchema: { type: 'object' } },
        ],
      },
    ],
    errors: [],
  }));

  it('auto-executes tools not requiring approval without consulting the callback', async () => {
    const callTool = vi.fn(async () => ({ content: [] }));
    const requestApproval = vi.fn();
    const fns = await createMcpClientFunctions({ servers: [server], listTools, callTool, requestApproval });
    await fns[toMcpFunctionName('fs', 'read_file')].handler({}, undefined);
    expect(callTool).toHaveBeenCalledOnce();
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('denies a gated tool when the user rejects and never calls the tool', async () => {
    const callTool = vi.fn(async () => ({ content: [] }));
    const requestApproval = vi.fn(async () => 'deny' as const);
    const fns = await createMcpClientFunctions({ servers: [server], listTools, callTool, requestApproval });
    await expect(fns[toMcpFunctionName('fs', 'write_file')].handler({ path: '/x' }, undefined)).rejects.toThrow(
      /denied/i,
    );
    expect(callTool).not.toHaveBeenCalled();
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: 'fs', serverName: 'FS', toolName: 'write_file', args: { path: '/x' } }),
    );
  });

  it('remembers allow-session decisions for subsequent calls', async () => {
    const callTool = vi.fn(async () => ({ content: [] }));
    const requestApproval = vi.fn(async () => 'allow-session' as const);
    const fns = await createMcpClientFunctions({ servers: [server], listTools, callTool, requestApproval });
    const handler = fns[toMcpFunctionName('fs', 'write_file')].handler;
    await handler({}, undefined);
    await handler({}, undefined);
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it('auto-executes gated tools when no approval callback is supplied (headless)', async () => {
    const callTool = vi.fn(async () => ({ content: [] }));
    const fns = await createMcpClientFunctions({ servers: [server], listTools, callTool });
    await fns[toMcpFunctionName('fs', 'write_file')].handler({}, undefined);
    expect(callTool).toHaveBeenCalledOnce();
  });
});

describe('createMcpClientFunctions live run lifecycle', () => {
  const server: McpServerConfig = {
    id: 'fs',
    name: 'FS',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
  };
  const listTools = vi.fn(async () => ({
    servers: [
      {
        serverId: 'fs',
        serverName: 'FS',
        tools: [{ name: 'read_file', inputSchema: { type: 'object' } }],
      },
    ],
    errors: [],
  }));

  const getHandler = async (callTool: Parameters<typeof createMcpClientFunctions>[0]['callTool']) => {
    const fns = await createMcpClientFunctions({ servers: [server], listTools, callTool });
    return fns[toMcpFunctionName('fs', 'read_file')].handler;
  };

  it('opens a run keyed by the args object, forwards progress, and closes with success', async () => {
    let capturedOnProgress: ((event: { message?: string }) => void) | undefined;
    const callTool = vi.fn(
      async (
        _server: McpServerConfig,
        _toolName: string,
        _args: Record<string, unknown>,
        _signal?: AbortSignal,
        onProgress?: (event: { message?: string }) => void,
      ) => {
        capturedOnProgress = onProgress;
        return { content: [] };
      },
    );
    const handler = await getHandler(callTool);
    const args = { path: '/tmp/a.txt' };

    const pending = handler(args, undefined);
    const { result } = renderHook(() => useMcpToolRun(args));

    expect(result.current?.status).toBe('running');
    act(() => {
      capturedOnProgress?.({ message: 'halfway' });
    });
    expect(result.current?.events).toEqual([{ message: 'halfway', at: expect.any(Number) }]);

    await act(async () => {
      await pending;
    });
    expect(result.current?.status).toBe('success');
  });

  it('marks the run errored when the tool fails and cancelled when aborted', async () => {
    const failingCallTool = vi.fn(async (_server, _toolName, _args, signal?: AbortSignal) => {
      if (!signal?.aborted) throw new Error('tool exploded');
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    const handler = await getHandler(failingCallTool);

    const argsError = { mode: 'error' };
    await expect(handler(argsError, undefined)).rejects.toThrow('tool exploded');
    const errorRun = renderHook(() => useMcpToolRun(argsError)).result.current;
    expect(errorRun?.status).toBe('error');

    const abortController = new AbortController();
    abortController.abort();
    const argsCancelled = { mode: 'cancelled' };
    await expect(handler(argsCancelled, { abortSignal: abortController.signal })).rejects.toThrow('aborted');
    const cancelledRun = renderHook(() => useMcpToolRun(argsCancelled)).result.current;
    expect(cancelledRun?.status).toBe('cancelled');
  });

  it('reports MCP isError results as failed runs with the tool text as the error', async () => {
    // MCP reports execution failures via isError:true on a successful RPC.
    const callTool = vi.fn(async () => ({
      content: [{ type: 'text', text: 'disk full' }],
      isError: true,
    }));
    const handler = await getHandler(callTool);
    const args = { path: '/tmp/full.bin' };

    await expect(handler(args, undefined)).rejects.toThrow('disk full');

    const run = renderHook(() => useMcpToolRun(args)).result.current;
    expect(run?.status).toBe('error');
  });
});
