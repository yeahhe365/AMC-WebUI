import { type translations } from '@/i18n/translations';

interface ShortcutDefinition {
  id: string;
  labelKey: keyof typeof translations | string;
  defaultKey: string;
  category: 'general' | 'input' | 'global';
}

export const SHORTCUT_REGISTRY: ShortcutDefinition[] = [
  // General
  { id: 'general.newChat', labelKey: 'shortcutsNewChat', defaultKey: 'mod+shift+o', category: 'general' },
  { id: 'general.searchChats', labelKey: 'shortcutsSearchChats', defaultKey: 'mod+k', category: 'general' },
  {
    id: 'general.commandPalette',
    labelKey: 'shortcutsCommandPalette',
    defaultKey: 'mod+shift+p',
    category: 'general',
  },
  { id: 'general.openLogs', labelKey: 'shortcutsOpenLogs', defaultKey: 'mod+alt+l', category: 'general' },
  { id: 'general.togglePip', labelKey: 'shortcutsTogglePip', defaultKey: 'mod+alt+p', category: 'general' },
  {
    id: 'general.toggleFullscreen',
    labelKey: 'shortcutsToggleFullscreen',
    defaultKey: 'mod+alt+f',
    category: 'general',
  },

  // Chat Input
  { id: 'input.sendMessage', labelKey: 'shortcutsSendMessage', defaultKey: 'enter', category: 'input' },
  { id: 'input.newLine', labelKey: 'shortcutsNewLine', defaultKey: 'shift+enter', category: 'input' },
  { id: 'input.editLast', labelKey: 'shortcutsEditLast', defaultKey: 'arrowup', category: 'input' },
  { id: 'input.cycleModels', labelKey: 'shortcutsCycleModels', defaultKey: 'tab', category: 'input' },
  { id: 'input.clearDraft', labelKey: 'shortcutsClearInputDraft', defaultKey: '', category: 'input' },

  // Global / Dialogs
  { id: 'global.stopCancel', labelKey: 'shortcutsStopCancel', defaultKey: 'escape', category: 'global' },
  { id: 'global.saveConfirm', labelKey: 'shortcutsSaveConfirm', defaultKey: 'mod+enter', category: 'global' },
  { id: 'global.prevFile', labelKey: 'shortcutsPrevFile', defaultKey: 'arrowleft', category: 'global' },
  { id: 'global.nextFile', labelKey: 'shortcutsNextFile', defaultKey: 'arrowright', category: 'global' },
];

export const DEFAULT_SHORTCUTS: Record<string, string> = SHORTCUT_REGISTRY.reduce(
  (acc, item) => {
    acc[item.id] = item.defaultKey;
    return acc;
  },
  {} as Record<string, string>,
);
