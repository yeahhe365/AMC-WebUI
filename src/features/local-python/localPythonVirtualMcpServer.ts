import { registerVirtualMcpServer, type VirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';
import type { McpToolDefinition } from '@/services/api/mcpApi';
import type { UploadedFile } from '@/types';
import { useChatStore } from '@/stores/chatStore';
import { collectLocalPythonInputFiles } from './executionFiles';
import { arrayBufferToBase64 } from '@/utils/file/fileEncoding';
import { isImageMimeType } from '@/utils/file/fileTypeClassification';
import { createUploadedFileFromBytes } from '@/utils/chat/parsing';
import { isRecord } from '../../../shared/predicates';

export const LOCAL_PYTHON_VIRTUAL_MCP_ID = 'amc_local_python';

export const LOCAL_PYTHON_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'run_python',
    description:
      'Execute Python code locally in the browser sandbox using Pyodide (CPython 3.12 WebAssembly). Pre-installed with numpy, pandas, matplotlib, scipy, sympy, scikit-learn. Use print() or return statements to output text. Context files (CSV, TXT, JSON) uploaded to the active chat session are automatically mounted in the working directory (.). Plots and charts are captured automatically as images.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The Python code to execute in the local Pyodide sandbox.',
        },
      },
      required: ['code'],
    },
  },
];

export interface LocalPythonVirtualMcpDeps {
  getPyodideService?: () => Promise<{
    runPython: (
      code: string,
      options?: { files?: UploadedFile[]; abortSignal?: AbortSignal },
    ) => Promise<{
      output: string;
      image?: ArrayBuffer | null;
      files?: Array<{ name: string; data: ArrayBuffer; type: string }>;
      result?: string;
      error?: string;
      status: 'success' | 'error';
    }>;
  }>;
  getActiveFiles?: () => UploadedFile[];
}

const asString = (val: unknown): string | undefined => (typeof val === 'string' && val.trim() ? val.trim() : undefined);

export const createLocalPythonVirtualMcpServer = (deps: LocalPythonVirtualMcpDeps = {}): VirtualMcpServer => {
  return {
    id: LOCAL_PYTHON_VIRTUAL_MCP_ID,
    name: 'Python Sandbox (Pyodide)',
    description: 'Execute Python code locally in the browser sandbox using Pyodide (numpy, pandas, matplotlib, scipy).',
    listTools: async () => LOCAL_PYTHON_MCP_TOOLS,
    callTool: async (toolName, args, signal) => {
      if (toolName !== 'run_python') {
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        };
      }

      const rawCode = isRecord(args) ? (args.code ?? args.python_code ?? args.script) : (args as unknown);
      const code = asString(rawCode);

      if (!code) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'run_python requires a non-empty "code" string parameter.' }],
        };
      }

      const inputFiles = deps.getActiveFiles
        ? deps.getActiveFiles()
        : collectLocalPythonInputFiles(useChatStore.getState().activeMessages, '');

      const loader =
        deps.getPyodideService ??
        (async () => {
          const { getPyodideService } = await import('./loadPyodideService');
          return getPyodideService();
        });

      const pyodide = await loader();
      const runResult = await pyodide.runPython(code, { files: inputFiles, abortSignal: signal });

      if (runResult.status === 'error') {
        const errParts = [runResult.output, runResult.error]
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim());
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: errParts.join('\n\n') || 'Python execution failed with an unknown error.',
            },
          ],
        };
      }

      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];

      const outputFiles = runResult.files || [];
      const generatedFiles: UploadedFile[] = outputFiles.map((file) =>
        createUploadedFileFromBytes(file.data, file.type, file.name),
      );

      const hasImgFile = outputFiles.some((f) => isImageMimeType(f.type));
      if (runResult.image && !hasImgFile) {
        const imageBase64 = arrayBufferToBase64(runResult.image);
        content.push({
          type: 'image',
          data: imageBase64,
          mimeType: 'image/png',
        });
        generatedFiles.unshift(
          createUploadedFileFromBytes(runResult.image, 'image/png', `generated-plot-${Date.now()}.png`),
        );
      } else if (hasImgFile) {
        const img = outputFiles.find((f) => isImageMimeType(f.type));
        if (img) {
          content.push({
            type: 'image',
            data: arrayBufferToBase64(img.data),
            mimeType: img.type || 'image/png',
          });
        }
      }

      const textParts: string[] = [];
      if (runResult.output?.trim()) {
        textParts.push(runResult.output.trim());
      }
      if (runResult.result && runResult.result !== 'None') {
        textParts.push(`Return: ${runResult.result}`);
      }
      if (outputFiles.length > 0) {
        textParts.push(`[Generated files: ${outputFiles.map((f) => f.name).join(', ')}]`);
      }
      if (textParts.length === 0 && content.length === 0) {
        textParts.push('(Code executed successfully with no output)');
      }

      if (textParts.length > 0) {
        content.unshift({
          type: 'text',
          text: textParts.join('\n\n'),
        });
      }

      return {
        content,
        generatedFiles,
      };
    },
  };
};

export const initLocalPythonVirtualMcpServer = (): (() => void) => {
  const server = createLocalPythonVirtualMcpServer();
  return registerVirtualMcpServer(server);
};
