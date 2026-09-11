import { describe, expect, it } from 'vitest';

import { extractSources, formatUrlPath, getDomain, insertCitations } from './groundingSources';
import { extractMapsPlaces, buildMapsEmbedUrl } from '@/utils/groundingMetadata';

describe('grounding source helpers', () => {
  it('extracts attribution sources from image grounding chunks', () => {
    const sources = extractSources({
      groundingChunks: [
        {
          image: {
            sourceUri: 'https://example.com/quetzal',
            imageUri: 'https://images.example.com/quetzal.jpg',
            title: 'Resplendent Quetzal',
            domain: 'example.com',
          },
        },
      ],
    });

    expect(sources).toEqual([
      {
        uri: 'https://example.com/quetzal',
        title: 'Resplendent Quetzal',
      },
    ]);
  });

  it('inserts citations for image grounding chunks using the attribution source uri', () => {
    const text = 'Grounded visual summary';
    const content = insertCitations(text, {
      groundingChunks: [
        {
          image: {
            sourceUri: 'https://example.com/quetzal',
            imageUri: 'https://images.example.com/quetzal.jpg',
            title: 'Resplendent Quetzal',
            domain: 'example.com',
          },
        },
      ],
      groundingSupports: [
        {
          segment: { endIndex: text.length },
          groundingChunkIndices: [0],
        },
      ],
    });

    expect(content).toContain('href="https://example.com/quetzal"');
    expect(content).toContain('[1]</a>');
  });

  it('formats url paths cleanly omitting www and trailing slash', () => {
    expect(getDomain('https://www.example.com/some/path')).toBe('example.com');
    expect(formatUrlPath('https://www.example.com/recipes/chicken/')).toBe('example.com/recipes/chicken');
    expect(formatUrlPath('https://github.com/google-gemini/cookbook')).toBe('github.com/google-gemini/cookbook');
    expect(formatUrlPath('https://www.wikipedia.org/')).toBe('wikipedia.org');
  });

  describe('maps grounding metadata helpers', () => {
    it('extracts maps places with title, uri, and chunkIndex', () => {
      const metadata = {
        groundingChunks: [
          {
            maps: {
              title: 'Louvre Museum',
              uri: 'https://maps.google.com/?cid=12345',
            },
          },
        ],
      };

      const places = extractMapsPlaces(metadata);
      expect(places).toHaveLength(1);
      expect(places[0]).toEqual({
        uri: 'https://maps.google.com/?cid=12345',
        title: 'Louvre Museum',
        chunkIndex: 0,
      });
    });

    it('extracts placeId, text, and reviewSnippets when provided by Gemini API', () => {
      const metadata = {
        groundingChunks: [
          {
            maps: {
              title: 'Blue Bottle Coffee',
              uri: 'https://maps.google.com/?cid=67890',
              placeId: 'places/ChIJxyz123',
              text: 'Popular specialty coffee shop with outdoor seating.',
              placeAnswerSources: {
                reviewSnippets: [
                  {
                    reviewId: 'rev_1',
                    googleMapsUri: 'https://maps.google.com/review/1',
                    title: 'Great outdoor seating and fast wifi!',
                  },
                  {
                    reviewId: 'rev_2',
                    googleMapsUri: 'https://maps.google.com/review/2',
                    title: 'Pet friendly patio in the back.',
                  },
                ],
              },
            },
          },
        ],
      };

      const places = extractMapsPlaces(metadata);
      expect(places).toHaveLength(1);
      expect(places[0].placeId).toBe('places/ChIJxyz123');
      expect(places[0].text).toBe('Popular specialty coffee shop with outdoor seating.');
      expect(places[0].reviewSnippets).toHaveLength(2);
      expect(places[0].reviewSnippets?.[0]).toEqual({
        reviewId: 'rev_1',
        googleMapsUri: 'https://maps.google.com/review/1',
        title: 'Great outdoor seating and fast wifi!',
      });
    });

    it('returns empty array when metadata is invalid or contains no maps chunks', () => {
      expect(extractMapsPlaces(null)).toEqual([]);
      expect(extractMapsPlaces({})).toEqual([]);
      expect(extractMapsPlaces({ groundingChunks: [{ web: { uri: 'https://example.com' } }] })).toEqual([]);
    });

    it('builds a proper maps embed URL', () => {
      const place = {
        uri: 'https://maps.google.com/?cid=123',
        title: 'Eiffel Tower',
        chunkIndex: 0,
      };
      expect(buildMapsEmbedUrl(place)).toBe('https://maps.google.com/maps?q=Eiffel%20Tower&z=15&output=embed');
    });
  });
});
