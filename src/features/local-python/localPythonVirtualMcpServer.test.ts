import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createLocalPythonVirtualMcpServer,
  initLocalPythonVirtualMcpServer,
  LOCAL_PYTHON_MCP_TOOLS,
  LOCAL_PYTHON_VIRTUAL_MCP_ID,
} from './localPythonVirtualMcpServer';
import { clearVirtualMcpServers, findVirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';

describe('localPythonVirtualMcpServer', () => {
  beforeEach(() => {
    clearVirtualMcpServers();
    vi.clearAllMocks();
  });

  it('exposes standard MCP tool declarations for run_python', async () => {
    const server = createLocalPythonVirtualMcpServer();
    expect(server.id).toBe(LOCAL_PYTHON_VIRTUAL_MCP_ID);
    expect(server.name).toBe('Python Sandbox (Pyodide)');

    const tools = await server.listTools();
    expect(tools).toEqual(LOCAL_PYTHON_MCP_TOOLS);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('run_python');
    expect(tools[0].inputSchema).toEqual(
      expect.objectContaining({
        type: 'object',
        required: ['code'],
      }),
    );
  });

  it('rejects unknown tool calls with an error result', async () => {
    const server = createLocalPythonVirtualMcpServer();
    const res = (await server.callTool('unknown_tool', {})) as Record<string, unknown>;
    expect(res.isError).toBe(true);
    expect(res.content).toEqual([{ type: 'text', text: 'Unknown tool: unknown_tool' }]);
  });

  it('rejects missing or empty code arguments', async () => {
    const server = createLocalPythonVirtualMcpServer();
    const res1 = (await server.callTool('run_python', {})) as Record<string, unknown>;
    expect(res1.isError).toBe(true);
    expect(res1.content).toEqual([{ type: 'text', text: 'run_python requires a non-empty "code" string parameter.' }]);

    const res2 = (await server.callTool('run_python', { code: '   ' })) as Record<string, unknown>;
    expect(res2.isError).toBe(true);
  });

  it('executes python code successfully and formats stdout and return value', async () => {
    const mockRunPython = vi.fn().mockResolvedValue({
      status: 'success',
      output: 'Hello, World!\n',
      result: '42',
      files: [],
    });

    const server = createLocalPythonVirtualMcpServer({
      getPyodideService: async () => ({ runPython: mockRunPython }),
    });

    const res = (await server.callTool('run_python', { code: 'print("Hello, World!")\n42' })) as Record<
      string,
      unknown
    >;

    expect(mockRunPython).toHaveBeenCalledWith('print("Hello, World!")\n42', {
      files: expect.any(Array),
      abortSignal: undefined,
    });
    expect(res.isError).toBeUndefined();
    expect(res.content).toEqual([
      {
        type: 'text',
        text: 'Hello, World!\n\nReturn: 42',
      },
    ]);
  });

  it('supports python_code and script aliases and string argument', async () => {
    const mockRunPython = vi.fn().mockResolvedValue({
      status: 'success',
      output: 'ok',
      files: [],
    });

    const server = createLocalPythonVirtualMcpServer({
      getPyodideService: async () => ({ runPython: mockRunPython }),
    });

    await server.callTool('run_python', { python_code: 'print("aliased")' });
    expect(mockRunPython).toHaveBeenLastCalledWith('print("aliased")', expect.anything());

    await server.callTool('run_python', { script: 'print("script")' });
    expect(mockRunPython).toHaveBeenLastCalledWith('print("script")', expect.anything());

    await server.callTool('run_python', 'print("raw_string")' as any);
    expect(mockRunPython).toHaveBeenLastCalledWith('print("raw_string")', expect.anything());
  });

  it('handles matplotlib plot images and encodes them as base64 MCP image content', async () => {
    const fakeImageData = new Uint8Array([137, 80, 78, 71]).buffer; // PNG header bytes
    const mockRunPython = vi.fn().mockResolvedValue({
      status: 'success',
      output: 'Plot generated',
      image: fakeImageData,
      files: [],
    });

    const server = createLocalPythonVirtualMcpServer({
      getPyodideService: async () => ({ runPython: mockRunPython }),
    });

    const res = (await server.callTool('run_python', {
      code: 'import matplotlib.pyplot as plt; plt.plot([1, 2])',
    })) as {
      content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      generatedFiles: Array<{ name: string; type: string }>;
    };

    expect(res.content).toHaveLength(2);
    expect(res.content[0]).toEqual({ type: 'text', text: 'Plot generated' });
    expect(res.content[1]).toMatchObject({
      type: 'image',
      mimeType: 'image/png',
      data: expect.any(String),
    });
    expect(res.generatedFiles).toHaveLength(1);
    expect(res.generatedFiles[0].type).toBe('image/png');
  });

  it('handles generated files and attaches them to result', async () => {
    const fakeFileData = new TextEncoder().encode('col1,col2\n1,2').buffer;
    const mockRunPython = vi.fn().mockResolvedValue({
      status: 'success',
      output: 'Wrote output.csv',
      files: [{ name: 'output.csv', data: fakeFileData, type: 'text/csv' }],
    });

    const server = createLocalPythonVirtualMcpServer({
      getPyodideService: async () => ({ runPython: mockRunPython }),
    });

    const res = (await server.callTool('run_python', { code: 'with open("output.csv", "w") as f: ...' })) as {
      content: Array<{ type: string; text: string }>;
      generatedFiles: Array<{ name: string; type: string }>;
    };

    expect(res.content[0].text).toContain('Wrote output.csv');
    expect(res.content[0].text).toContain('[Generated files: output.csv]');
    expect(res.generatedFiles).toHaveLength(1);
    expect(res.generatedFiles[0].name).toBe('output.csv');
  });

  it('formats execution errors with error and traceback text', async () => {
    const mockRunPython = vi.fn().mockResolvedValue({
      status: 'error',
      output: 'before crash',
      error: 'ZeroDivisionError: division by zero',
    });

    const server = createLocalPythonVirtualMcpServer({
      getPyodideService: async () => ({ runPython: mockRunPython }),
    });

    const res = (await server.callTool('run_python', { code: '1/0' })) as Record<string, unknown>;

    expect(res.isError).toBe(true);
    expect(res.content).toEqual([
      {
        type: 'text',
        text: 'before crash\n\nZeroDivisionError: division by zero',
      },
    ]);
  });

  it('forwards custom active files and abort signal', async () => {
    const abortController = new AbortController();
    const mockRunPython = vi.fn().mockResolvedValue({
      status: 'success',
      output: 'done',
      files: [],
    });

    const mockFiles = [{ id: 'f1', name: 'test.csv' }] as any;

    const server = createLocalPythonVirtualMcpServer({
      getPyodideService: async () => ({ runPython: mockRunPython }),
      getActiveFiles: () => mockFiles,
    });

    await server.callTool('run_python', { code: 'print("done")' }, abortController.signal);

    expect(mockRunPython).toHaveBeenCalledWith('print("done")', {
      files: mockFiles,
      abortSignal: abortController.signal,
    });
  });

  it('registers into virtualMcpRegistry and can be unregistered', () => {
    expect(findVirtualMcpServer(LOCAL_PYTHON_VIRTUAL_MCP_ID)).toBeUndefined();

    const unregister = initLocalPythonVirtualMcpServer();
    expect(findVirtualMcpServer(LOCAL_PYTHON_VIRTUAL_MCP_ID)).toBeDefined();

    unregister();
    expect(findVirtualMcpServer(LOCAL_PYTHON_VIRTUAL_MCP_ID)).toBeUndefined();
  });
});
