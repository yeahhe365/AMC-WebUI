import { describe, expect, it } from 'vitest';
import { runStandardToolLoop } from '@/features/standard-chat/standardToolLoop';
import type { ThirdPartyConnection } from '@/types';
import { createThirdPartyConnection } from '@/test/data/factories';
import { PROVIDER_TOOL_DECLARATIONS, createProviderTools } from './providerTools';

const STORED_KEY_CANARY = 'sk-LEAKCANARY-stored-0001';
const HEADER_CANARY = 'header-LEAKCANARY-0002';
const TYPED_KEY_CANARY = 'sk-LEAKCANARY-typed-0003';

const propertiesOf = (name: string): string[] =>
  Object.keys(
    PROVIDER_TOOL_DECLARATIONS.find((declaration) => declaration.name === name)?.parameters?.properties ?? {},
  );

describe('assistant secret containment', () => {
  it('never sends stored keys, header values or typed keys to the model', async () => {
    let connections: ThirdPartyConnection[] = [
      createThirdPartyConnection({
        id: 'c1',
        name: 'Existing',
        apiKey: STORED_KEY_CANARY,
        extraHeaders: { 'X-Token': HEADER_CANARY },
      }),
    ];

    const tools = createProviderTools({
      getConnections: () => connections,
      setConnections: (next) => {
        connections = next;
      },
      requestApiKey: async () => TYPED_KEY_CANARY,
    });

    const sentToModel: string[] = [];
    const runTurn = async (contents: unknown) => {
      sentToModel.push(JSON.stringify(contents));
      return sentToModel.length === 1
        ? {
            modelContent: { role: 'model' as const, parts: [] },
            parts: [],
            functionCalls: [
              { id: 'call-1', name: 'list_connections', args: {} },
              { id: 'call-2', name: 'create_connection', args: { templateId: 'deepseek' } },
            ],
          }
        : {
            modelContent: { role: 'model' as const, parts: [{ text: 'done' }] },
            parts: [{ text: 'done' }],
            functionCalls: [],
          };
    };

    const result = await runStandardToolLoop({
      initialContents: [{ role: 'user', parts: [{ text: '帮我配一个 DeepSeek' }] }],
      clientFunctions: tools,
      runTurn,
    });

    const everythingSentToModel = JSON.stringify({ sentToModel, toolMessages: result.toolMessages });
    expect(everythingSentToModel).not.toContain(STORED_KEY_CANARY);
    expect(everythingSentToModel).not.toContain(HEADER_CANARY);
    expect(everythingSentToModel).not.toContain(TYPED_KEY_CANARY);

    // The keys must still land in settings — otherwise this test would pass
    // simply because the handoff silently dropped them.
    expect(connections.find((connection) => connection.id === 'c1')?.apiKey).toBe(STORED_KEY_CANARY);
    expect(connections.find((connection) => connection.name === 'DeepSeek')?.apiKey).toBe(TYPED_KEY_CANARY);
  });

  it('exposes no apiKey parameter on the write tools', () => {
    expect(propertiesOf('create_connection')).not.toContain('apiKey');
    expect(propertiesOf('update_connection')).not.toContain('apiKey');
    expect(JSON.stringify(PROVIDER_TOOL_DECLARATIONS)).not.toContain(STORED_KEY_CANARY);
  });
});
