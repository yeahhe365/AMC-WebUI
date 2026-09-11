import { describe, expect, it } from 'vitest';
import {
  isLocalOrPrivateUrl,
  isSupportedProtocol,
  formatUrlDisplay,
  normalizeUrlCandidate,
  validateUrlItem,
  parseAndValidateUrlList,
  MAX_URL_CONTEXT_COUNT,
  MAX_URL_CONTENT_SIZE_MB,
} from './urlContext';

describe('urlContext utils', () => {
  it('defines official Gemini limits as constants', () => {
    expect(MAX_URL_CONTEXT_COUNT).toBe(20);
    expect(MAX_URL_CONTENT_SIZE_MB).toBe(34);
  });

  describe('isLocalOrPrivateUrl', () => {
    it('detects localhost hostnames', () => {
      expect(isLocalOrPrivateUrl('http://localhost:3000/api')).toBe(true);
      expect(isLocalOrPrivateUrl('https://my-app.localhost/test')).toBe(true);
      expect(isLocalOrPrivateUrl('http://dev.local/')).toBe(true);
    });

    it('detects IPv4 loopback and private ranges', () => {
      expect(isLocalOrPrivateUrl('http://127.0.0.1:8080')).toBe(true);
      expect(isLocalOrPrivateUrl('http://127.0.1.1')).toBe(true);
      expect(isLocalOrPrivateUrl('http://10.0.1.25')).toBe(true);
      expect(isLocalOrPrivateUrl('http://172.16.0.1')).toBe(true);
      expect(isLocalOrPrivateUrl('http://172.31.255.255')).toBe(true);
      expect(isLocalOrPrivateUrl('http://192.168.1.100')).toBe(true);
      expect(isLocalOrPrivateUrl('http://169.254.1.1')).toBe(true);
      expect(isLocalOrPrivateUrl('http://0.0.0.0')).toBe(true);
    });

    it('detects IPv6 loopback and link-local', () => {
      expect(isLocalOrPrivateUrl('http://[::1]:8000')).toBe(true);
      expect(isLocalOrPrivateUrl('http://[fe80::1ff:fe23:4567:890a]')).toBe(true);
    });

    it('detects tunneling domains', () => {
      expect(isLocalOrPrivateUrl('https://abc-123.ngrok.io')).toBe(true);
      expect(isLocalOrPrivateUrl('https://abc-123.ngrok-free.app')).toBe(true);
      expect(isLocalOrPrivateUrl('https://my-tunnel.pinggy.link')).toBe(true);
      expect(isLocalOrPrivateUrl('https://cool-app.loca.lt')).toBe(true);
    });

    it('allows legitimate public web URLs', () => {
      expect(isLocalOrPrivateUrl('https://ai.google.dev/gemini-api')).toBe(false);
      expect(isLocalOrPrivateUrl('https://github.com/google-gemini')).toBe(false);
      expect(isLocalOrPrivateUrl('https://en.wikipedia.org/wiki/Artificial_intelligence')).toBe(false);
    });
  });

  describe('isSupportedProtocol', () => {
    it('accepts http and https', () => {
      expect(isSupportedProtocol('http://example.com')).toBe(true);
      expect(isSupportedProtocol('https://example.com')).toBe(true);
    });

    it('rejects unsupported schemes', () => {
      expect(isSupportedProtocol('ftp://files.example.com')).toBe(false);
      expect(isSupportedProtocol('file:///path/to/file')).toBe(false);
      expect(isSupportedProtocol('javascript:alert(1)')).toBe(false);
    });
  });

  describe('formatUrlDisplay', () => {
    it('formats URL with hostname and clean pathname', () => {
      expect(formatUrlDisplay('https://www.example.com/docs/api/')).toBe('example.com/docs/api');
      expect(formatUrlDisplay('https://github.com/facebook/react')).toBe('github.com/facebook/react');
      expect(formatUrlDisplay('https://www.wikipedia.org/')).toBe('wikipedia.org');
    });

    it('retains query parameters', () => {
      expect(formatUrlDisplay('https://example.com/search?q=test')).toBe('example.com/search?q=test');
    });

    it('returns raw input on invalid URL', () => {
      expect(formatUrlDisplay('not a valid url')).toBe('not a valid url');
    });
  });

  describe('normalizeUrlCandidate', () => {
    it('adds https:// if protocol is missing', () => {
      expect(normalizeUrlCandidate('github.com/repo')).toBe('https://github.com/repo');
      expect(normalizeUrlCandidate('http://already.has.scheme')).toBe('http://already.has.scheme');
      expect(normalizeUrlCandidate('https://secure.example.com')).toBe('https://secure.example.com');
    });
  });

  describe('validateUrlItem', () => {
    it('validates public web URL correctly', () => {
      const result = validateUrlItem('https://ai.google.dev');
      expect(result.isValid).toBe(true);
      expect(result.domain).toBe('ai.google.dev');
      expect(result.warningType).toBeUndefined();
    });

    it('flags localhost and private networks', () => {
      const result = validateUrlItem('http://localhost:5173/test');
      expect(result.isValid).toBe(false);
      expect(result.isLocalOrPrivate).toBe(true);
      expect(result.warningType).toBe('localhost');
    });

    it('flags YouTube videos with suggestion warning', () => {
      const result = validateUrlItem('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.isValid).toBe(false);
      expect(result.isYoutube).toBe(true);
      expect(result.warningType).toBe('youtube');
    });

    it('flags invalid protocols', () => {
      const result = validateUrlItem('ftp://ftp.funet.fi/pub');
      expect(result.isValid).toBe(false);
      expect(result.warningType).toBe('invalid_protocol');
    });
  });

  describe('parseAndValidateUrlList', () => {
    it('parses and deduplicates multiline URLs', () => {
      const text = `
        https://example.com/page1
        https://example.com/page2
        https://example.com/page1
        http://localhost:3000
      `;
      const result = parseAndValidateUrlList(text);
      expect(result.totalCount).toBe(3); // page1 (deduped), page2, localhost
      expect(result.validUrls).toHaveLength(2);
      expect(result.validUrls).toEqual(['https://example.com/page1', 'https://example.com/page2']);
      expect(result.hasLimitWarning).toBe(false);
    });

    it('flags limit warning when exceeding 20 URLs', () => {
      const urls = Array.from({ length: 25 }, (_, i) => `https://example.com/item-${i}`).join('\n');
      const result = parseAndValidateUrlList(urls);
      expect(result.validUrls).toHaveLength(25);
      expect(result.hasLimitWarning).toBe(true);
    });
  });
});
