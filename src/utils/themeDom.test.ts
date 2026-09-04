import { afterEach, describe, expect, it } from 'vitest';
import { AVAILABLE_THEMES } from '@/constants/themeRegistry';
import type { AppSettings } from '@/types';
import { applyThemeToDocument } from './themeDom';

const baseSettings: AppSettings = {
  baseFontSize: 16,
} as AppSettings;

describe('applyThemeToDocument', () => {
  afterEach(() => {
    document.head.querySelectorAll('style').forEach((style) => style.remove());
    document.body.classList.remove('antialiased');
    AVAILABLE_THEMES.forEach((theme) => document.body.classList.remove(`theme-${theme.id}`));
    document.body.classList.remove('dark');
    document.body.style.removeProperty('font-size');
  });

  const getTheme = (themeId: string) => {
    const theme = AVAILABLE_THEMES.find((option) => option.id === themeId);
    if (!theme) throw new Error(`Unknown theme ${themeId}`);
    return theme;
  };

  it('writes the theme CSS variables into the existing theme-variables tag', () => {
    const tag = document.createElement('style');
    tag.id = 'theme-variables';
    document.head.appendChild(tag);

    applyThemeToDocument(document, getTheme('onyx'), baseSettings);

    expect(tag.textContent).toContain('--theme-bg-primary: #0c0c0e');
  });

  it('injects Live Artifact theme tokens on the main page so inline raw-HTML artifacts resolve colors', () => {
    const tag = document.createElement('style');
    tag.id = 'live-artifact-theme-variables';
    document.head.appendChild(tag);

    applyThemeToDocument(document, getTheme('onyx'), baseSettings);

    expect(tag.textContent).toContain(':root{');
    expect(tag.textContent).toContain('--amc-live-artifact-text:#f5f5f7');
    expect(tag.textContent).toContain('--amc-live-artifact-surface:#1c1c20');
    expect(tag.textContent).toContain('--amc-live-artifact-border:#2c2c34');
    expect(tag.textContent).toContain('--amc-live-artifact-accent:#6ba3fc');
    // Soft tint, not a solid fill — matches the iframe's buildPreviewThemeStyle.
    expect(tag.textContent).toContain('--amc-live-artifact-accent-surface:rgba(30, 58, 138, 0.25)');
  });

  it('maps the pearl (light) theme to light Live Artifact tokens', () => {
    const tag = document.createElement('style');
    tag.id = 'live-artifact-theme-variables';
    document.head.appendChild(tag);

    applyThemeToDocument(document, getTheme('pearl'), baseSettings);

    expect(tag.textContent).toContain('--amc-live-artifact-text:');
    expect(tag.textContent).toContain('--amc-live-artifact-accent:#2563eb');
  });

  it('sets the body theme classes and base font size', () => {
    applyThemeToDocument(document, getTheme('pearl'), { ...baseSettings, baseFontSize: 18 });

    expect(document.body.classList.contains('theme-pearl')).toBe(true);
    expect(document.body.style.fontSize).toBe('18px');
  });

  it('toggles the dark class with the theme so dark: variants follow the in-app theme', () => {
    applyThemeToDocument(document, getTheme('onyx'), baseSettings);
    expect(document.body.classList.contains('dark')).toBe(true);

    applyThemeToDocument(document, getTheme('graphite'), baseSettings);
    expect(document.body.classList.contains('dark')).toBe(true);

    applyThemeToDocument(document, getTheme('pearl'), baseSettings);
    expect(document.body.classList.contains('dark')).toBe(false);
  });
});
