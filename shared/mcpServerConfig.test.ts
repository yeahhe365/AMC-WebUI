import { describe, it, expect } from 'vitest';
import { sanitizeMcpServers, sanitizeMcpTimeout } from './mcpServerConfig';

describe('sanitizeMcpServers trust fields', () => {
  it('preserves disabledAutoApproveTools', () => {
    const out = sanitizeMcpServers([
      {
        id: 'a',
        name: 'A',
        enabled: true,
        transport: 'http',
        url: 'https://x',
        disabledAutoApproveTools: ['t1'],
      } as any,
    ]);
    expect(out[0].disabledAutoApproveTools).toEqual(['t1']);
  });
  it('preserves isTrusted boolean', () => {
    const out = sanitizeMcpServers([
      { id: 'a', name: 'A', enabled: true, transport: 'http', url: 'https://x', isTrusted: true } as any,
    ]);
    expect(out[0].isTrusted).toBe(true);
  });
  it('drops non-boolean isTrusted', () => {
    const out = sanitizeMcpServers([
      { id: 'a', name: 'A', enabled: true, transport: 'http', url: 'https://x', isTrusted: 'yes' } as any,
    ]);
    expect(out[0].isTrusted).toBeUndefined();
  });
});

describe('sanitizeMcpServers disabledTools', () => {
  it('preserves disabledTools array of strings', () => {
    const out = sanitizeMcpServers([
      {
        id: 'a',
        name: 'A',
        enabled: true,
        transport: 'http',
        url: 'https://x',
        disabledTools: ['tool_a', 'tool_b'],
      } as any,
    ]);
    expect(out[0].disabledTools).toEqual(['tool_a', 'tool_b']);
  });
  it('drops non-string entries and empty arrays', () => {
    const out = sanitizeMcpServers([
      {
        id: 'a',
        name: 'A',
        enabled: true,
        transport: 'http',
        url: 'https://x',
        disabledTools: ['ok', 123, null],
      } as any,
    ]);
    expect(out[0].disabledTools).toEqual(['ok']);
  });
  it('undefined when not array', () => {
    const out = sanitizeMcpServers([
      { id: 'a', name: 'A', enabled: true, transport: 'http', url: 'https://x', disabledTools: 'bad' } as any,
    ]);
    expect(out[0].disabledTools).toBeUndefined();
  });
});

describe('sanitizeMcpTimeout', () => {
  it('keeps integer seconds within range', () => {
    expect(sanitizeMcpTimeout(60)).toBe(60);
    expect(sanitizeMcpTimeout(1)).toBe(1);
    expect(sanitizeMcpTimeout(3600)).toBe(3600);
  });
  it('drops non-integer, zero, negative and oversized values', () => {
    for (const bad of [0, -5, 1.5, '90', null, Number.POSITIVE_INFINITY, 3601]) {
      expect(sanitizeMcpTimeout(bad)).toBeUndefined();
    }
  });
});

describe('sanitizeMcpServers timeout / longRunning', () => {
  const base = { id: 'a', name: 'A', enabled: true, transport: 'http', url: 'https://x' } as any;
  it('preserves integer timeout and strict-boolean longRunning', () => {
    const out = sanitizeMcpServers([{ ...base, timeout: 120, longRunning: true }]);
    expect(out[0].timeout).toBe(120);
    expect(out[0].longRunning).toBe(true);
  });
  it('drops invalid timeout and non-boolean longRunning', () => {
    const out = sanitizeMcpServers([{ ...base, timeout: '120', longRunning: 'yes' }]);
    expect(out[0].timeout).toBeUndefined();
    expect(out[0].longRunning).toBeUndefined();
  });
});
