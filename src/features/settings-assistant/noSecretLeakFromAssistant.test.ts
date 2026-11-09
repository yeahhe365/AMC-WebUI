import { describe, expect, it } from 'vitest';
import type { ThirdPartyConnection } from '@/types';
import { createThirdPartyConnection } from '@/test/data/factories';
import { PROVIDER_VIRTUAL_MCP_TOOLS, createProviderVirtualMcpServer } from './providerVirtualMcpServer';

const STORED_KEY_CANARY = 'sk-LEAKCANARY-stored-0001';
const HEADER_CANARY = 'header-LEAKCANARY-0002';
const TYPED_KEY_CANARY = 'sk-LEAKCANARY-typed-0003';

const propertiesOf = (name: string): string[] => {
  const tool = PROVIDER_VIRTUAL_MCP_TOOLS.find((t) => t.name === name);
  const properties = (tool?.inputSchema?.properties ?? {}) as Record<string, unknown>;
  return Object.keys(properties);
};

describe('assistant secret and apiKey handling', () => {
  it('exposes apiKey parameter on write tools schemas while keeping delete schema clean', () => {
    expect(propertiesOf('create_connection')).toContain('apiKey');
    expect(propertiesOf('update_connection')).toContain('apiKey');
    expect(propertiesOf('delete_connection')).not.toContain('apiKey');
  });

  it('never hands a stored apiKey to the model while still accepting keys the user pastes', async () => {
    let connections: ThirdPartyConnection[] = [
      createThirdPartyConnection({
        id: 'c1',
        name: 'Existing',
        apiKey: STORED_KEY_CANARY,
        extraHeaders: { 'X-Token': HEADER_CANARY },
      }),
    ];

    const server = createProviderVirtualMcpServer({
      getConnections: () => connections,
      setConnections: (next) => {
        connections = next;
      },
      requestApiKey: async () => TYPED_KEY_CANARY,
    });

    const listResult = (await server.callTool('list_connections', {})) as {
      structuredContent?: { connections: Array<{ maskedApiKey: string | null }> };
    };
    const createResult = await server.callTool('create_connection', {
      templateId: 'deepseek',
      apiKey: 'sk-direct-key-test',
    });
    const deleteResult = await server.callTool('delete_connection', { connectionId: 'c1' });

    const everything = JSON.stringify({ listResult, createResult, deleteResult });
    // The stored key never reaches the model: only its mask does. Anything else
    // ships the user's credential to the model vendor on every turn.
    expect(everything).not.toContain(STORED_KEY_CANARY);
    expect(listResult.structuredContent?.connections[0].maskedApiKey).toMatch(/^sk-/);
    // Header values remain protected to prevent token leak
    expect(everything).not.toContain(HEADER_CANARY);

    // A key the user pasted is still writable — that path types the secret in,
    // it does not read a stored one back out.
    expect(connections.find((c) => c.name === 'DeepSeek')?.apiKey).toBe('sk-direct-key-test');

    expect(connections.find((c) => c.name === 'DeepSeek')?.apiKey).toBe('sk-direct-key-test');
    expect(connections.find((c) => c.id === 'c1')).toBeUndefined();
  });
});
