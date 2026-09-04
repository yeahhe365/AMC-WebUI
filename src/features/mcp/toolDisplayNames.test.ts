import { describe, expect, it } from 'vitest';
import { toMcpFunctionName } from './mcpToolNames';
import { rememberDiscoveredTools, resetToolDisplayRegistry, resolveToolDisplay } from './toolDisplayNames';

describe('toolDisplayNames', () => {
  it('resolves wire names back into readable server and tool titles', () => {
    resetToolDisplayRegistry();
    rememberDiscoveredTools({
      servers: [
        {
          serverId: 'filesystem',
          serverName: 'Filesystem',
          tools: [{ name: 'read_file', description: '' }],
        },
      ],
      errors: [],
    });

    const info = resolveToolDisplay(toMcpFunctionName('filesystem', 'read_file'));
    expect(info).toMatchObject({ serverId: 'filesystem', serverName: 'Filesystem', toolName: 'read_file' });
    expect(resolveToolDisplay('mcp_unknown_tool_00000000')).toBeUndefined();
  });

  it('clears the registry between sessions', () => {
    rememberDiscoveredTools({
      servers: [{ serverId: 's1', serverName: 'S1', tools: [{ name: 't1' }] }],
      errors: [],
    });
    resetToolDisplayRegistry();
    expect(resolveToolDisplay(toMcpFunctionName('s1', 't1'))).toBeUndefined();
  });
});
