#!/usr/bin/env node
// Usage: node scripts/add-language.mjs ko [--dry-run]
// Inserts `ko: ''` placeholders after ja in each translation file. Idempotent.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { discoverTranslationFiles } from './lib/i18nFiles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const isDryRun = flags.includes('--dry-run');

const newLang = args[0];

if (!newLang || !/^[a-z]{2}(-[A-Z]{2})?$/.test(newLang)) {
  console.error('Usage: node scripts/add-language.mjs <lang> [--dry-run]  (e.g. ko, es, fr, de)');
  process.exit(1);
}

const files = discoverTranslationFiles(projectRoot);

let updated = 0;
let skipped = 0;
let warnings = 0;

for (const rel of files) {
  const full = path.join(projectRoot, rel);
  if (!fs.existsSync(full)) {
    console.warn(`Missing ${rel}, skipping`);
    warnings++;
    continue;
  }
  let content = fs.readFileSync(full, 'utf8');

  // Precise idempotency check: a real entry has `lang:` followed by a quote.
  // A bare substring test (content.includes(`${newLang}:`)) false-positives on
  // words like `mode:` / `types:` and silently skips the whole file.
  const langPresentRegex = new RegExp(`${newLang}\\s*:\\s*(['"\`])`);
  if (langPresentRegex.test(content)) {
    console.log(`Skip ${rel}: already has ${newLang}`);
    skipped++;
    continue;
  }

  // Match ja: '...' / ja: "..." / ja: `...` with proper quote handling including escapes
  // Captures the whole ja: 'value' segment including quotes
  const langInsertRegex = /(ja:\s*(['"`])((?:\\.|(?!\2).)*)\2)/g;

  const newContent = content.replace(langInsertRegex, `$1, ${newLang}: ''`);

  if (newContent !== content) {
    if (isDryRun) {
      console.log(`[dry-run] Would update ${rel}`);
    } else {
      fs.writeFileSync(full, newContent, 'utf8');
      console.log(`Updated ${rel}`);
    }
    updated++;
  } else {
    console.warn(`No ja pattern found in ${rel}, manual check needed`);
    warnings++;
  }
}

if (isDryRun) {
  console.log(`\n[dry-run] Done. Would update ${updated} files, skipped ${skipped}, warnings ${warnings}.`);
  console.log(`Run without --dry-run to apply: node scripts/add-language.mjs ${newLang}`);
} else {
  console.log(
    `\nDone. Updated ${updated} files, skipped ${skipped}. Now fill ${newLang}: '' with translations and add ${newLang} to src/i18n/languageRegistry.ts`,
  );
  console.log(`  - Add to SUPPORTED_LANGUAGES, LANGUAGE_META.${newLang}, BROWSER_LANG_PREFIX_MAP['${newLang}']`);
}
