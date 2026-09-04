import { describe, expect, it } from 'vitest';
import { parseThirdPartyExtraHeadersHeader, sanitizeThirdPartyExtraHeaders } from './thirdPartyExtraHeaders';

describe('sanitizeThirdPartyExtraHeaders', () => {
  it('keeps the v1 allowlist and drops blocked or malformed names', () => {
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

  it('parses the proxy JSON header and ignores invalid JSON', () => {
    expect(parseThirdPartyExtraHeadersHeader('{"X-Title":"AMC","Cookie":"x"}')).toEqual({ 'X-Title': 'AMC' });
    expect(parseThirdPartyExtraHeadersHeader('not-json')).toEqual({});
  });
});
