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

describe('assistant secret containment', () => {
  it('exposes no apiKey parameter on the write tools schema', () => {
    expect(propertiesOf('create_connection')).not.toContain('apiKey');
    expect(propertiesOf('update_connection')).not.toContain('apiKey');
    expect(propertiesOf('delete_connection')).not.toContain('apiKey');
    expect(JSON.stringify(PROVIDER_VIRTUAL_MCP_TOOLS)).not.toContain(STORED_KEY_CANARY);
  });

  it('never sends stored keys, header values or typed keys through providerVirtualMcpServer tools', async () => {
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

    const listResult = await server.callTool('list_connections', {});
    const createResult = await server.callTool('create_connection', { templateId: 'deepseek' });
    const deleteResult = await server.callTool('delete_connection', { connectionId: 'c1' });

    const everything = JSON.stringify({ listResult, createResult, deleteResult });
    expect(everything).not.toContain(STORED_KEY_CANARY);
    expect(everything).not.toContain(HEADER_CANARY);
    expect(everything).not.toContain(TYPED_KEY_CANARY);

    expect(connections.find((c) => c.name === 'DeepSeek')?.apiKey).toBe(TYPED_KEY_CANARY);
    expect(connections.find((c) => c.id === 'c1')).toBeUndefined();
  });
});
