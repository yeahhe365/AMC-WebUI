import { describe, expect, it, vi } from 'vitest';
import { createThirdPartyConnection } from '@/test/data/factories';
import type { ThirdPartyConnection } from '@/types';
import { createProviderVirtualMcpServer } from './providerVirtualMcpServer';

describe('providerVirtualMcpServer', () => {
  const createTestDeps = (initialConnections: ThirdPartyConnection[] = []) => {
    let connections = [...initialConnections];
    const requestApiKey = vi.fn().mockResolvedValue('sk-test-secret-123');
    return {
      deps: {
        getConnections: () => connections,
        setConnections: (next: ThirdPartyConnection[]) => {
          connections = next;
        },
        requestApiKey,
      },
      requestApiKey,
    };
  };

  it('declares id, name, and standard provider management tools', async () => {
    const { deps } = createTestDeps();
    const server = createProviderVirtualMcpServer(deps);

    expect(server.id).toBe('amc_provider_manager');
    const tools = await server.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain('list_templates');
    expect(toolNames).toContain('list_connections');
    expect(toolNames).toContain('create_connection');
    expect(toolNames).toContain('update_connection');
    expect(toolNames).toContain('delete_connection');
    expect(toolNames).toContain('test_connection');
  });

  it('lists templates without throwing', async () => {
    const { deps } = createTestDeps();
    const server = createProviderVirtualMcpServer(deps);

    const result = (await server.callTool('list_templates', {})) as { structuredContent?: { templates: unknown[] } };
    expect(result.structuredContent?.templates.length).toBeGreaterThan(0);
  });

  it('lists connections and redacts api keys to hasApiKey', async () => {
    const conn = createThirdPartyConnection({ id: 'c1', name: 'OpenRouter', apiKey: 'secret' });
    const { deps } = createTestDeps([conn]);
    const server = createProviderVirtualMcpServer(deps);

    const result = (await server.callTool('list_connections', {})) as {
      structuredContent?: { connections: Array<Record<string, unknown>> };
    };
    const c1 = result.structuredContent?.connections.find((c) => c.id === 'c1');
    expect(c1).toBeDefined();
    expect(c1?.hasApiKey).toBe(true);
    expect(c1?.apiKey).toBeUndefined();
  });

  it('creates a connection and requests api key via UI handoff when key is needed', async () => {
    const { deps, requestApiKey } = createTestDeps();
    const server = createProviderVirtualMcpServer(deps);

    const result = (await server.callTool('create_connection', {
      templateId: 'deepseek',
    })) as { structuredContent?: Record<string, unknown> };

    expect(requestApiKey).toHaveBeenCalled();
    expect(result.structuredContent?.status).toBe('key-configured');
    expect(deps.getConnections()[0].apiKey).toBe('sk-test-secret-123');
  });

  it('deletes a connection by connectionId', async () => {
    const conn = createThirdPartyConnection({ id: 'c1', name: 'OpenRouter' });
    const { deps } = createTestDeps([conn]);
    const server = createProviderVirtualMcpServer(deps);

    const result = (await server.callTool('delete_connection', { connectionId: 'c1' })) as {
      structuredContent?: Record<string, unknown>;
    };

    expect(result.structuredContent).toEqual({
      status: 'deleted',
      connectionId: 'c1',
      name: 'OpenRouter',
    });
    expect(deps.getConnections()).toHaveLength(0);
  });

  it('rejects delete_connection when connection does not exist', async () => {
    const { deps } = createTestDeps();
    const server = createProviderVirtualMcpServer(deps);

    const result = (await server.callTool('delete_connection', { connectionId: 'non-existent' })) as {
      structuredContent?: Record<string, unknown>;
    };

    expect(result.structuredContent?.status).toBe('rejected');
    expect(result.structuredContent?.error).toContain('Connection not found');
  });
});

