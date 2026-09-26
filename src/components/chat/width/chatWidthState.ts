/** localStorage key for the dragged chat content width preference (px). */
export const CHAT_WIDTH_PREF_KEY = 'amc.chat.contentWidth.v4';

/** Floor for dragged content width (px). */
export const CHAT_CONTENT_MIN = 640;

/** Horizontal room reserved for both handles and their safe edge zones (px). Matches DeepSeek Harness. */
export const CHAT_CONTENT_EDGE_BUDGET = 176;

/** Default adaptive width bounds. */
export const CHAT_DEFAULT_MIN = 680;
export const CHAT_DEFAULT_MAX = 920;

/** Width presets */
export const CHAT_WIDTH_PRESET_COMPACT = 768;
export const CHAT_WIDTH_PRESET_WIDE = 1280;

/** CustomEvent name dispatched on window when chat width changes */
export const CHAT_WIDTH_CHANGE_EVENT = 'amc:chat-width-change';

const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const FALLBACK_WHEEL_LINE_PX = 16;

/** Read persisted width preference, or null when absent or invalid. */
export function readChatWidthPreference(): number | null {
  try {
    const raw = localStorage.getItem(CHAT_WIDTH_PREF_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Max allowable width within container. */
export function maxChatContentWidth(containerWidth: number): number {
  return Math.max(CHAT_CONTENT_MIN, containerWidth - CHAT_CONTENT_EDGE_BUDGET);
}

/** Default adaptive width: 680px floor, 64% column width, clamped to 920px (DeepSeek Harness formula). */
export function defaultAdaptiveChatWidth(containerWidth: number): number {
  return Math.max(680, Math.min(containerWidth * 0.64, 920));
}

/** Resolve the effective width for a given container width and optional user preference. */
export function resolveChatContentWidth(containerWidth: number, preference: number | null): number {
  const max = maxChatContentWidth(containerWidth);
  if (preference !== null) {
    return Math.min(Math.max(preference, CHAT_CONTENT_MIN), max);
  }
  return defaultAdaptiveChatWidth(containerWidth);
}

/** Convert a wheel event's delta to vertical scroll pixels. */
export function wheelDeltaY(event: React.WheelEvent, scroller: HTMLElement): number {
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    const lineHeight = Number.parseFloat(getComputedStyle(scroller).lineHeight);
    return event.deltaY * (Number.isFinite(lineHeight) ? lineHeight : FALLBACK_WHEEL_LINE_PX);
  }
  if (event.deltaMode === WHEEL_DELTA_PAGE) {
    return event.deltaY * scroller.clientHeight;
  }
  return event.deltaY;
}

/** Find the active .chat-area DOM element. */
export function findChatContainer(startNode?: Node | null): HTMLElement | null {
  if (startNode instanceof HTMLElement) {
    const matched = startNode.closest<HTMLElement>('.chat-area');
    if (matched) return matched;
  }
  if (typeof document !== 'undefined') {
    return document.querySelector<HTMLElement>('.chat-area');
  }
  return null;
}

/** Read the currently applied live width in px from container or compute from container width. */
export function getLiveChatContentWidth(container?: HTMLElement | null): number {
  const target = container ?? findChatContainer();
  if (target) {
    const styleVal = target.style.getPropertyValue('--chat-content-width');
    if (styleVal && styleVal.endsWith('px')) {
      const parsed = parseFloat(styleVal);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    const colWidth = target.offsetWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200);
    return resolveChatContentWidth(colWidth, readChatWidthPreference());
  }
  return 1050;
}

export interface ChatWidthDetail {
  width: number;
  isCustom: boolean;
  commit: boolean;
}

/** Apply a specific width to container style and optionally persist to localStorage. */
export function applyChatWidth(
  targetWidth: number | null,
  container?: HTMLElement | null,
  commit: boolean = true,
): number {
  const target = container ?? findChatContainer();
  const containerWidth =
    (target && target.offsetWidth > 0 ? target.offsetWidth : null) ??
    (typeof window !== 'undefined' ? window.innerWidth : 1200);

  const resolved = resolveChatContentWidth(containerWidth, targetWidth);

  if (target) {
    target.style.setProperty('--chat-container-width', `${containerWidth}px`);
    target.style.setProperty('--chat-content-width', `${resolved}px`);
  }

  if (commit) {
    try {
      if (targetWidth === null) {
        localStorage.removeItem(CHAT_WIDTH_PREF_KEY);
        localStorage.removeItem('amc.chat.contentWidth.v3');
        localStorage.removeItem('amc.chat.contentWidth.v2');
        localStorage.removeItem('amc.chat.contentWidth');
      } else {
        localStorage.setItem(CHAT_WIDTH_PREF_KEY, `${resolved}`);
      }
    } catch {
      // Ignore storage errors in private browsing/sandboxes
    }
  }

  if (typeof window !== 'undefined') {
    const detail: ChatWidthDetail = {
      width: resolved,
      isCustom: targetWidth !== null,
      commit,
    };
    window.dispatchEvent(new CustomEvent(CHAT_WIDTH_CHANGE_EVENT, { detail }));
  }

  return resolved;
}

/** Reset width to adaptive default and clear stored preference. */
export function resetChatWidth(container?: HTMLElement | null): number {
  return applyChatWidth(null, container, true);
}
