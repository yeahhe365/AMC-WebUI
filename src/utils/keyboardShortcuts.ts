import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { type AppSettings } from '@/types';
import { DEFAULT_SHORTCUTS } from '@/constants/shortcuts';
import { isMacPlatform } from './platform';

const isMac = isMacPlatform();

const KEY_DISPLAY_MAP: Record<string, string> = {
  mod: isMac ? '⌘' : 'Ctrl',
  alt: isMac ? 'Opt' : 'Alt',
  shift: 'Shift',
  ctrl: 'Ctrl',
  meta: isMac ? 'Cmd' : 'Win',
  enter: 'Enter',
  escape: 'Esc',
  delete: 'Del',
  backspace: 'Back',
  tab: 'Tab',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  space: 'Space',
  ' ': 'Space',
};

export const formatShortcut = (shortcut: string): string[] => {
  if (!shortcut) return [];

  const parts = shortcut.split('+');
  return parts.map((part) => {
    const lower = part.trim().toLowerCase();
    return KEY_DISPLAY_MAP[lower] ?? part.toUpperCase();
  });
};

type ShortcutKeyboardEvent = ReactKeyboardEvent | KeyboardEvent;

const getEventKeyCombo = (event: ShortcutKeyboardEvent): string | null => {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null;

  const parts: string[] = [];

  if (event.ctrlKey) parts.push('ctrl');
  if (event.metaKey) parts.push('meta');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');

  let key = event.key;
  if (key === ' ') key = 'space';
  if (key === 'ArrowUp') key = 'arrowup';
  if (key === 'ArrowDown') key = 'arrowdown';
  if (key === 'ArrowLeft') key = 'arrowleft';
  if (key === 'ArrowRight') key = 'arrowright';
  if (key === 'Enter') key = 'enter';
  if (key === 'Escape') key = 'escape';
  if (key === 'Tab') key = 'tab';
  if (key === 'Delete') key = 'delete';
  if (key === 'Backspace') key = 'backspace';

  key = key.toLowerCase();

  parts.push(key);

  const uniqueParts = [...new Set(parts)];

  const order = ['meta', 'ctrl', 'alt', 'shift'];
  const modifiers = uniqueParts.slice(0, -1).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const finalKey = uniqueParts[uniqueParts.length - 1];

  let resultParts = [...modifiers, finalKey];

  if (isMac) {
    if (resultParts.includes('meta')) {
      resultParts = resultParts.map((part) => (part === 'meta' ? 'mod' : part));
    }
  } else {
    if (resultParts.includes('ctrl')) {
      resultParts = resultParts.map((part) => (part === 'ctrl' ? 'mod' : part));
    }
  }

  return resultParts.join('+');
};

export const recordKeyCombination = (event: ShortcutKeyboardEvent): string | null => {
  event.preventDefault();
  event.stopPropagation();
  return getEventKeyCombo(event);
};

export const isShortcutPressed = (event: ShortcutKeyboardEvent, actionId: string, settings: AppSettings): boolean => {
  const customKey = settings.customShortcuts?.[actionId];
  const defaultKey = DEFAULT_SHORTCUTS[actionId];
  const targetKey = customKey !== undefined ? customKey : defaultKey;

  if (!targetKey) return false;

  const pressedKey = getEventKeyCombo(event);
  return pressedKey === targetKey;
};

export const getShortcutDisplay = (actionId: string, settings: AppSettings): string => {
  const customKey = settings.customShortcuts?.[actionId];
  const key = customKey !== undefined ? customKey : DEFAULT_SHORTCUTS[actionId];
  if (!key) return '';
  return formatShortcut(key).join(' + ');
};
