import { describe, expect, it } from 'vitest';
import { AVAILABLE_THEMES } from './themeRegistry';

const hexToRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

// Graphite framing surfaces stay near-gray (small RGB channel spread), not blue-gray.
const expectNearNeutralGray = (hex: string, maxSpread = 4) => {
  const [red, green, blue] = hexToRgb(hex);
  expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThanOrEqual(maxSpread);
};

describe('themeRegistry', () => {
  it('registers the graphite theme between dark and light', () => {
    expect(AVAILABLE_THEMES.map((theme) => theme.id)).toEqual(['onyx', 'graphite', 'pearl']);

    const graphite = AVAILABLE_THEMES.find((theme) => theme.id === 'graphite');

    expect(graphite?.name).toBe('Graphite (Gray)');
    expect(graphite?.colors.bgPrimary).toBe('#2b2b2e');
    expect(graphite?.colors.bgSecondary).toBe('#1f1f22');
    expect(graphite?.colors.textPrimary).toBe('#f2f2f4');
  });

  it('provides a strong warning surface for solid warning buttons in every theme', () => {
    for (const theme of AVAILABLE_THEMES) {
      expect(theme.colors.bgWarningStrong, theme.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.colors.bgWarningStrongHover, theme.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('keeps graphite core surfaces near-neutral gray instead of blue gray', () => {
    const graphite = AVAILABLE_THEMES.find((theme) => theme.id === 'graphite');

    expect(graphite).toBeDefined();

    // Core framing surfaces only (borders/text may carry a slightly cooler tint).
    [
      graphite!.colors.bgPrimary,
      graphite!.colors.bgSecondary,
      graphite!.colors.bgTertiary,
      graphite!.colors.bgInput,
      graphite!.colors.bgUserMessage,
    ].forEach((hex) => expectNearNeutralGray(hex));
  });

  it('restores pearl text hierarchy and theme-aware selection tokens', () => {
    const pearl = AVAILABLE_THEMES.find((theme) => theme.id === 'pearl');
    const onyx = AVAILABLE_THEMES.find((theme) => theme.id === 'onyx');

    expect(pearl).toBeDefined();
    expect(onyx).toBeDefined();
    expect(pearl!.colors.textPrimary).not.toBe(pearl!.colors.textSecondary);
    expect(pearl!.colors.textSecondary).not.toBe(pearl!.colors.textTertiary);
    expect(pearl!.colors.textPrimary).toBe('#1a1a1f');
    expect(pearl!.colors.textSecondary).toBe('#4a4a55');
    expect(pearl!.colors.textTertiary).toBe('#75757f');
    expect(pearl!.colors.selectionBg).toBeTruthy();
    expect(onyx!.colors.selectionBg).toBe('rgba(79, 124, 245, 0.35)');
  });

  it('keeps onyx muted text readable on dark framing surfaces', () => {
    const onyx = AVAILABLE_THEMES.find((theme) => theme.id === 'onyx');
    expect(onyx).toBeDefined();
    expect(onyx!.colors.textSecondary).toBe('#a8a8b3');
    expect(onyx!.colors.textTertiary).toBe('#78787f');
    expect(onyx!.colors.textTertiary).not.toBe(onyx!.colors.textSecondary);
  });
});
