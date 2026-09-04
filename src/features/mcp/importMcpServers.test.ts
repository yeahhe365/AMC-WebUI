import { describe, expect, it } from 'vitest';
import { dedupeServersById, normalizeImportedServer, parseImportJson, parseMcpShareParam } from './importMcpServers';

describe('normalizeImportedServer', () => {
  it('maps baseUrl and type aliases', () => {
    const server = normalizeImportedServer({ name: 'X', type: 'sse', baseUrl: 'https://a.example.com' })!;
    expect(server.transport).toBe('sse');
    expect(server.url).toBe('https://a.example.com');
  });

  it('returns null without url or command', () => {
    expect(normalizeImportedServer({ name: 'x' })).toBeNull();
  });

  it('fills name from fallback key for mcpServers maps', () => {
    const server = normalizeImportedServer({ command: 'npx', args: ['-y', 'pkg'] }, 'map-key')!;
    expect(server.name).toBe('map-key');
    expect(server.transport).toBe('stdio');
  });
});

describe('parseImportJson', () => {
  it('accepts the mcpServers object map form', () => {
    const servers = parseImportJson(
      JSON.stringify({ mcpServers: { remote: { url: 'https://r.example.com/mcp' }, local: { command: 'npx' } } }),
    );
    expect(servers.map((s) => s.name)).toEqual(['remote', 'local']);
  });

  it('strips comments before parsing', () => {
    const text = '// leading\n{ "mcpServers": { "a": { "url": "https://a.example.com" } } } /* trailing */';
    expect(parseImportJson(text)).toHaveLength(1);
  });

  it('throws coded errors for empty and unrecognized payloads', () => {
    expect(() => parseImportJson('   ')).toThrow('empty');
    expect(() => parseImportJson('{"foo":1}')).toThrow('unrecognized');
  });
});

describe('parseMcpShareParam', () => {
  it('decodes base64url of an mcpServers map into sanitized servers', () => {
    const payload = Buffer.from(JSON.stringify({ mcpServers: { shared: { url: 'https://s.example.com/mcp' } } }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const servers = parseMcpShareParam(payload);
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('shared');
    // Share installs always start disabled + untrusted.
    expect(servers[0].enabled).toBe(false);
    expect(servers[0].isTrusted).toBe(false);
  });

  it('returns an empty array for garbage input instead of throwing', () => {
    expect(parseMcpShareParam('!!!not-base64!!!')).toEqual([]);
    const bad = Buffer.from(JSON.stringify({ hello: 1 })).toString('base64');
    expect(parseMcpShareParam(bad)).toEqual([]);
  });
});

describe('dedupeServersById', () => {
  it('suffixes duplicate ids', () => {
    const existing = new Set(['dup']);
    const [first, second] = dedupeServersById(
      [
        { id: 'dup', name: 'A', enabled: true, transport: 'http', url: 'https://a' },
        { id: 'dup', name: 'B', enabled: true, transport: 'http', url: 'https://b' },
      ],
      existing,
    );
    expect(first.id).toBe('dup__2');
    expect(second.id).toBe('dup__3');
  });
});
