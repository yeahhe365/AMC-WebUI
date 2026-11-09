import { registerVirtualMcpServer, type VirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';
import type { McpToolDefinition } from '@/services/api/mcpApi';
import { useChatStore } from '@/stores/chatStore';
import { asTrimmedString, isRecord } from '../../../shared/predicates';
import { collectLocalJsInputFiles } from './executionFiles';
import { executeJavaScript, type SandboxExecutionResult, type SandboxRunnerOptions } from './sandboxRunner';

export const LOCAL_JS_VIRTUAL_MCP_ID = 'amc_local_javascript';

export const LOCAL_JS_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'run_javascript',
    description:
      'Execute JavaScript or TypeScript code in a fast, isolated browser Web Worker sandbox. Supports ESNext features (async/await, promises, modern JS syntax) and basic TypeScript type annotations. Context text files (JSON, CSV, TXT, MD) uploaded to the active chat session are accessible via the global `files` object (e.g. `files["data.json"]` as string). Returns console logs and return value. Dangerous APIs (network, storage, eval) are completely blocked.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The JavaScript or TypeScript code to execute in the local sandbox.',
        },
        timeoutMs: {
          type: 'number',
          description: 'Optional execution timeout in milliseconds (default 5000, max 30000).',
        },
      },
      required: ['code'],
    },
  },
];

export interface LocalJsVirtualMcpDeps {
  execute?: (code: string, options?: SandboxRunnerOptions) => Promise<SandboxExecutionResult>;
  getActiveFiles?: () => Record<string, string>;
}

export const createLocalJsVirtualMcpServer = (deps: LocalJsVirtualMcpDeps = {}): VirtualMcpServer => {
  return {
    id: LOCAL_JS_VIRTUAL_MCP_ID,
    name: 'JavaScript Sandbox (Web Worker)',
    description: 'Execute JavaScript/TypeScript code locally in a high-speed isolated browser Web Worker sandbox.',
    // Sandboxed in a Web Worker with network/storage APIs blocked, so a prompt
    // on every call would only train the user to click through dialogs.
    autoApproveTools: ['run_javascript'],
    listTools: async () => LOCAL_JS_MCP_TOOLS,
    callTool: async (toolName, args, signal) => {
      if (toolName !== 'run_javascript') {
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        };
      }

      const rawCode = isRecord(args)
        ? (args.code ?? args.js_code ?? args.javascript_code ?? args.script)
        : (args as unknown);
      const code = asTrimmedString(rawCode);

      if (!code) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'run_javascript requires a non-empty "code" string parameter.',
            },
          ],
        };
      }

      const timeoutMs =
        isRecord(args) && typeof args.timeoutMs === 'number' && Number.isFinite(args.timeoutMs)
          ? args.timeoutMs
          : undefined;

      const inputFiles = deps.getActiveFiles
        ? deps.getActiveFiles()
        : collectLocalJsInputFiles(useChatStore.getState().activeMessages, '');

      const runner = deps.execute ?? executeJavaScript;
      const runResult = await runner(code, {
        files: inputFiles,
        timeoutMs,
        abortSignal: signal,
      });

      if (runResult.status === 'error') {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: runResult.output || runResult.error || 'JavaScript execution failed with an unknown error.',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: runResult.output || '(Code executed successfully with no output)',
          },
        ],
      };
    },
  };
};

export const initLocalJsVirtualMcpServer = (): (() => void) => {
  const server = createLocalJsVirtualMcpServer();
  return registerVirtualMcpServer(server);
};
