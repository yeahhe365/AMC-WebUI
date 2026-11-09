import { registerVirtualMcpServer, type VirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';
import type { McpToolDefinition } from '@/services/api/mcpApi';
import { asTrimmedString, isRecord } from '../../../shared/predicates';
import {
  getChatDetail,
  searchChatHistory,
  type ChatMemorySearchDeps,
  type ChatMemorySearchResult,
} from './chatMemorySearch';

export const CHAT_MEMORY_VIRTUAL_MCP_ID = 'amc_chat_memory';

export const CHAT_MEMORY_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'search_chat_history',
    description:
      'Search past conversation history and long-term memory stored locally in browser IndexedDB. Use this tool whenever the user asks about previous conversations, past topics, solutions, commands, code, or decisions from earlier chats. Returns a list of matching sessions with session IDs, titles, timestamps, and matching snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keywords or phrases to search across session titles and message contents.',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum number of matching sessions to return (default 5, max 10).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_chat_detail',
    description:
      'Retrieve recent message history and dialogue details from a specific previous chat session using its sessionId (obtained from search_chat_history). Use this to read the full context, code snippets, or solutions discussed in that past session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The target session ID to retrieve (e.g. chat-xxxx).',
        },
        maxMessages: {
          type: 'number',
          description: 'Optional maximum number of recent messages to return (default 10, max 30).',
        },
      },
      required: ['sessionId'],
    },
  },
];

export interface ChatMemoryVirtualMcpDeps {
  searchChatHistory?: (
    query: string,
    options?: { limit?: number; excludeSessionId?: string },
    deps?: ChatMemorySearchDeps,
  ) => Promise<ChatMemorySearchResult[]>;
  getChatDetail?: (
    sessionId: string,
    options?: { maxMessages?: number },
    deps?: ChatMemorySearchDeps,
  ) => Promise<{ found: boolean; text: string }>;
}

export const createChatMemoryVirtualMcpServer = (deps: ChatMemoryVirtualMcpDeps = {}): VirtualMcpServer => {
  return {
    id: CHAT_MEMORY_VIRTUAL_MCP_ID,
    name: 'Chat History & Long-Term Memory',
    description: 'Search past conversations and long-term memory records stored locally in browser IndexedDB.',
    // Read-only over the user's own local history.
    autoApproveTools: ['search_chat_history', 'get_chat_detail'],
    listTools: async () => CHAT_MEMORY_MCP_TOOLS,
    callTool: async (toolName, args) => {
      if (toolName === 'search_chat_history') {
        const rawQuery = isRecord(args) ? (args.query ?? args.keyword ?? args.q) : (args as unknown);
        const query = asTrimmedString(rawQuery);

        if (!query) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'search_chat_history requires a non-empty "query" string parameter.',
              },
            ],
          };
        }

        const limit =
          isRecord(args) && typeof args.limit === 'number' && Number.isFinite(args.limit) ? args.limit : undefined;

        const searcher = deps.searchChatHistory ?? searchChatHistory;
        const results = await searcher(query, { limit });

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `未找到与 "${query}" 相关的历史会话记录。建议尝试更简短或不同的关键词。`,
              },
            ],
          };
        }

        const lines: string[] = [`找到 ${results.length} 个与 "${query}" 相关的历史会话：`, ''];

        for (let index = 0; index < results.length; index++) {
          const item = results[index];
          lines.push(
            `### ${index + 1}. ${item.title} (ID: \`${item.sessionId}\`)`,
            `- **更新时间**: ${item.updatedAt} | **总消息数**: ${item.messageCount}`,
            `- **匹配片段**:`,
            `  > ${item.snippet.replace(/\n/g, '\n  > ')}`,
            '',
          );
        }

        lines.push('💡 若需要调阅某个会话的详细对话，可调用 `get_chat_detail` 并传入对应的 `sessionId`。');

        return {
          content: [
            {
              type: 'text',
              text: lines.join('\n').trim(),
            },
          ],
        };
      }

      if (toolName === 'get_chat_detail') {
        const rawId = isRecord(args) ? (args.sessionId ?? args.session_id ?? args.id) : (args as unknown);
        const sessionId = asTrimmedString(rawId);

        if (!sessionId) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'get_chat_detail requires a non-empty "sessionId" string parameter.',
              },
            ],
          };
        }

        const maxMessages =
          isRecord(args) && typeof args.maxMessages === 'number' && Number.isFinite(args.maxMessages)
            ? args.maxMessages
            : undefined;

        const fetcher = deps.getChatDetail ?? getChatDetail;
        const detailResult = await fetcher(sessionId, { maxMessages });

        if (!detailResult.found) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: detailResult.text,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: detailResult.text,
            },
          ],
        };
      }

      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
      };
    },
  };
};

export const initChatMemoryVirtualMcpServer = (): (() => void) => {
  const server = createChatMemoryVirtualMcpServer();
  return registerVirtualMcpServer(server);
};
