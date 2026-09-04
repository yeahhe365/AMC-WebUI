import { FOCUS_VISIBLE_RING_BASE_CLASS, FOCUS_VISIBLE_RING_INSET_CLASS } from './focusClasses';

/**
 * Shared visual scale for AMC UI surfaces.
 * Prefer these over ad-hoc radius / chip classes so composer, sidebar, and chips stay aligned.
 */

const RADIUS_CLASS = {
  /** 6px — dense controls, inline badges */
  sm: 'rounded-md',
  /** 8–10px — list rows, menus, session items */
  md: 'rounded-lg',
  /** 12px — cards, header icon buttons */
  lg: 'rounded-xl',
  /** 16px — message bubbles, large cards */
  xl: 'rounded-2xl',
  /** 20px — chat composer shell (CherryStudio) */
  pill: 'rounded-[20px]',
  full: 'rounded-full',
} as const;

/** Composer outer shell (non-fullscreen). */
export const COMPOSER_SHELL_RADIUS_CLASS = RADIUS_CLASS.pill;

/** Shared geometry + focus treatment for suggestion chips. Mobile keeps a
 *  taller body (py-2.5) than desktop so touch targets stay comfortable. */
const SUGGESTION_CHIP_BASE_CLASS = `flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2.5 sm:py-2 rounded-lg border text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${FOCUS_VISIBLE_RING_INSET_CLASS}`;

/** Default / hover suggestion chip (soft, no elevation). */
export const SUGGESTION_CHIP_CLASS = `${SUGGESTION_CHIP_BASE_CLASS} border-[var(--theme-border-secondary)]/70 bg-[var(--theme-bg-tertiary)]/35 text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-border-focus)]`;

/** Active mode chip (BBox / Guide) — stronger than hover. */
export const SUGGESTION_CHIP_ACTIVE_CLASS = `${SUGGESTION_CHIP_BASE_CLASS} border-[var(--theme-bg-accent)] bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] hover:bg-[var(--theme-bg-accent-hover)] hover:border-[var(--theme-bg-accent-hover)] shadow-sm`;

/** Intra-cluster gap for composer icon groups (preserves 44px icon pitch with 36px buttons). */
export const COMPOSER_CLUSTER_GAP_CLASS = 'gap-2';

/** Gap between left/right composer clusters. */
export const COMPOSER_CLUSTER_SEPARATION_CLASS = 'gap-1';

/** Shared height for chat-input toolbar controls (image settings, etc.). */
const TOOLBAR_CONTROL_HEIGHT_CLASS = 'h-9';

/** Soft cluster wrapping image-generation controls above the composer. */
export const TOOLBAR_IMAGE_CLUSTER_CLASS =
  'flex flex-wrap items-center gap-1.5 sm:gap-2 rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] shadow-sm px-1.5 py-1';

/** Segmented control track (size, output mode) — outer height matches toolbar controls. */
export const TOOLBAR_SEGMENTED_TRACK_CLASS = `${TOOLBAR_CONTROL_HEIGHT_CLASS} inline-flex items-center gap-0.5 rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] p-0.5`;

const TOOLBAR_SEGMENT_BASE = `h-full inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors ${FOCUS_VISIBLE_RING_INSET_CLASS}`;
/** Idle segment inside a segmented track. */
export const TOOLBAR_SEGMENT_IDLE_CLASS = `${TOOLBAR_SEGMENT_BASE} text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-tertiary)]/70 hover:text-[var(--theme-text-primary)]`;

/** Active segment inside a segmented track. */
export const TOOLBAR_SEGMENT_ACTIVE_CLASS = `${TOOLBAR_SEGMENT_BASE} bg-[var(--theme-bg-accent)]/12 text-[var(--theme-text-primary)] shadow-sm`;

/** Standalone toggle chip (e.g. quad images) aligned with segmented track height. */
export const TOOLBAR_TOGGLE_IDLE_CLASS = `${TOOLBAR_CONTROL_HEIGHT_CLASS} inline-flex items-center justify-center gap-1.5 rounded-lg border border-transparent px-2.5 text-xs font-medium text-[var(--theme-text-tertiary)] transition-colors hover:bg-[var(--theme-bg-tertiary)]/70 hover:text-[var(--theme-text-primary)] ${FOCUS_VISIBLE_RING_BASE_CLASS}`;

export const TOOLBAR_TOGGLE_ACTIVE_CLASS = `${TOOLBAR_CONTROL_HEIGHT_CLASS} inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--theme-border-focus)]/40 bg-[var(--theme-bg-accent)]/12 px-2.5 text-xs font-medium text-[var(--theme-text-primary)] shadow-sm transition-colors ${FOCUS_VISIBLE_RING_BASE_CLASS}`;

// --- Settings surface ---

/** Soft card wrapping a settings subsection. */
export const SETTINGS_SECTION_CARD_CLASS =
  'rounded-xl border border-[var(--theme-border-secondary)]/60 bg-[var(--theme-bg-secondary)]/35 p-4';

/** Uppercase section label used across settings. */
export const SETTINGS_SECTION_LABEL_CLASS =
  'text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]';

/** Numeric value badge (font size, etc.) — neutral, not link-colored. */
export const SETTINGS_VALUE_BADGE_CLASS =
  'inline-flex items-center justify-center rounded-full border border-[var(--theme-border-secondary)]/60 bg-[var(--theme-bg-tertiary)] px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--theme-text-primary)] shadow-xs';

/** Keyboard key hint (shortcut affordance, e.g. '/' or 'Esc'). */
export const SETTINGS_KBD_KEY_CLASS =
  'rounded border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-tertiary)] px-1.5 py-px font-mono text-[10px] leading-4 text-[var(--theme-text-secondary)]';

/** Segmented control track (theme, language, scope). */
export const SETTINGS_SEGMENTED_TRACK_CLASS =
  'inline-flex items-center gap-1 rounded-lg border border-[var(--theme-border-secondary)]/50 bg-[var(--theme-bg-tertiary)]/60 p-1';

export const SETTINGS_SEGMENTED_ACTIVE_CLASS = `px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-sm ring-1 ring-inset ring-[var(--theme-border-secondary)]/70 transition-all duration-150 ${FOCUS_VISIBLE_RING_BASE_CLASS}`;

export const SETTINGS_SEGMENTED_IDLE_CLASS = `px-3 py-1.5 text-xs font-medium rounded-md text-[var(--theme-text-secondary)] transition-all duration-150 hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]/70 ${FOCUS_VISIBLE_RING_BASE_CLASS} disabled:cursor-not-allowed disabled:opacity-40`;

/** Active settings nav tab — aligned with chat session selection. */
export const SETTINGS_NAV_ACTIVE_CLASS =
  'bg-[var(--theme-bg-accent)]/12 text-[var(--theme-text-primary)] font-semibold shadow-xs';

export const SETTINGS_NAV_IDLE_CLASS =
  'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)]/50 hover:text-[var(--theme-text-primary)]';

/** Quiet type=search field used in Help and Preset Scenarios. */
export const SETTINGS_SEARCH_INPUT_CLASS = `h-10 w-full rounded-lg border border-transparent bg-[var(--theme-bg-tertiary)]/45 pl-9 pr-3 text-sm text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-tertiary)] transition-colors hover:bg-[var(--theme-bg-tertiary)]/70 focus:bg-[var(--theme-bg-tertiary)] ${FOCUS_VISIBLE_RING_INSET_CLASS} focus:ring-2 focus:ring-inset focus:ring-[var(--theme-border-focus)]/35`;

/** Shared range slider track (temperature, font size, safety thresholds…). */
export const SETTINGS_RANGE_SLIDER_CLASS =
  'w-full h-1.5 bg-[var(--theme-border-secondary)] rounded-lg appearance-none cursor-pointer accent-[var(--theme-bg-accent)] hover:accent-[var(--theme-bg-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]';
