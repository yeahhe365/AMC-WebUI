import { SEMANTIC_SURFACE_MIN_ALPHA } from '@/constants/themeRegistry';
import type { ThemeColors } from '@/types/theme';

/**
 * Apply the shared semantic-surface alpha floor to an rgba() token.
 *
 * Light themes author `bgSuccess`/`bgInfo`/… at alpha 0.06–0.12. Used as a tag
 * background behind darker text that is fine, but Graphviz has to composite the
 * same token into an opaque node fill and floors its alpha (see
 * `flattenGraphvizFill`). Raising the token here too keeps the CSS channel and
 * the Graphviz channel visually identical instead of a pale tag sitting next to
 * a saturated node. Values that are not parsed `rgba()` pass through untouched.
 */
const applySurfaceAlphaFloor = (color: string): string => {
  const match = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d.]+)\s*\)$/i.exec(color.trim());
  if (!match) {
    return color;
  }

  const alpha = Math.max(Number(match[4]), SEMANTIC_SURFACE_MIN_ALPHA);
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
};

/**
 * The `--amc-live-artifact-*` declarations consumed by model-authored artifacts
 * and by the Live Artifacts system prompt.
 *
 * SINGLE SOURCE OF TRUTH: two channels render artifacts — the sandboxed preview
 * iframe (`buildPreviewThemeStyle` in html-preview/previewDocument.ts) and the
 * host document used when an artifact falls back to inline raw-HTML rendering
 * (`themeDom.ts`). They were duplicated once and drifted (the host copy skipped
 * the semantic-surface alpha floor, so every tag tint differed between the two),
 * which is why the mapping lives here and each channel only wraps it.
 *
 * Semantic surfaces must stay translucent: an opaque value cannot be floored, so
 * the CSS tag, the composited Graphviz fill, and the PNG export would each pick a
 * different strength.
 */
export const buildLiveArtifactThemeVars = (colors: ThemeColors): string => {
  return [
    `--amc-live-artifact-text:${colors.textPrimary}`,
    `--amc-live-artifact-muted:${colors.textSecondary}`,
    `--amc-live-artifact-subtle:${colors.textTertiary}`,
    `--amc-live-artifact-surface:${colors.bgTertiary}`,
    `--amc-live-artifact-surface-muted:${colors.bgSurfaceMuted}`,
    `--amc-live-artifact-border:${colors.borderSecondary}`,
    `--amc-live-artifact-accent:${colors.textLink}`,
    `--amc-live-artifact-accent-surface:${applySurfaceAlphaFloor(colors.bgInfo)}`,
    `--amc-live-artifact-success:${colors.textSuccess}`,
    `--amc-live-artifact-success-surface:${applySurfaceAlphaFloor(colors.bgSuccess)}`,
    `--amc-live-artifact-danger:${colors.textDanger}`,
    `--amc-live-artifact-danger-surface:${applySurfaceAlphaFloor(colors.bgErrorMessage)}`,
    `--amc-live-artifact-warning:${colors.textWarning}`,
    `--amc-live-artifact-warning-surface:${applySurfaceAlphaFloor(colors.bgWarning)}`,
  ].join(';');
};
