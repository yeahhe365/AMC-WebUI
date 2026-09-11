import { describe, expect, it } from 'vitest';
import {
  buildGeminiRequestPreviewUrl,
  DEFAULT_GEMINI_API_BASE_URL,
  normalizeGeminiApiBaseUrl,
  trimTrailingSlashes,
} from './apiProxyUrl';

describe('apiProxyUrl', () => {
  describe('trimTrailingSlashes', () => {
    it('strips trailing slashes from urls and paths', () => {
      expect(trimTrailingSlashes('https://api.example.com/')).toBe('https://api.example.com');
      expect(trimTrailingSlashes('https://api.example.com///')).toBe('https://api.example.com');
      expect(trimTrailingSlashes('/api/openai/')).toBe('/api/openai');
      expect(trimTrailingSlashes('https://api.example.com')).toBe('https://api.example.com');
    });

    it('trims whitespace and handles nullish inputs', () => {
      expect(trimTrailingSlashes('  https://api.example.com/  ')).toBe('https://api.example.com');
      expect(trimTrailingSlashes('')).toBe('');
      expect(trimTrailingSlashes(null)).toBe('');
      expect(trimTrailingSlashes(undefined)).toBe('');
    });
  });

  describe('normalizeGeminiApiBaseUrl', () => {
    it('strips version suffixes and trailing slashes', () => {
      expect(normalizeGeminiApiBaseUrl('https://generativelanguage.googleapis.com/v1beta')).toBe(
        DEFAULT_GEMINI_API_BASE_URL,
      );
      expect(normalizeGeminiApiBaseUrl('https://generativelanguage.googleapis.com/v1alpha/')).toBe(
        DEFAULT_GEMINI_API_BASE_URL,
      );
    });
  });

  describe('buildGeminiRequestPreviewUrl', () => {
    it('builds standard request preview url', () => {
      const url = buildGeminiRequestPreviewUrl(DEFAULT_GEMINI_API_BASE_URL, 'gemini-2.5-flash', 'generateContent');
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    });
  });
});
