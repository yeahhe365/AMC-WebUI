import type { McpServerConfig } from '@/types';
import type { McpServerCapabilities } from '@/services/api/mcpApi';

/**
 * Leaf module shared by McpSection and its card/tab children. Keeping pure
 * helpers and shared types here lets the component files stay acyclic.
 */

export const MCP_INPUT_BASE_CLASSES =
  'w-full rounded-lg border p-2.5 text-sm transition-all duration-200 focus:ring-2 focus:ring-offset-0';

export type CapabilityTestState =
  | { status: 'loading' }
  | { status: 'success'; capabilities: McpServerCapabilities }
  | { status: 'error'; error: string };

export const createMcpServer = (name: string): McpServerConfig => ({
  id: `mcp-${Date.now()}`,
  name,
  enabled: false,
  transport: 'stdio',
  command: '',
  args: [],
  env: {},
});

export const formatLines = (items: string[] | undefined): string => (items ?? []).join('\n');

export const parseLines = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export const formatRecord = (record: Record<string, string> | undefined): string =>
  Object.entries(record ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

export const parseRecord = (value: string): Record<string, string> => {
  const entries = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line): Array<[string, string]> => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        return [];
      }

      const key = line.slice(0, separatorIndex).trim();
      const recordValue = line.slice(separatorIndex + 1).trim();
      return key ? [[key, recordValue]] : [];
    });

  return Object.fromEntries(entries);
};
