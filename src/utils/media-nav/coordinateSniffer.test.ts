import { describe, expect, it } from 'vitest';
import { normalizeBoxCoordinates, normalizePointCoordinates } from './coordinateSniffer';

describe('coordinateSniffer', () => {
  describe('normalizeBoxCoordinates', () => {
    it('handles standard 0-1000 integer array', () => {
      expect(normalizeBoxCoordinates([120, 250, 480, 800])).toEqual([120, 250, 480, 800]);
    });

    it('handles string with bracketed integers', () => {
      expect(normalizeBoxCoordinates('[100, 200, 300, 400]')).toEqual([100, 200, 300, 400]);
    });

    it('handles comma-separated and space-separated string', () => {
      expect(normalizeBoxCoordinates('100 200 300 400')).toEqual([100, 200, 300, 400]);
      expect(normalizeBoxCoordinates('100, 200; 300, 400')).toEqual([100, 200, 300, 400]);
    });

    it('auto-sniffs 0.0 - 1.0 normalized floats and scales to 0-1000', () => {
      expect(normalizeBoxCoordinates([0.12, 0.25, 0.48, 0.8])).toEqual([120, 250, 480, 800]);
      expect(normalizeBoxCoordinates('0.15, 0.35, 0.75, 0.95')).toEqual([150, 350, 750, 950]);
      expect(normalizeBoxCoordinates('[0, 0, 1.0, 1.0]')).toEqual([0, 0, 1000, 1000]);
    });

    it('handles percentage values correctly', () => {
      expect(normalizeBoxCoordinates('15%, 25%, 65%, 85%')).toEqual([150, 250, 650, 850]);
      expect(normalizeBoxCoordinates('[10%, 20%, 30%, 40%]')).toEqual([100, 200, 300, 400]);
    });

    it('auto-corrects inverted coordinates (ymin > ymax or xmin > xmax)', () => {
      expect(normalizeBoxCoordinates([500, 800, 100, 200])).toEqual([100, 200, 500, 800]);
    });

    it('clamps values exceeding 1000 or below 0', () => {
      expect(normalizeBoxCoordinates([-50, 100, 1200, 900])).toEqual([0, 100, 1000, 900]);
    });

    it('returns null for invalid or incomplete coordinates', () => {
      expect(normalizeBoxCoordinates('')).toBeNull();
      expect(normalizeBoxCoordinates('100, 200, 300')).toBeNull();
      expect(normalizeBoxCoordinates('not-a-coordinate')).toBeNull();
      expect(normalizeBoxCoordinates([100, 200])).toBeNull();
    });
  });

  describe('normalizePointCoordinates', () => {
    it('handles standard 0-1000 point', () => {
      expect(normalizePointCoordinates([500, 650])).toEqual([500, 650]);
      expect(normalizePointCoordinates('500, 650')).toEqual([500, 650]);
    });

    it('auto-sniffs 0.0 - 1.0 point floats and scales to 0-1000', () => {
      expect(normalizePointCoordinates([0.25, 0.75])).toEqual([250, 750]);
      expect(normalizePointCoordinates('0.5, 0.8')).toEqual([500, 800]);
    });

    it('handles percentage point values', () => {
      expect(normalizePointCoordinates('50%, 60%')).toEqual([500, 600]);
    });

    it('clamps point coordinates to [0, 1000]', () => {
      expect(normalizePointCoordinates([-10, 1500])).toEqual([0, 1000]);
    });

    it('returns null for invalid inputs', () => {
      expect(normalizePointCoordinates('')).toBeNull();
      expect(normalizePointCoordinates('500')).toBeNull();
      expect(normalizePointCoordinates([500])).toBeNull();
    });
  });
});
