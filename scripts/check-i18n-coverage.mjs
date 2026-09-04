#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { discoverTranslationFiles } from './lib/i18nFiles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const SUPPORTED_LANGUAGES = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de'];

const translationFiles = discoverTranslationFiles(projectRoot);

let hasError = false;
let totalKeys = 0;
let totalMissing = 0;
const placeholderErrors = [];

/**
 * Count occurrences of `lang:` in file content.
 * Uses word boundary to avoid matching inside other words.
 */
function countLang(content, lang) {
  const re = new RegExp(`\\b${lang}\\s*:`, 'g');
  const m = content.match(re);
  return m ? m.length : 0;
}

for (const rel of translationFiles) {
  const full = path.join(projectRoot, rel);
  if (!fs.existsSync(full)) {
    console.error(`Missing file: ${rel}`);
    hasError = true;
    continue;
  }
  const content = fs.readFileSync(full, 'utf8');

  const counts = {};
  for (const lang of SUPPORTED_LANGUAGES) {
    counts[lang] = countLang(content, lang);
  }

  const enCount = counts.en;
  totalKeys += enCount;

  // Check per-language count consistency
  for (const lang of SUPPORTED_LANGUAGES) {
    if (counts[lang] !== enCount) {
      console.error(`Missing ${lang} in ${rel}: en:${enCount} ${lang}:${counts[lang]} (expected ${enCount})`);
      hasError = true;
      totalMissing += Math.abs(enCount - counts[lang]);
    }
  }

  // Placeholder consistency: for each entry, compare placeholder sets across ALL 7 languages.
  // Matches an entry block containing all 7 language keys in order.
  const entryRegex =
    /\{\s*en:\s*(['"`])((?:\\.|(?!\1).)*)\1\s*,\s*zh:\s*(['"`])((?:\\.|(?!\3).)*)\3\s*,\s*ja:\s*(['"`])((?:\\.|(?!\5).)*)\5\s*,\s*ko:\s*(['"`])((?:\\.|(?!\7).)*)\7\s*,\s*es:\s*(['"`])((?:\\.|(?!\9).)*)\9\s*,\s*fr:\s*(['"`])((?:\\.|(?!\11).)*)\11\s*,\s*de:\s*(['"`])((?:\\.|(?!\13).)*)\13\s*,?\s*\}/gs;
  let m;
  const matchedEntries = [];
  while ((m = entryRegex.exec(content)) !== null) {
    matchedEntries.push(m);
  }

  for (const entry of matchedEntries) {
    const enStr = entry[2];
    const zhStr = entry[4];
    const jaStr = entry[6];
    const koStr = entry[8];
    const esStr = entry[10];
    const frStr = entry[12];
    const deStr = entry[14];

    const extractPlaceholders = (str) => {
      const set = [...str.matchAll(/\{(\w+)\}/g)].map((x) => x[0]).sort();
      return set;
    };

    const enPH = extractPlaceholders(enStr);
    const zhPH = extractPlaceholders(zhStr);
    const jaPH = extractPlaceholders(jaStr);
    const koPH = extractPlaceholders(koStr);
    const esPH = extractPlaceholders(esStr);
    const frPH = extractPlaceholders(frStr);
    const dePH = extractPlaceholders(deStr);

    const arraysEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

    const langMap = { zh: zhPH, ja: jaPH, ko: koPH, es: esPH, fr: frPH, de: dePH };
    for (const [lang, ph] of Object.entries(langMap)) {
      if (!arraysEqual(enPH, ph)) {
        console.error(
          `Placeholder mismatch (en vs ${lang}) in ${rel}: en ${JSON.stringify(enPH)} vs ${lang} ${JSON.stringify(ph)} | block: ${entry[0].slice(0, 120)}...`,
        );
        hasError = true;
        placeholderErrors.push(rel);
      }
    }
  }

  // Fallback: if an entry doesn't match the 7-lang regex (e.g. multiline formatting
  // variations), at least warn when entry count differs from en count - already handled
  // by the per-language count check above.
}

if (hasError) {
  console.error('\ni18n coverage check failed');
  if (totalMissing > 0) console.error(`Missing translations: ~${totalMissing} keys`);
  if (placeholderErrors.length > 0)
    console.error(`Placeholder mismatches in: ${[...new Set(placeholderErrors)].join(', ')}`);
  process.exit(1);
} else {
  console.log(`✓ i18n coverage: ${totalKeys}/${totalKeys} keys have ${SUPPORTED_LANGUAGES.join('/')}`);
  console.log(`✓ i18n coverage: all keys have ${SUPPORTED_LANGUAGES.join('/')}`);
}
