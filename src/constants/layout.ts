export const MOBILE_BREAKPOINT_PX = 640;
export const DESKTOP_BREAKPOINT_PX = 768;
export const CHAT_INPUT_TEXTAREA_SELECTOR = 'textarea[data-chat-input-textarea="true"]';
/** Sidebar root, used to keep programmatic focus (e.g. after loading a session) out of an in-progress rename. */
export const HISTORY_SIDEBAR_ROOT_SELECTOR = '[data-history-sidebar-root="true"]';
/** Interactive elements that should retain focus when the input shell is clicked. */
export const FOCUS_BLOCKING_SELECTOR =
  'button, a, input, textarea, select, label, summary, audio, video, [role="button"], [role="menuitem"], [contenteditable="true"]';
export const FOCUS_HISTORY_SEARCH_EVENT = 'amc:focus-history-search';

/** Max content width for the chat input area and its empty-state suggestions. */
export const CHAT_INPUT_MAX_WIDTH_CLASS = 'max-w-[44rem]';

/** Left inset on user bubbles only, so the bubble tail stays off the history sidebar. */
export const CHAT_USER_MESSAGE_INSET_CLASS = 'ml-12 sm:ml-16 md:ml-20';

/**
 * Z-index layering. Kept as full Tailwind class strings so the JIT compiler can
 * statically detect them; values are intentionally ordered so higher layers stack
 * above lower ones.
 */
export const Z_INDEX_MODAL_BACKDROP = 'z-[2100]';
export const Z_INDEX_TABLE_FULLSCREEN = 'z-[2200]';
export const Z_INDEX_SIDE_PANEL_MOBILE = 'z-[3000]';
/** Toast notifications: above modals and side panels, below text-selection overlays. */
export const Z_INDEX_TOAST_VIEWPORT = 'z-[4000]';
/** Topmost overlays: text-selection toolbar, side-panel resize mask. */
export const Z_INDEX_TOPMOST_OVERLAY = 'z-[9999]';
