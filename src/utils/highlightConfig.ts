import type { HLJSApi, LanguageFn } from 'highlight.js';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dart from 'highlight.js/lib/languages/dart';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import graphql from 'highlight.js/lib/languages/graphql';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import less from 'highlight.js/lib/languages/less';
import lua from 'highlight.js/lib/languages/lua';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import perl from 'highlight.js/lib/languages/perl';
import php from 'highlight.js/lib/languages/php';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import r from 'highlight.js/lib/languages/r';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

export const HIGHLIGHT_LANGUAGES: Record<string, LanguageFn> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  dart,
  diff,
  dockerfile,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  less,
  lua,
  makefile,
  markdown,
  perl,
  php,
  powershell,
  python,
  r,
  ruby,
  rust,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

export const HIGHLIGHT_ALIASES: Record<string, string[]> = {
  bash: ['sh', 'shell', 'zsh'],
  cpp: ['c++', 'cc', 'cxx', 'hpp', 'hxx'],
  csharp: ['cs', 'c#'],
  dockerfile: ['docker', 'docker-compose'],
  go: ['golang'],
  javascript: ['js', 'jsx', 'node', 'nodejs', 'mjs', 'cjs'],
  json: ['jsonc'],
  kotlin: ['kt', 'kts'],
  makefile: ['make', 'mk'],
  markdown: ['md'],
  perl: ['pl'],
  powershell: ['ps1', 'pwsh'],
  python: ['py', 'py3'],
  ruby: ['rb'],
  rust: ['rs'],
  sql: ['mysql', 'pgsql', 'postgres', 'postgresql', 'sqlite'],
  typescript: ['ts', 'tsx'],
  xml: ['html', 'htm', 'svg', 'xhtml', 'rss', 'atom'],
  yaml: ['yml'],
};

export const HIGHLIGHT_PLAINTEXT = ['text', 'txt', 'plaintext'];

let isRegistered = false;

export const registerHighlightLanguages = (hljs: HLJSApi) => {
  if (isRegistered) return;

  Object.entries(HIGHLIGHT_LANGUAGES).forEach(([name, language]) => {
    hljs.registerLanguage(name, language);
  });

  Object.entries(HIGHLIGHT_ALIASES).forEach(([languageName, aliases]) => {
    hljs.registerAliases(aliases, { languageName });
  });

  isRegistered = true;
};
