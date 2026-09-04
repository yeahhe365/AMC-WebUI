import type { LogLevel, LogCategory } from '@/types/logging';

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  INFO: 'text-[var(--theme-text-info)]',
  WARN: 'text-[var(--theme-text-warning)]',
  ERROR: 'text-[var(--theme-text-danger)]',
  DEBUG: 'text-[var(--theme-text-tertiary)]',
};

export const LOG_CATEGORY_CHIP_CLASS = 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]';

export const CATEGORY_COLORS: Record<LogCategory, string> = {
  SYSTEM: LOG_CATEGORY_CHIP_CLASS,
  NETWORK: LOG_CATEGORY_CHIP_CLASS,
  USER: LOG_CATEGORY_CHIP_CLASS,
  MODEL: LOG_CATEGORY_CHIP_CLASS,
  DB: LOG_CATEGORY_CHIP_CLASS,
  AUTH: LOG_CATEGORY_CHIP_CLASS,
  FILE: LOG_CATEGORY_CHIP_CLASS,
};
