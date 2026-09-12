import { describe, expect, it } from 'vitest';
import { createThirdPartyConnection } from '@/test/data/factories';
import { findEndpointConflict, normalizeBaseUrlForCompare, planProviderPatch } from './providerPatch';

const connections = () => [
  createThirdPartyConnection({
    id: 'c1',
    name: 'OpenRouter',
    protocol: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1/',
    modelId: 'openai/gpt-4o',
    models: [{ id: 'openai/gpt-4o', name: 'GPT-4o' }],
  }),
];

describe('normalizeBaseUrlForCompare', () => {
  it('ignores trailing slashes, host case and default ports', () => {
    expect(normalizeBaseUrlForCompare('https://API.Example.com:443/v1/')).toBe('https://api.example.com/v1');
    expect(normalizeBaseUrlForCompare('  https://api.example.com/v1  ')).toBe('https://api.example.com/v1');
  });

  it('returns null for blank input', () => {
    expect(normalizeBaseUrlForCompare('   ')).toBeNull();
    expect(normalizeBaseUrlForCompare(null)).toBeNull();
  });
});

describe('findEndpointConflict', () => {
  it('matches the same protocol and normalized base URL', () => {
    expect(findEndpointConflict(connections(), 'openai-compatible', 'https://openrouter.ai/api/v1')?.id).toBe('c1');
  });

  it('does not match a different protocol on the same host', () => {
    expect(findEndpointConflict(connections(), 'anthropic', 'https://openrouter.ai/api/v1')).toBeUndefined();
  });
});

describe('planProviderPatch create', () => {
  it('creates from a template with template defaults', () => {
    const verdict = planProviderPatch({ op: 'create', templateId: 'deepseek' }, []);
    expect(verdict.kind).toBe('apply');
    if (verdict.kind !== 'apply') return;
    expect(verdict.nextConnections).toHaveLength(1);
    expect(verdict.nextConnections[0].baseUrl).toBe('https://api.deepseek.com');
    expect(verdict.changed).toContain('created');
  });

  it('auto-numbers a duplicate name instead of asking for approval', () => {
    const verdict = planProviderPatch({ op: 'create', templateId: 'deepseek', name: 'OpenRouter' }, connections());
    expect(verdict.kind).toBe('apply');
    if (verdict.kind !== 'apply') return;
    expect(verdict.nextConnections.map((c) => c.name)).toEqual(['OpenRouter', 'OpenRouter 2']);
  });

  it('requires approval when the endpoint already exists', () => {
    const verdict = planProviderPatch(
      { op: 'create', templateId: 'custom-openai', baseUrl: 'https://openrouter.ai/api/v1' },
      connections(),
    );
    expect(verdict.kind).toBe('needs-approval');
    if (verdict.kind !== 'needs-approval') return;
    expect(verdict.reason).toBe('endpoint-exists');
    expect(verdict.connectionId).toBe('c1');
  });

  it('rejects an unknown template', () => {
    const verdict = planProviderPatch({ op: 'create', templateId: 'nope' as never }, []);
    expect(verdict).toEqual({ kind: 'rejected', error: 'Unknown template: nope' });
  });
});

describe('planProviderPatch update', () => {
  it('fills an empty base URL without approval', () => {
    const target = [createThirdPartyConnection({ id: 'c1', baseUrl: null })];
    const verdict = planProviderPatch(
      { op: 'update', connectionId: 'c1', set: { baseUrl: 'https://x.test/v1' } },
      target,
    );
    expect(verdict.kind).toBe('apply');
    if (verdict.kind !== 'apply') return;
    expect(verdict.changed).toContain('baseUrl');
    expect(verdict.nextConnections[0].baseUrl).toBe('https://x.test/v1');
  });

  it('requires approval when overwriting an existing base URL', () => {
    const verdict = planProviderPatch(
      { op: 'update', connectionId: 'c1', set: { baseUrl: 'https://other.test/v1' } },
      connections(),
    );
    expect(verdict.kind).toBe('needs-approval');
    if (verdict.kind !== 'needs-approval') return;
    expect(verdict.reason).toBe('overwrite-baseUrl');
    expect(verdict.diff).toEqual([
      { field: 'baseUrl', before: 'https://openrouter.ai/api/v1/', after: 'https://other.test/v1' },
    ]);
  });

  it('treats a name or enabled change as non-destructive', () => {
    const verdict = planProviderPatch(
      { op: 'update', connectionId: 'c1', set: { name: 'Router', enabled: false } },
      connections(),
    );
    expect(verdict.kind).toBe('apply');
    if (verdict.kind !== 'apply') return;
    expect(verdict.changed).toEqual(['name', 'enabled']);
  });

  it('requires approval when clearing an existing base URL with null', () => {
    const verdict = planProviderPatch({ op: 'update', connectionId: 'c1', set: { baseUrl: null } }, connections());
    expect(verdict.kind).toBe('needs-approval');
    if (verdict.kind !== 'needs-approval') return;
    expect(verdict.reason).toBe('clear-baseUrl');
  });

  it('reports a normalized no-op instead of writing', () => {
    const verdict = planProviderPatch(
      { op: 'update', connectionId: 'c1', set: { baseUrl: 'https://openrouter.ai/api/v1' } },
      connections(),
    );
    expect(verdict.kind).toBe('apply');
    if (verdict.kind !== 'apply') return;
    expect(verdict.changed).toEqual([]);
  });

  it('appends models without approval and replaces only with approval', () => {
    const append = planProviderPatch(
      { op: 'update', connectionId: 'c1', addModels: [{ id: 'new/model', name: 'New' }] },
      connections(),
    );
    expect(append.kind).toBe('apply');
    if (append.kind === 'apply') expect(append.nextConnections[0].models.map((m) => m.id)).toContain('new/model');

    const replace = planProviderPatch(
      { op: 'update', connectionId: 'c1', replaceModels: [{ id: 'only/one', name: 'Only' }] },
      connections(),
    );
    expect(replace.kind).toBe('needs-approval');
    if (replace.kind === 'needs-approval') expect(replace.reason).toBe('replace-models');
  });

  it('rejects an unknown connection id', () => {
    const verdict = planProviderPatch({ op: 'update', connectionId: 'missing', set: { name: 'x' } }, connections());
    expect(verdict).toEqual({ kind: 'rejected', error: 'Connection not found: missing' });
  });
});

describe('planProviderPatch delete', () => {
  it('always requires approval and carries the next state without the connection', () => {
    const verdict = planProviderPatch({ op: 'delete', connectionId: 'c1' }, connections());
    expect(verdict.kind).toBe('needs-approval');
    if (verdict.kind !== 'needs-approval') return;
    expect(verdict.reason).toBe('delete-connection');
    expect(verdict.nextConnections).toEqual([]);
  });
});
