// Single source of truth for translation module discovery.
// Shared by scripts/check-i18n-coverage.mjs and scripts/add-language.mjs
// so the file list can never drift between them.
import fs from 'fs';
import path from 'path';

// Explicit file list + dynamic settings discovery to stay future-proof.
const BASE_TRANSLATION_FILES = [
  'src/i18n/translations/app.ts',
  'src/i18n/translations/chat.ts',
  'src/i18n/translations/chatInput.ts',
  'src/i18n/translations/common.ts',
  'src/i18n/translations/header.ts',
  'src/i18n/translations/history.ts',
  'src/i18n/translations/library.ts',
  'src/i18n/translations/logViewer.ts',
  'src/i18n/translations/messages.ts',
  'src/i18n/translations/scenarios.ts',
  'src/i18n/voiceStyleTranslations.ts',
  'src/i18n/coreTranslations.ts',
];

export function discoverTranslationFiles(projectRoot) {
  const settingsDir = path.join(projectRoot, 'src/i18n/translations/settings');
  let settingsFiles = [];
  try {
    settingsFiles = fs
      .readdirSync(settingsDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => `src/i18n/translations/settings/${f}`)
      .sort();
  } catch {
    // settings dir missing – rely on base files only
  }

  return [...BASE_TRANSLATION_FILES, ...settingsFiles];
}
