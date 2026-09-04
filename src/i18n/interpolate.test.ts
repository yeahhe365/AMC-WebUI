import { describe, expect, it } from 'vitest';
import { formatI18nErrorMessage, interpolate } from './interpolate';

describe('interpolate', () => {
  it('substitutes every named placeholder', () => {
    expect(interpolate('{count} results in {tab}', { count: 3, tab: 'Models' })).toBe('3 results in Models');
  });

  it('supports repeated placeholders and numeric values', () => {
    expect(interpolate('{index} of {index}', { index: 2 })).toBe('2 of 2');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('keep {name}', { other: 1 })).toBe('keep {name}');
  });

  it('does not touch braces that are not word placeholders (e.g. inline CSS)', () => {
    expect(interpolate('style { color: red } stays', { color: 'blue' })).toBe('style { color: red } stays');
  });
});

describe('formatI18nErrorMessage', () => {
  it('interpolates the extracted error message into the template', () => {
    const t = (key: 'failed') => (key === 'failed' ? 'Import failed: {message}' : key);

    expect(formatI18nErrorMessage(t, 'failed', new Error('boom'))).toBe('Import failed: boom');
  });

  it('stringifies non-Error throwables', () => {
    const t = (_key: 'failed') => 'Failed: {message}';

    expect(formatI18nErrorMessage(t, 'failed', 'plain string')).toBe('Failed: plain string');
  });
});
