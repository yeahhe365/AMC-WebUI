import { describe, expect, it } from 'vitest';
import {
  isForwardedThirdPartyExtraHeader,
  parseThirdPartyExtraHeadersHeader,
  sanitizeThirdPartyExtraHeaders,
} from './thirdPartyExtraHeaders';

describe('sanitizeThirdPartyExtraHeaders', () => {
  it('keeps the allowlist and drops blocked or malformed names', () => {
    expect(
      sanitizeThirdPartyExtraHeaders({
        'HTTP-Referer': 'https://example.com',
        Referer: 'https://example.com/app',
        'X-Title': 'AMC',
        'x-openrouter-title': 'AMC',
        'X-Custom': 'ok',
        Cookie: 'secret',
        Authorization: 'Bearer x',
        'x-api-key': 'sk',
        'x-third-party-provider': 'openai',
        Host: 'evil.example',
        'bad name': 'no',
        empty: '   ',
        skip: 1,
      }),
    ).toEqual({
      'HTTP-Referer': 'https://example.com',
      Referer: 'https://example.com/app',
      'X-Title': 'AMC',
      'x-openrouter-title': 'AMC',
      'X-Custom': 'ok',
    });
  });

  it('forwards User-Agent, matching the presets offered by the settings UI', () => {
    // The connection editor offers a User-Agent preset. It must survive the
    // allowlist, otherwise the preset silently does nothing.
    expect(sanitizeThirdPartyExtraHeaders({ 'User-Agent': 'AMC-WebUI/1.0' })).toEqual({
      'User-Agent': 'AMC-WebUI/1.0',
    });
  });

  it('still drops non-x names outside the allowlist', () => {
    expect(
      sanitizeThirdPartyExtraHeaders({
        Accept: 'application/json',
        'User-Agent': 'AMC-WebUI/1.0',
        'Cache-Control': 'no-cache',
      }),
    ).toEqual({ 'User-Agent': 'AMC-WebUI/1.0' });
  });

  it('parses the proxy JSON header and ignores invalid JSON', () => {
    expect(parseThirdPartyExtraHeadersHeader('{"X-Title":"AMC","Cookie":"x"}')).toEqual({ 'X-Title': 'AMC' });
    expect(parseThirdPartyExtraHeadersHeader('not-json')).toEqual({});
  });
});

describe('isForwardedThirdPartyExtraHeader', () => {
  it('agrees with sanitizeThirdPartyExtraHeaders for every name', () => {
    const names = [
      'X-Title',
      'x-custom',
      'User-Agent',
      'user-agent',
      'HTTP-Referer',
      'Referer',
      'x-openrouter-title',
      'Authorization',
      'Cookie',
      'Host',
      'x-api-key',
      'Content-Type',
      'x-third-party-provider',
      'Accept',
      'bad name',
      '',
    ];

    for (const name of names) {
      const sanitized = sanitizeThirdPartyExtraHeaders({ [name]: 'v' });
      expect(isForwardedThirdPartyExtraHeader(name)).toBe(Object.keys(sanitized).length > 0);
    }
  });
});
