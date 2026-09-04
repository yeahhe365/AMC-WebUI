import { describe, expect, it } from 'vitest';
import { deriveDefaultFilename } from './deriveDefaultFilename';

describe('deriveDefaultFilename', () => {
  it('prefers the first markdown heading', () => {
    expect(deriveDefaultFilename('intro line\n\n# 季度报告\n\nbody')).toBe('季度报告');
  });

  it('falls back to the first non-empty line when no heading exists', () => {
    expect(deriveDefaultFilename('\n\n  hello world  \nsecond line')).toBe('hello world');
  });

  it('strips markdown links so a heading link does not become the filename', () => {
    expect(deriveDefaultFilename('# [Anthropic 自曝安全漏洞](https://linux.do/t/topic/2763210)\n\nbody')).toBe(
      'Anthropic 自曝安全漏洞',
    );
  });

  it('strips markdown emphasis and unsafe filename characters', () => {
    expect(deriveDefaultFilename('# **Bold** `code` title')).toBe('Bold code title');
    expect(deriveDefaultFilename('a/b:c?d*e')).toBe('abcde');
  });

  it('collapses repeated whitespace and caps the derived length', () => {
    expect(deriveDefaultFilename('# a   b\t\tc')).toBe('a b c');
    expect(deriveDefaultFilename('# ' + 'a'.repeat(80))).toHaveLength(60);
  });

  it('returns null for empty or blank-only content', () => {
    expect(deriveDefaultFilename('')).toBeNull();
    expect(deriveDefaultFilename(' \n\t \n')).toBeNull();
    expect(deriveDefaultFilename('# **`<>`**')).toBeNull();
  });
});
