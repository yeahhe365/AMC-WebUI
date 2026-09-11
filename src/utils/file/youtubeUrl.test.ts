import { describe, expect, it } from 'vitest';
import { extractYoutubeVideoId, isYoutubeUrl, normalizeYoutubeUrl, toYoutubeEmbedUrl } from './youtubeUrl';

describe('youtubeUrl utils', () => {
  const TEST_VIDEO_ID = 'MkaZ4OrbQn8';
  const CANONICAL_URL = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;

  const validUrlVariations = [
    // The exact user URL from linux.do without protocol:
    'youtube.com/watch?v=MkaZ4OrbQn8&source_ve_path=OTY3MTQ&embeds_referring_euri=https%3A%2F%2Flinux.do%2F',
    // Standard URLs
    'https://www.youtube.com/watch?v=MkaZ4OrbQn8',
    'http://www.youtube.com/watch?v=MkaZ4OrbQn8',
    'https://youtube.com/watch?v=MkaZ4OrbQn8',
    'youtube.com/watch?v=MkaZ4OrbQn8',
    'www.youtube.com/watch?v=MkaZ4OrbQn8',
    // With extra params / reordered params
    'https://www.youtube.com/watch?feature=shared&v=MkaZ4OrbQn8&t=10s',
    'https://www.youtube.com/watch?v=MkaZ4OrbQn8&list=PL12345',
    // Short links
    'https://youtu.be/MkaZ4OrbQn8',
    'http://youtu.be/MkaZ4OrbQn8',
    'youtu.be/MkaZ4OrbQn8',
    'https://youtu.be/MkaZ4OrbQn8?t=45',
    // Shorts
    'https://www.youtube.com/shorts/MkaZ4OrbQn8',
    'https://youtube.com/shorts/MkaZ4OrbQn8?feature=share',
    // Embed and Live
    'https://www.youtube.com/embed/MkaZ4OrbQn8',
    'https://www.youtube.com/live/MkaZ4OrbQn8',
    // Mobile
    'https://m.youtube.com/watch?v=MkaZ4OrbQn8',
  ];

  describe('extractYoutubeVideoId', () => {
    it.each(validUrlVariations)('extracts video ID correctly from %s', (url) => {
      expect(extractYoutubeVideoId(url)).toBe(TEST_VIDEO_ID);
    });

    it('returns null for invalid or non-youtube URLs', () => {
      expect(extractYoutubeVideoId('')).toBeNull();
      expect(extractYoutubeVideoId(null)).toBeNull();
      expect(extractYoutubeVideoId(undefined)).toBeNull();
      expect(extractYoutubeVideoId('https://google.com')).toBeNull();
      expect(extractYoutubeVideoId('https://example.com/watch?v=MkaZ4OrbQn8')).toBeNull();
      expect(extractYoutubeVideoId('youtube.com/watch?v=tooShort')).toBeNull();
      expect(extractYoutubeVideoId('youtube.com/watch?v=tooLongTooLongTooLong')).toBeNull();
    });
  });

  describe('normalizeYoutubeUrl', () => {
    it.each(validUrlVariations)('normalizes %s to canonical watch URL', (url) => {
      expect(normalizeYoutubeUrl(url)).toBe(CANONICAL_URL);
    });

    it('returns null for invalid inputs', () => {
      expect(normalizeYoutubeUrl('not a url')).toBeNull();
      expect(normalizeYoutubeUrl('https://vimeo.com/12345678')).toBeNull();
    });
  });

  describe('isYoutubeUrl', () => {
    it.each(validUrlVariations)('identifies %s as a valid youtube url', (url) => {
      expect(isYoutubeUrl(url)).toBe(true);
    });

    it('identifies non-youtube inputs as false', () => {
      expect(isYoutubeUrl('hello world')).toBe(false);
      expect(isYoutubeUrl('https://github.com')).toBe(false);
    });
  });

  describe('toYoutubeEmbedUrl', () => {
    it.each(validUrlVariations)('converts %s to embed URL', (url) => {
      expect(toYoutubeEmbedUrl(url)).toBe(`https://www.youtube.com/embed/${TEST_VIDEO_ID}`);
    });

    it('returns null for invalid inputs', () => {
      expect(toYoutubeEmbedUrl('not a url')).toBeNull();
      expect(toYoutubeEmbedUrl(null)).toBeNull();
      expect(toYoutubeEmbedUrl(undefined)).toBeNull();
      expect(toYoutubeEmbedUrl('https://vimeo.com/12345678')).toBeNull();
    });
  });
});
