import { registerVirtualMcpServer, type VirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';
import type { McpToolDefinition } from '@/services/api/mcpApi';
import { asTrimmedString, isRecord } from '../../../shared/predicates';
import {
  searchLibrary,
  readLibraryFile,
  type SearchLibraryOptions,
  type LibrarySearchResult,
  type ReadLibraryFileOptions,
  type ReadLibraryFileResult,
} from './librarySearch';

export const LIBRARY_SEARCH_VIRTUAL_MCP_ID = 'amc_library_search';

export const LIBRARY_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'search_library',
    description:
      'Search documents, code files, notes, and attachments stored locally in the user Library and Knowledge Base. Use this tool whenever the user asks to look up, search for, or consult uploaded files, references, code scripts, or documents. Returns file IDs, filenames, categories, file sizes, origins, and matching snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords to search across filenames, session origins, and text contents.',
        },
        fileType: {
          type: 'string',
          description:
            'Optional file category filter: "all", "document", "image", "pdf", "spreadsheet", "presentation", "audio", "video".',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum number of matching files to return (default 10, max 30).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_library_file',
    description:
      'Read the text content of a specific file from the library using its fileId (obtained from search_library). Use this tool to read source code, markdown documentation, configs, or text notes. Supports pagination via startLine and maxLines.',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'The unique ID of the library file to read (e.g. file-xxxx).',
        },
        startLine: {
          type: 'number',
          description: 'Optional starting line number (1-indexed, default 1).',
        },
        maxLines: {
          type: 'number',
          description: 'Optional maximum number of lines to read (default 200, max 1000).',
        },
      },
      required: ['fileId'],
    },
  },
];

export interface LibraryVirtualMcpDeps {
  searchLibrary?: (options: SearchLibraryOptions) => Promise<LibrarySearchResult[]>;
  readLibraryFile?: (options: ReadLibraryFileOptions) => Promise<ReadLibraryFileResult>;
}

const asNumber = (val: unknown): number | undefined =>
  typeof val === 'number' && !Number.isNaN(val) ? val : undefined;

const getFileExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
};

const mapExtensionToCodeLang = (ext: string): string => {
  const map: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    tsx: 'tsx',
    jsx: 'jsx',
    py: 'python',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    sql: 'sql',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    xml: 'xml',
    csv: 'csv',
    txt: 'text',
  };
  return map[ext] || '';
};

export const createLibraryVirtualMcpServer = (deps: LibraryVirtualMcpDeps = {}): VirtualMcpServer => {
  return {
    id: LIBRARY_SEARCH_VIRTUAL_MCP_ID,
    name: 'Knowledge Base & Library Search',
    description: 'Search and read documents, code, and notes stored in the local Library / Knowledge Base.',
    // Read-only over the user's own local library.
    autoApproveTools: ['search_library', 'read_library_file'],
    listTools: async () => LIBRARY_MCP_TOOLS,
    callTool: async (toolName, args) => {
      if (toolName === 'search_library') {
        const rawQuery = isRecord(args) ? (args.query ?? args.keyword ?? args.q) : (args as unknown);
        const query = asTrimmedString(rawQuery);

        if (!query) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: '缺少必需的搜索关键词参数 "query"。',
              },
            ],
          };
        }

        const rawFileType = isRecord(args) ? (args.fileType ?? args.category) : undefined;
        const fileType = asTrimmedString(rawFileType);
        const rawLimit = isRecord(args) ? args.limit : undefined;
        const limit = asNumber(rawLimit);

        const searchFn = deps.searchLibrary ?? searchLibrary;
        const results = await searchFn({ query, fileType, limit });

        if (results.length === 0) {
          return {
            isError: false,
            content: [
              {
                type: 'text',
                text: `未在资料库中找到与 "${query}" 匹配的文件。建议尝试其他关键词或放宽类型过滤。`,
              },
            ],
          };
        }

        const formattedList = results.map((item, index) => {
          const originDesc =
            item.source === 'standalone' ? '独立资料库文件' : `来自会话 “${item.sessionTitle || '未命名会话'}”`;
          const snippetText = item.snippet ? `\n  - **内容摘要**: ${item.snippet}` : '';
          return (
            `### ${index + 1}. 📄 ${item.name} (${item.formattedSize})\n` +
            `- **文件 ID**: \`${item.id}\`\n` +
            `- **分类**: ${item.fileType} (\`${item.type}\`)\n` +
            `- **来源**: ${originDesc}\n` +
            `- **时间**: ${item.dateStr || '未知'}` +
            snippetText
          );
        });

        const firstId = results[0].id;
        const responseText =
          `在资料库中检索到 ${results.length} 个匹配文件：\n\n` +
          formattedList.join('\n\n') +
          `\n\n💡 **后续操作提示**：如需深入查看特定文件的正文或代码内容，请调用 \`read_library_file(fileId="${firstId}")\`。`;

        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      }

      if (toolName === 'read_library_file') {
        const rawFileId = isRecord(args) ? (args.fileId ?? args.id) : (args as unknown);
        const fileId = asTrimmedString(rawFileId);

        if (!fileId) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: '缺少必需的文件 ID 参数 "fileId"。',
              },
            ],
          };
        }

        const rawStartLine = isRecord(args) ? args.startLine : undefined;
        const rawMaxLines = isRecord(args) ? args.maxLines : undefined;

        const readFn = deps.readLibraryFile ?? readLibraryFile;
        const result = await readFn({
          fileId,
          startLine: asNumber(rawStartLine),
          maxLines: asNumber(rawMaxLines),
        });

        if (!result.found) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: result.message || `未找到文件 ID 为 "${fileId}" 的资料库文件。`,
              },
            ],
          };
        }

        if (result.isBinary) {
          return {
            isError: false,
            content: [
              {
                type: 'text',
                text:
                  `### 📁 文件信息：${result.name}\n\n` +
                  `- **文件 ID**: \`${result.id}\`\n` +
                  `- **MIME 类型**: \`${result.type}\`\n\n` +
                  `⚠️ **注意**：${result.message || '该文件为二进制多媒体格式'}（无法以纯文本读取）。`,
              },
            ],
          };
        }

        const ext = getFileExtension(result.name || '');
        const lang = mapExtensionToCodeLang(ext);
        const codeBlock = `\`\`\`${lang}\n${result.content || ''}\n\`\`\``;

        let truncationNotice = '';
        if (result.truncated) {
          truncationNotice = `\n\n*(注意：内容已截断展示第 ${result.startLine}-${result.endLine} 行，共 ${result.totalLines} 行。可使用 startLine=${(result.endLine || 0) + 1} 继续调阅后续内容)*`;
        }

        const responseText =
          `### 📄 资料库文件：${result.name} (第 ${result.startLine}-${result.endLine} 行 / 共 ${result.totalLines} 行)\n\n` +
          `- **文件 ID**: \`${result.id}\`\n` +
          `- **MIME 类型**: \`${result.type}\`\n\n` +
          codeBlock +
          truncationNotice;

        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      }

      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `未知的工具名称: "${toolName}"。`,
          },
        ],
      };
    },
  };
};

export const initLibraryVirtualMcpServer = (): void => {
  registerVirtualMcpServer(createLibraryVirtualMcpServer());
};
