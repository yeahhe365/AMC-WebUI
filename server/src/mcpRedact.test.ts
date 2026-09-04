// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { redactSensitiveText } from './mcpRedact';

describe('redactSensitiveText', () => {
  it('masks bearer tokens', () => {
    expect(redactSensitiveText('auth failed for Bearer abc.def.ghi token')).toBe('auth failed for Bearer *** token');
  });

  it('masks openai-style keys', () => {
    expect(redactSensitiveText('bad key sk-abcdefghijklmnop123456')).toBe('bad key ***');
  });

  it('masks api key / token query params', () => {
    expect(redactSensitiveText('https://x?apiKey=secret123&ok=1')).toBe('https://x?apiKey=***&ok=1');
    expect(redactSensitiveText('token=tiny')).toBe('token=***');
  });

  it('leaves ordinary log lines untouched', () => {
    const line = 'Listed 12 tools from filesystem server';
    expect(redactSensitiveText(line)).toBe(line);
  });
});
