import {
  FOCUS_VISIBLE_RING_INPUT_OFFSET_CLASS,
  FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS,
  FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS,
} from './focusClasses';

export const MESSAGE_BLOCK_BUTTON_CLASS = `min-h-11 min-w-11 p-1.5 rounded-md inline-flex items-center justify-center text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]/50 transition-all duration-200 focus:outline-none opacity-70 hover:opacity-100 ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`;
export const CHAT_INPUT_BUTTON_CLASS = `h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_VISIBLE_RING_INPUT_OFFSET_CLASS} p-0 m-0 border-0 leading-none`;
export const ICON_BUTTON_CLASS =
  'p-2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors';
export const MODAL_CLOSE_BUTTON_CLASS = `p-1.5 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-full transition-colors ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS}`;
export const MODAL_CLOSE_BUTTON_DANGER_HOVER_CLASS = `p-2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-danger)] hover:bg-[var(--theme-bg-danger)]/10 rounded-lg transition-colors ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS}`;
export const SMALL_ICON_BUTTON_CLASS = `p-1.5 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`;
export const SMALL_ICON_BUTTON_ROUND_CLASS = `p-1.5 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-full transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`;
export const SMALL_ICON_DANGER_BUTTON_CLASS = `p-1.5 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-danger)] hover:bg-[var(--theme-bg-danger)]/10 rounded-md transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`;
export const SETTINGS_INLINE_ACTION_BUTTON_CLASS =
  'inline-flex items-center gap-1.5 rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--theme-text-primary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-50';
export const SETTINGS_SECONDARY_ACTION_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-3.5 py-2 text-sm font-medium text-[var(--theme-text-primary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] disabled:cursor-not-allowed disabled:opacity-50';
export const SETTINGS_PRIMARY_ACTION_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--theme-bg-accent)] px-3.5 py-2 text-sm font-semibold text-[var(--theme-text-accent)] shadow-sm transition-colors hover:bg-[var(--theme-bg-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] disabled:cursor-not-allowed disabled:opacity-50';

/** Compact outline action used in dense settings rows (import/export, etc.). */
export const SETTINGS_OUTLINE_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--theme-border-secondary)] bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-primary)] disabled:cursor-not-allowed disabled:opacity-50';

export const SETTINGS_DANGER_OUTLINE_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--theme-text-danger)]/30 bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--theme-text-danger)] transition-colors hover:bg-[var(--theme-bg-danger)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-primary)] disabled:cursor-not-allowed disabled:opacity-50';

/** Highest-severity destructive action (irreversible data loss) — solid danger fill. */
export const SETTINGS_DANGER_SOLID_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-transparent bg-[var(--theme-bg-danger)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--theme-bg-danger-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-primary)] disabled:cursor-not-allowed disabled:opacity-50';
