export type SettingsTab = 'models' | 'providers' | 'interface' | 'api' | 'mcp' | 'data' | 'shortcuts' | 'about';
export type SettingsTabDescriptor = { id: SettingsTab; labelKey: string };

/** All settings tabs in sidebar order. */
export const SETTINGS_TABS: SettingsTab[] = [
  'models',
  'providers',
  'interface',
  'api',
  'mcp',
  'data',
  'shortcuts',
  'about',
];

/** Localized label key for each settings tab. */
export const SETTINGS_TAB_LABEL_KEYS: Record<SettingsTab, string> = {
  models: 'settingsTabModels',
  providers: 'settingsTabProviders',
  interface: 'settingsTabInterface',
  api: 'settingsTabApi',
  mcp: 'settingsTabMcp',
  data: 'settingsTabData',
  shortcuts: 'settingsTabShortcuts',
  about: 'settingsTabAbout',
};
