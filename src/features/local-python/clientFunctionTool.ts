import type { FunctionDeclaration, Type } from '@google/genai';
import type { ExecutionResult } from './pyodideService';
import type { UploadedFile } from '@/types';
import { createUploadedFileFromBytes } from '@/utils/chat/parsing';
import { hasGeneratedImageFile } from './executionFiles';

type PythonRunOptions = { files?: UploadedFile[]; abortSignal?: AbortSignal };
type PythonRunResult = Omit<ExecutionResult, 'status'>;

interface CreateLocalPythonToolHandlerOptions<RunOptions extends PythonRunOptions> {
  getRunOptions: (options?: { abortSignal?: AbortSignal }) => RunOptions;
  runPython: (code: string, options?: RunOptions) => Promise<PythonRunResult>;
}

export const createLocalPythonToolDeclaration = (): FunctionDeclaration => ({
  name: 'run_local_python',
  description:
    'Execute Python code locally in the browser with Pyodide. Use this for calculations, data analysis, CSV inspection, and lightweight plots.',
  parameters: {
    type: 'OBJECT' as Type,
    properties: {
      code: {
        type: 'STRING' as Type,
        description: 'The Python code to execute locally.',
      },
    },
    required: ['code'],
  },
});

export const createLocalPythonToolHandler = <RunOptions extends PythonRunOptions>({
  getRunOptions,
  runPython,
}: CreateLocalPythonToolHandlerOptions<RunOptions>) => {
  return async (args: unknown, options?: { abortSignal?: AbortSignal }) => {
    const code =
      typeof args === 'object' && args !== null
        ? ((args as { code?: unknown }).code ??
          (args as { python_code?: unknown }).python_code ??
          (args as { script?: unknown }).script)
        : typeof args === 'string'
          ? args
          : undefined;

    if (typeof code !== 'string' || !code.trim()) {
      throw new Error('run_local_python requires a non-empty "code" string.');
    }

    const result = await runPython(code, getRunOptions(options));
    const outputFiles = result.files || [];
    const generatedFiles = [...outputFiles].map((file) => createUploadedFileFromBytes(file.data, file.type, file.name));

    if (result.image && !hasGeneratedImageFile(outputFiles)) {
      generatedFiles.unshift(createUploadedFileFromBytes(result.image, 'image/png', `generated-plot-${Date.now()}`));
    }

    const hasImage = Boolean(result.image || hasGeneratedImageFile(outputFiles));

    return {
      response: {
        output: result.output || null,
        result: result.result || null,
        imageGenerated: hasImage,
        generatedFiles: outputFiles.map(({ name, type }) => ({ name, type })),
      },
      generatedFiles,
    };
  };
};
