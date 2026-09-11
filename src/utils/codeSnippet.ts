import { sanitizeFilename } from '@/utils/export/core';

export const LANGUAGE_EXTENSION_MAP: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  node: 'js',
  typescript: 'ts',
  ts: 'ts',
  python: 'py',
  py: 'py',
  py3: 'py',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'cs',
  cs: 'cs',
  'c#': 'cs',
  go: 'go',
  golang: 'go',
  rust: 'rs',
  rs: 'rs',
  php: 'php',
  ruby: 'rb',
  rb: 'rb',
  swift: 'swift',
  kotlin: 'kt',
  kt: 'kt',
  html: 'html',
  htm: 'html',
  'amc-live-artifact-html': 'html',
  'amc-live-artifact-interaction': 'json',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  xml: 'xml',
  svg: 'svg',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  shell: 'sh',
  bash: 'sh',
  sh: 'sh',
  zsh: 'sh',
  markdown: 'md',
  md: 'md',
  react: 'jsx',
  jsx: 'jsx',
  tsx: 'tsx',
  vue: 'vue',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  perl: 'pl',
  pl: 'pl',
  powershell: 'ps1',
  ps1: 'ps1',
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
  batch: 'bat',
  bat: 'bat',
  text: 'txt',
  txt: 'txt',
  plaintext: 'txt',
  mermaid: 'mmd',
  dot: 'dot',
  graphviz: 'dot',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'proto',
  protobuf: 'proto',
  toml: 'toml',
  ini: 'ini',
  tex: 'tex',
  latex: 'tex',
  diff: 'diff',
  patch: 'patch',
  makefile: 'mk',
  make: 'mk',
  solidity: 'sol',
  sol: 'sol',
  clojure: 'clj',
  clj: 'clj',
  elixir: 'ex',
  ex: 'ex',
  exs: 'exs',
  erlang: 'erl',
  erl: 'erl',
  haskell: 'hs',
  hs: 'hs',
  scala: 'scala',
  matlab: 'm',
  vb: 'vb',
  vba: 'bas',
  wat: 'wat',
  wasm: 'wasm',
  scad: 'scad',
};

const COMPATIBLE_EXTENSIONS: Record<string, string[]> = {
  js: ['js', 'jsx', 'mjs', 'cjs'],
  jsx: ['jsx', 'js'],
  ts: ['ts', 'tsx', 'd.ts'],
  tsx: ['tsx', 'ts'],
  py: ['py', 'py3', 'pyw'],
  html: ['html', 'htm'],
  svg: ['svg'],
  css: ['css', 'scss', 'sass', 'less'],
  scss: ['scss', 'css'],
  json: ['json', 'jsonc', 'json5'],
  yaml: ['yaml', 'yml'],
  sh: ['sh', 'bash', 'zsh'],
  c: ['c', 'h'],
  cpp: ['cpp', 'cxx', 'cc', 'hpp', 'h'],
  rs: ['rs'],
  go: ['go'],
  java: ['java'],
  kt: ['kt', 'kts'],
  rb: ['rb'],
  php: ['php'],
  sql: ['sql'],
  md: ['md', 'markdown'],
};

const SVG_CONTAINER_TAGS = [
  'svg',
  'g',
  'defs',
  'linearGradient',
  'radialGradient',
  'clipPath',
  'mask',
  'pattern',
  'symbol',
  'style',
  'text',
  'tspan',
  'filter',
  'marker',
] as const;

/**
 * Repairs an incomplete/truncated SVG document so that it remains valid XML.
 * Standalone SVG viewers (macOS QuickLook, Preview, Chrome, Illustrator) strictly require
 * well-formed XML and will fail to open or display truncated SVGs.
 */
export const repairIncompleteSvg = (svgText: string): string => {
  if (!svgText) return '';
  const trimmed = svgText.trim();
  const svgStartIdx = trimmed.indexOf('<svg');
  if (svgStartIdx === -1) return svgText;

  // If it already ends with </svg>, verify namespace and return
  if (/<\/svg>\s*$/i.test(trimmed)) {
    return ensureSvgXmlNamespace(trimmed);
  }

  // Strip trailing cut-off tag fragment, e.g. `<path d="M 10 20 ` or `<rect x=`
  let cleaned = trimmed;
  const lastOpenAngle = cleaned.lastIndexOf('<');
  const lastCloseAngle = cleaned.lastIndexOf('>');
  if (lastOpenAngle > lastCloseAngle) {
    cleaned = cleaned.slice(0, lastOpenAngle).trimEnd();
  }

  // Find unclosed container tags
  // Match XML tags: opening or closing
  const tagRegex = /<\/?([a-zA-Z0-9_-]+)(?:\s+[^>]*?)?(\/?)>/g;
  const openTagStack: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(cleaned)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1];
    const isSelfClosing = match[2] === '/' || fullMatch.endsWith('/>');
    const isClosingTag = fullMatch.startsWith('</');

    // Only track SVG container tags
    const normalizedTag = SVG_CONTAINER_TAGS.find((t) => t.toLowerCase() === tagName.toLowerCase());
    if (!normalizedTag) continue;

    if (isClosingTag) {
      // Pop matching open tag
      const lastIndex = openTagStack.lastIndexOf(normalizedTag);
      if (lastIndex !== -1) {
        openTagStack.splice(lastIndex, 1);
      }
    } else if (!isSelfClosing) {
      openTagStack.push(normalizedTag);
    }
  }

  // Close open tags in LIFO order
  const closingTags = openTagStack
    .reverse()
    .map((tag) => `</${tag}>`)
    .join('\n');
  const repaired = `${cleaned}\n${closingTags}`;

  return ensureSvgXmlNamespace(repaired);
};

const ensureSvgXmlNamespace = (svgText: string): string => {
  if (!svgText.includes('xmlns=')) {
    return svgText.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svgText;
};

/**
 * Ensures a filename ends with the expected extension, preventing double extensions like `foo.svg.svg`.
 */
const ensureExtension = (stemOrFull: string, expectedExt: string): string => {
  const sane = sanitizeFilename(stemOrFull.trim());
  if (!sane) return `snippet.${expectedExt}`;

  // Special cases for files without extension
  if (expectedExt === 'dockerfile' && sane.toLowerCase() === 'dockerfile') return 'Dockerfile';
  if (expectedExt === 'mk' && sane.toLowerCase() === 'makefile') return 'Makefile';

  const lowerExpected = expectedExt.toLowerCase();
  const trailingExtRegex = new RegExp(`\\.${lowerExpected}$`, 'i');

  if (trailingExtRegex.test(sane)) {
    return sane;
  }

  // If sane already has an extension that is compatible with the expected language, preserve it
  const dotIdx = sane.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < sane.length - 1) {
    const currentExt = sane.slice(dotIdx + 1).toLowerCase();
    const compatibleList = COMPATIBLE_EXTENSIONS[lowerExpected] ?? [lowerExpected];
    if (compatibleList.includes(currentExt)) {
      return sane;
    }
    // Otherwise, strip existing foreign extension before appending expected extension
    return `${sane.slice(0, dotIdx)}.${lowerExpected}`;
  }

  return `${sane}.${lowerExpected}`;
};

/**
 * Attempts to extract a sensible filename from code comments, titles, or fence attributes.
 */
export const detectSnippetFilename = (
  code: string,
  language: string,
  ext: string,
  explicitFenceFilename?: string,
): string => {
  const trimmed = code.trim();
  const lowerLang = language.toLowerCase();
  const rawExt = LANGUAGE_EXTENSION_MAP[ext.toLowerCase()] || LANGUAGE_EXTENSION_MAP[lowerLang] || ext;
  const safeExt = rawExt.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'txt';

  // 1. If explicit filename was declared in the markdown fence (e.g. ```python:server.py)
  if (explicitFenceFilename) {
    const saneFence = sanitizeFilename(explicitFenceFilename.trim());
    if (saneFence) {
      return ensureExtension(saneFence, safeExt);
    }
  }

  // 2. Special naming for standard standalone files
  if (safeExt === 'dockerfile' || lowerLang === 'dockerfile') return 'Dockerfile';
  if (lowerLang === 'makefile' && !trimmed.includes('filename:')) return 'Makefile';

  // 3. Check <title>...</title> for HTML and SVG
  if (safeExt === 'html' || safeExt === 'svg' || lowerLang === 'html' || lowerLang === 'svg') {
    const titleMatch = trimmed.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return ensureExtension(titleMatch[1], safeExt);
    }
  }

  // 4. For SVG: check aria-label, id, or <desc>
  if (safeExt === 'svg' || lowerLang === 'svg') {
    const descMatch = trimmed.match(/<desc[^>]*>([^<]+)<\/desc>/i);
    if (descMatch && descMatch[1]) {
      return ensureExtension(descMatch[1], 'svg');
    }

    const svgAttrMatch = trimmed.match(/<svg\b[^>]*(?:aria-label|id)=["']([^"']+)["']/i);
    if (svgAttrMatch && svgAttrMatch[1]) {
      return ensureExtension(svgAttrMatch[1], 'svg');
    }
  }

  // 5. Check first 3 lines for filename comments
  const firstLines = trimmed.split(/\r?\n/).slice(0, 3);
  const compatibleExts = COMPATIBLE_EXTENSIONS[safeExt] ?? [safeExt];

  for (const line of firstLines) {
    const trimmedLine = line.trim();

    // 5a. Explicit keyword declaration: // filename: App.tsx or # file: server.py
    const explicitMatch = trimmedLine.match(
      /(?:#|\/\/|\/\*|<!--)\s*@?(?:file(?:name)?|name|source):\s*([a-zA-Z0-9_.-]+)(?:\s*\*\/|\s*-->)?/i,
    );
    if (explicitMatch && explicitMatch[1]) {
      const cand = explicitMatch[1].trim();
      const dotIdx = cand.lastIndexOf('.');
      if (dotIdx > 0 && dotIdx < cand.length - 1) {
        const candExt = cand.slice(dotIdx + 1).toLowerCase();
        if (compatibleExts.includes(candExt)) {
          return sanitizeFilename(cand);
        }
      }
      return ensureExtension(cand, safeExt);
    }

    // 5b. Strict line comment containing ONLY a filename: ^// App.tsx$ or ^# main.py$
    const strictMatch = trimmedLine.match(/^(?:#|\/\/|\/\*|<!--)\s*([a-zA-Z0-9_.-]+\.[a-zA-Z0-9_-]+)\s*(?:\*\/|-->)?$/);
    if (strictMatch && strictMatch[1]) {
      const cand = strictMatch[1].trim();
      const dotIdx = cand.lastIndexOf('.');
      if (dotIdx > 0 && dotIdx < cand.length - 1) {
        const candExt = cand.slice(dotIdx + 1).toLowerCase();
        // ONLY accept if the extension is valid and compatible with the code block language
        if (compatibleExts.includes(candExt)) {
          return sanitizeFilename(cand);
        }
      }
    }
  }

  // 6. Safe fallbacks
  if (safeExt === 'svg') return 'vector-graphic.svg';
  if (safeExt === 'html') return 'snippet.html';
  return `snippet.${safeExt}`;
};

/**
 * Returns the MIME type including charset=utf-8 for safe text downloading.
 */
export const getSnippetMimeType = (language: string, previewMarkupType?: string | null): string => {
  const lowerLang = language.toLowerCase();
  if (lowerLang === 'svg' || previewMarkupType === 'svg') {
    return 'image/svg+xml;charset=utf-8';
  }
  if (['html', 'htm', 'xml', 'amc-live-artifact-html'].includes(lowerLang) || previewMarkupType === 'html') {
    return 'text/html;charset=utf-8';
  }
  if (['javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx', 'node'].includes(lowerLang)) {
    return 'application/javascript;charset=utf-8';
  }
  if (lowerLang === 'css' || lowerLang === 'scss' || lowerLang === 'less') {
    return 'text/css;charset=utf-8';
  }
  if (lowerLang === 'json' || lowerLang === 'amc-live-artifact-interaction') {
    return 'application/json;charset=utf-8';
  }
  if (['markdown', 'md'].includes(lowerLang)) {
    return 'text/markdown;charset=utf-8';
  }
  return 'text/plain;charset=utf-8';
};
