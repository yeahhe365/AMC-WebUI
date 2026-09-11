import { describe, expect, it, vi, afterEach } from 'vitest';
import { formatLocationDisplay, isValidCoordinates, PRESET_LOCATIONS, requestBrowserLocation } from './geolocation';

describe('geolocation utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PRESET_LOCATIONS', () => {
    it('contains valid preset coordinates for all cities', () => {
      expect(PRESET_LOCATIONS.length).toBeGreaterThan(10);
      for (const preset of PRESET_LOCATIONS) {
        expect(isValidCoordinates(preset)).toBe(true);
        expect(preset.name.length).toBeGreaterThan(0);
      }
    });
  });

  describe('isValidCoordinates', () => {
    it('returns true for valid coordinates', () => {
      expect(isValidCoordinates({ latitude: 39.9042, longitude: 116.4074 })).toBe(true);
      expect(isValidCoordinates({ latitude: -90, longitude: -180 })).toBe(true);
      expect(isValidCoordinates({ latitude: 90, longitude: 180 })).toBe(true);
      expect(isValidCoordinates({ latitude: 0, longitude: 0 })).toBe(true);
    });

    it('returns false for invalid or out-of-range coordinates', () => {
      expect(isValidCoordinates(null)).toBe(false);
      expect(isValidCoordinates(undefined)).toBe(false);
      expect(isValidCoordinates({})).toBe(false);
      expect(isValidCoordinates({ latitude: '39.9', longitude: 116.4 })).toBe(false);
      expect(isValidCoordinates({ latitude: 91, longitude: 116.4 })).toBe(false);
      expect(isValidCoordinates({ latitude: -91, longitude: 116.4 })).toBe(false);
      expect(isValidCoordinates({ latitude: 39.9, longitude: 181 })).toBe(false);
      expect(isValidCoordinates({ latitude: 39.9, longitude: -181 })).toBe(false);
      expect(isValidCoordinates({ latitude: NaN, longitude: 116.4 })).toBe(false);
      expect(isValidCoordinates({ latitude: Infinity, longitude: 116.4 })).toBe(false);
    });
  });

  describe('formatLocationDisplay', () => {
    it('returns location name if provided', () => {
      expect(formatLocationDisplay({ latitude: 39.9, longitude: 116.4, name: '北京' })).toBe('北京');
      expect(formatLocationDisplay({ latitude: 39.9, longitude: 116.4, name: '  Home  ' })).toBe('Home');
    });

    it('returns formatted lat/lng string if name is not provided', () => {
      expect(formatLocationDisplay({ latitude: 39.9042, longitude: 116.4074 })).toBe('39.90, 116.41');
    });

    it('returns fallbackText for undefined or invalid location', () => {
      expect(formatLocationDisplay(undefined, 'Global')).toBe('Global');
      expect(formatLocationDisplay({ latitude: 100, longitude: 200 }, 'Global')).toBe('Global');
    });
  });

  describe('requestBrowserLocation', () => {
    it('resolves with rounded coordinates on success', async () => {
      const mockGetCurrentPosition = vi.fn().mockImplementation((success) => {
        success({
          coords: {
            latitude: 39.904212345,
            longitude: 116.407412345,
          },
        });
      });

      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: mockGetCurrentPosition,
        },
      });

      const result = await requestBrowserLocation();
      expect(result).toEqual({
        latitude: 39.904212,
        longitude: 116.407412,
        name: '当前位置',
      });
    });

    it('rejects on geolocation error', async () => {
      const mockError = new Error('User denied Geolocation');
      const mockGetCurrentPosition = vi.fn().mockImplementation((_, error) => {
        error(mockError);
      });

      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: mockGetCurrentPosition,
        },
      });

      await expect(requestBrowserLocation()).rejects.toThrow('User denied Geolocation');
    });
  });
});
