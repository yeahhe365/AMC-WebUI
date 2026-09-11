/**
 * Detects whether the runtime environment is an Apple/Mac platform (macOS, iOS, iPadOS).
 * SSR-safe: returns false if window/navigator is undefined.
 */
export const isMacPlatform = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac/i.test(userAgent);
};

/**
 * Returns the primary modifier key display symbol for keyboard shortcuts:
 * '⌘' on Mac/Apple devices, 'Ctrl' on Windows/Linux.
 */
export const getModifierKeySymbol = (): string => (isMacPlatform() ? '⌘' : 'Ctrl');

/**
 * Returns the Alt/Option modifier display symbol:
 * '⌥' on Mac/Apple devices, 'Alt' on Windows/Linux.
 */
export const getAltKeySymbol = (): string => (isMacPlatform() ? '⌥' : 'Alt');

/**
 * Returns the save shortcut hint string (e.g. '⌘ Enter' on Mac, 'Ctrl+Enter' on PC).
 */
export const getSaveShortcutHint = (): string => (isMacPlatform() ? '⌘ Enter' : 'Ctrl+Enter');
