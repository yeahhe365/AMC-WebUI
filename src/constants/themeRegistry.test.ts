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
  it('registers all available themes including sepia', () => {
    expect(AVAILABLE_THEMES.map((theme) => theme.id)).toEqual(['onyx', 'graphite', 'pearl', 'sepia']);

    const graphite = AVAILABLE_THEMES.find((theme) => theme.id === 'graphite');
    expect(graphite?.name).toBe('Graphite (Gray)');
    expect(graphite?.colors.bgPrimary).toBe('#2b2b2e');
    expect(graphite?.colors.bgSecondary).toBe('#1f1f22');
    expect(graphite?.colors.textPrimary).toBe('#f2f2f4');

    const sepia = AVAILABLE_THEMES.find((theme) => theme.id === 'sepia');
    expect(sepia).toBeDefined();
    expect(sepia?.name).toBe('Sepia (Warm)');
    expect(sepia?.isDark).toBe(false);
    expect(sepia?.colors.bgPrimary).toBe('#fbf5ea');
    expect(sepia?.colors.textPrimary).toBe('#2c251f');
    expect(sepia?.colors.textSecondary).toBe('#685a4e');
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

  it('keeps the artifact muted surface a visible step away from the page canvas', () => {
    // `surface-muted` backs table headers, inline-code chips, progress tracks, and
    // neutral cards inside Live Artifacts. It used to reuse `bgInput`, which is
    // pure white in the light themes: every one of those fills rendered invisible
    // against a #fefefe / #fbf5ea message background.
    for (const theme of AVAILABLE_THEMES) {
      const surface = hexToRgb(theme.colors.bgSurfaceMuted);
      const canvas = hexToRgb(theme.colors.bgPrimary);
      const channelSteps = surface.map((channel, index) => Math.abs(channel - canvas[index]));

      expect(Math.min(...channelSteps), theme.id).toBeGreaterThanOrEqual(6);
    }
  });

  it('authors every semantic surface as a translucent tint', () => {
    // An opaque surface (#fef2f2 in the light themes) cannot be raised to
    // SEMANTIC_SURFACE_MIN_ALPHA, so the CSS tag, the composited Graphviz node
    // fill, and the PNG export each rendered it at a different strength — and the
    // cool pink clashed with the warm sepia canvas.
    for (const theme of AVAILABLE_THEMES) {
      for (const key of ['bgInfo', 'bgSuccess', 'bgWarning', 'bgErrorMessage'] as const) {
        const value = theme.colors[key];
        const match = /^rgba\(([^)]+)\)$/.exec(value);

        expect(match, `${theme.id}.${key} should be a translucent tint, got ${value}`).not.toBeNull();

        const alpha = Number(match![1].split(',')[3]?.trim());
        expect(alpha, `${theme.id}.${key}`).toBeGreaterThan(0);
        expect(alpha, `${theme.id}.${key}`).toBeLessThan(1);
      }
    }
  });

  it('fixes the light-theme surfaces that used to collapse into the page', () => {
    const pearl = AVAILABLE_THEMES.find((theme) => theme.id === 'pearl');
    const sepia = AVAILABLE_THEMES.find((theme) => theme.id === 'sepia');

    // Warm sepia gets a warm muted surface and a warm danger tint, not white.
    expect(pearl?.colors.bgSurfaceMuted).toBe('#f4f5f7');
    expect(sepia?.colors.bgSurfaceMuted).toBe('#f4ece0');
    expect(pearl?.colors.bgErrorMessage).toBe('rgba(220, 38, 38, 0.1)');
    expect(sepia?.colors.bgErrorMessage).toBe('rgba(185, 28, 28, 0.12)');
  });

  it('keeps onyx muted text readable on dark framing surfaces', () => {
    const onyx = AVAILABLE_THEMES.find((theme) => theme.id === 'onyx');
    expect(onyx).toBeDefined();
    expect(onyx!.colors.textSecondary).toBe('#a8a8b3');
    expect(onyx!.colors.textTertiary).toBe('#78787f');
    expect(onyx!.colors.textTertiary).not.toBe(onyx!.colors.textSecondary);
  });
});
