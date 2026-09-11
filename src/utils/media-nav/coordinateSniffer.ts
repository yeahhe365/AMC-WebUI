/**
 * Coordinate Auto-Sniffing and Normalization Utility
 *
 * Visual grounding models (e.g. Gemini, GPT-4o, Florence-2) produce varying coordinate formats:
 * - Standard 0-1000 integer coordinates: [ymin, xmin, ymax, xmax]
 * - 0.0 - 1.0 normalized floating point values
 * - Percentages (e.g. "15%, 25%, 45%, 65%")
 * - Delimited strings (e.g. "[100, 200, 300, 400]", "100 200; 300 400")
 * - Inverted coordinates (ymin > ymax)
 *
 * This module reliably sniffs and standardizes any such input into clean, clamped 0-1000 integer tuples.
 */

const parseNumericValues = (raw: string | number[]): number[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((val) => {
        if (typeof val === 'number') return Number.isFinite(val) ? val : null;
        if (typeof val === 'string') {
          const s = (val as string).trim();
          if (s.endsWith('%')) {
            const num = Number.parseFloat(s.slice(0, -1));
            return Number.isFinite(num) ? num * 10 : null;
          }
          const num = Number.parseFloat(s);
          return Number.isFinite(num) ? num : null;
        }
        return null;
      })
      .filter((v): v is number => v !== null);
  }

  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  if (!text) return [];

  // Match numbers and percentage values
  const tokens = text
    .replace(/[()[\]]/g, ' ')
    .split(/[,;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const numbers: number[] = [];
  for (const token of tokens) {
    if (token.endsWith('%')) {
      const parsed = Number.parseFloat(token.slice(0, -1));
      if (Number.isFinite(parsed)) {
        numbers.push(parsed * 10);
      }
    } else {
      const parsed = Number.parseFloat(token);
      if (Number.isFinite(parsed)) {
        numbers.push(parsed);
      }
    }
  }

  return numbers;
};

const clamp = (val: number, min = 0, max = 1000): number => Math.min(max, Math.max(min, Math.round(val)));

/**
 * Normalizes bounding box coordinates into [ymin, xmin, ymax, xmax] on a 0-1000 scale.
 */
export const normalizeBoxCoordinates = (
  raw: string | number[] | null | undefined,
): [number, number, number, number] | null => {
  if (raw === null || raw === undefined) return null;
  const numbers = parseNumericValues(raw);
  if (numbers.length < 4) return null;

  let [ymin, xmin, ymax, xmax] = numbers.slice(0, 4);

  // Sniff if all values are 0.0 - 1.0 floats (e.g. [0.12, 0.25, 0.48, 0.8])
  const maxVal = Math.max(ymin, xmin, ymax, xmax);
  if (maxVal <= 1.0 && maxVal > 0) {
    ymin *= 1000;
    xmin *= 1000;
    ymax *= 1000;
    xmax *= 1000;
  }

  // Auto-correct inverted coordinates
  const actualYmin = clamp(Math.min(ymin, ymax));
  const actualYmax = clamp(Math.max(ymin, ymax));
  const actualXmin = clamp(Math.min(xmin, xmax));
  const actualXmax = clamp(Math.max(xmin, xmax));

  return [actualYmin, actualXmin, actualYmax, actualXmax];
};

/**
 * Normalizes point coordinates into [y, x] on a 0-1000 scale.
 */
export const normalizePointCoordinates = (raw: string | number[] | null | undefined): [number, number] | null => {
  if (raw === null || raw === undefined) return null;
  const numbers = parseNumericValues(raw);
  if (numbers.length < 2) return null;

  let [y, x] = numbers.slice(0, 2);

  const maxVal = Math.max(y, x);
  if (maxVal <= 1.0 && maxVal > 0) {
    y *= 1000;
    x *= 1000;
  }

  return [clamp(y), clamp(x)];
};
