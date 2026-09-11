import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';

const DARK_THEME_IDS = ['onyx', 'graphite'] as const;
const CONCRETE_THEME_IDS = ['onyx', 'graphite', 'pearl', 'sepia'] as const;
export const THEME_IDS = ['system', ...CONCRETE_THEME_IDS] as const;

export type ConcreteThemeId = (typeof CONCRETE_THEME_IDS)[number];
type AppThemeId = (typeof THEME_IDS)[number];

export const isDarkThemeId = (themeId: string): boolean => (DARK_THEME_IDS as readonly string[]).includes(themeId);

export const isKnownThemeId = (themeId: string): themeId is AppThemeId => THEME_IDS.includes(themeId as AppThemeId);

export const normalizeThemeId = (themeId: string): AppThemeId =>
  isKnownThemeId(themeId) ? themeId : DEFAULT_APP_SETTINGS.themeId;
