import { AVAILABLE_THEMES } from '@/constants/themeRegistry';
import type { AppSettings } from '@/types';
import type { Theme, ThemeColors } from '@/types/theme';
import { buildLiveArtifactThemeVars } from '@/utils/live-artifacts/liveArtifactThemeTokens';

/** When the OS asks for more contrast, promote muted text toward higher ranks. */
const withPreferredContrast = (colors: ThemeColors, prefersMoreContrast: boolean): ThemeColors => {
  if (!prefersMoreContrast) return colors;
  return {
    ...colors,
    textTertiary: colors.textSecondary,
    textSecondary: colors.textPrimary,
    iconSettings: colors.textPrimary,
    iconAttach: colors.textPrimary,
    iconEdit: colors.textPrimary,
    iconHistory: colors.textPrimary,
    iconThought: colors.textSecondary,
  };
};

const generateThemeCssVariables = (colors: ThemeColors): string => {
  let css = ':root {\n';
  for (const [key, value] of Object.entries(colors)) {
    const cssVarName = `--theme-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    css += `  ${cssVarName}: ${value};\n`;
  }
  css += '}';
  return css;
};

/**
 * Live Artifact tokens used by model-authored artifacts and by the Live
 * Artifacts system prompt. Inside the sandboxed preview iframe these are injected
 * by buildPreviewThemeStyle (previewDocument.ts); here they are mirrored onto the
 * main document so artifacts that fall back to inline raw-HTML rendering (markdown
 * `allowHtml` path — e.g. "prose + HTML" or unrecognized fragments) still resolve
 * every color/background/border token instead of degrading to colorless HTML.
 *
 * Both channels wrap the same builder (liveArtifactThemeTokens.ts) so the mapping
 * cannot drift; each value is a literal color resolved from the current theme
 * (never a var() indirection that would re-introduce the gap).
 */
const buildLiveArtifactThemeVariables = (colors: ThemeColors): string => buildLiveArtifactThemeVars(colors);

const prefersMoreContrast = (doc: Document): boolean => {
  try {
    return Boolean(doc.defaultView?.matchMedia?.('(prefers-contrast: more)')?.matches);
  } catch {
    return false;
  }
};

export const applyThemeToDocument = (doc: Document, theme: Theme, settings: AppSettings) => {
  const themeVariablesStyleTag = doc.getElementById('theme-variables');
  if (themeVariablesStyleTag) {
    const colors = withPreferredContrast(theme.colors, prefersMoreContrast(doc));
    themeVariablesStyleTag.innerHTML = generateThemeCssVariables(colors);
  }

  const liveArtifactStyleTag = doc.getElementById('live-artifact-theme-variables');
  if (liveArtifactStyleTag) {
    const colors = withPreferredContrast(theme.colors, prefersMoreContrast(doc));
    liveArtifactStyleTag.innerHTML = `:root{${buildLiveArtifactThemeVariables(colors)}}`;
  }

  const bodyClassList = doc.body.classList;
  AVAILABLE_THEMES.forEach((themeOption) => bodyClassList.remove(`theme-${themeOption.id}`));
  bodyClassList.add(`theme-${theme.id}`, 'antialiased');
  // Tailwind's `dark:` variant is configured (main.css @custom-variant) to key
  // off this class so component-level dark styles follow the in-app theme
  // instead of the OS prefers-color-scheme.
  bodyClassList.toggle('dark', theme.isDark);

  // Reading size targets chat body text (messages set their own px). Chrome uses rem from html.
  doc.body.style.fontSize = `${settings.baseFontSize}px`;
};
