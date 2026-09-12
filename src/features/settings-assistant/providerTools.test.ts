import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThirdPartyConnection } from '@/types';
import { createThirdPartyConnection } from '@/test/data/factories';
import { PROVIDER_TOOL_DECLARATIONS, createProviderTools, type ProviderToolsDeps } from './providerTools';

const propertiesOf = (name: string): string[] =>
  Object.keys(
    PROVIDER_TOOL_DECLARATIONS.find((declaration) => declaration.name === name)?.parameters?.properties ?? {},
  );

const createDeps = (initial: ThirdPartyConnection[] = []) => {
  let connections = initial;
  const requestApiKey = vi.fn(async () => 'sk-from-card');
  const deps: ProviderToolsDeps = {
    getConnections: () => connections,
    setConnections: (next) => {
      connections = next;
    },
    requestApiKey,
  };
  return { deps, requestApiKey, current: () => connections };
};

describe('provider tool declarations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes exactly the four PR1 tools', () => {
    expect(PROVIDER_TOOL_DECLARATIONS.map((declaration) => declaration.name).sort()).toEqual([
      'create_connection',
      'list_connections',
      'list_templates',
      'update_connection',
    ]);
  });

  it('has no apiKey parameter on any write tool', () => {
    expect(propertiesOf('create_connection')).not.toContain('apiKey');
    expect(propertiesOf('update_connection')).not.toContain('apiKey');
  });
});

describe('createProviderTools', () => {
  it('lists templates without secrets', async () => {
    const { deps } = createDeps();
    const tools = createProviderTools(deps);
    const result = await tools.list_templates.handler({});

    expect(JSON.stringify(result.response)).toContain('deepseek');
  });

  it('lists connections with hasApiKey instead of the key', async () => {
    const { deps } = createDeps([createThirdPartyConnection({ id: 'c1', apiKey: 'sk-secret' })]);
    const tools = createProviderTools(deps);
    const result = await tools.list_connections.handler({});

    expect(result.response).toMatchObject({ connections: [{ id: 'c1', hasApiKey: true }] });
    expect(JSON.stringify(result.response)).not.toContain('sk-secret');
  });

  it('creates a connection and requests the key through the card', async () => {
    const { deps, requestApiKey, current } = createDeps();
    const tools = createProviderTools(deps);
    const result = await tools.create_connection.handler({ templateId: 'deepseek' });

    expect(requestApiKey).toHaveBeenCalledWith({ connectionId: expect.any(String), connectionName: 'DeepSeek' });
    expect(result.response).toMatchObject({ status: 'key-configured', name: 'DeepSeek' });
    expect(current()[0].apiKey).toBe('sk-from-card');
    expect(current()[0].baseUrl).toBe('https://api.deepseek.com');
  });

  it('skips the key request for auth-optional local engines', async () => {
    const { deps, requestApiKey } = createDeps();
    const tools = createProviderTools(deps);
    const result = await tools.create_connection.handler({ templateId: 'ollama' });

    expect(requestApiKey).not.toHaveBeenCalled();
    expect(result.response).toMatchObject({ status: 'created' });
  });

  it('reports aborted when the user dismisses the key card', async () => {
    const { deps } = createDeps();
    deps.requestApiKey = vi.fn(async () => null);
    const tools = createProviderTools(deps);
    const result = await tools.create_connection.handler({ templateId: 'deepseek' });

    expect(result.response).toMatchObject({ status: 'aborted' });
  });

  it('fails closed instead of overwriting when approval would be required', async () => {
    const existing = createThirdPartyConnection({
      id: 'c1',
      protocol: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
    });
    const { deps, current } = createDeps([existing]);
    const tools = createProviderTools(deps);
    const result = await tools.update_connection.handler({
      connectionId: 'c1',
      baseUrl: 'https://other.test/v1',
    });

    expect(result.response).toMatchObject({ status: 'approval-unavailable', reason: 'overwrite-baseUrl' });
    expect(current()[0].baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('applies a non-destructive update', async () => {
    const { deps, current } = createDeps([createThirdPartyConnection({ id: 'c1', name: 'Old' })]);
    const tools = createProviderTools(deps);
    const result = await tools.update_connection.handler({ connectionId: 'c1', name: 'New' });

    expect(result.response).toMatchObject({ status: 'updated', changed: ['name'] });
    expect(current()[0].name).toBe('New');
  });

  it('rejects malformed arguments without touching settings', async () => {
    const { deps, current } = createDeps();
    const tools = createProviderTools(deps);

    await expect(tools.create_connection.handler({ templateId: 'not-a-template' })).resolves.toMatchObject({
      response: { status: 'rejected' },
    });
    await expect(tools.update_connection.handler({})).resolves.toMatchObject({
      response: { status: 'rejected' },
    });
    expect(current()).toEqual([]);
  });
});
