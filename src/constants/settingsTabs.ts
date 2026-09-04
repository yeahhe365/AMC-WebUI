import { SETTINGS_TABS, type SettingsTab } from '@/stores/settingsUiStore';

/** All settings tabs in sidebar order — single source of truth from the store. */
export const SETTINGS_TAB_IDS: SettingsTab[] = SETTINGS_TABS;

/** Localized label key for each settings tab. */
export const SETTINGS_TAB_LABEL_KEYS: Record<SettingsTab, string> = {
  models: 'settingsTabModels',
  interface: 'settingsTabInterface',
  api: 'settingsTabApi',
  mcp: 'settingsTabMcp',
  data: 'settingsTabData',
  shortcuts: 'settingsTabShortcuts',
  about: 'settingsTabAbout',
};
