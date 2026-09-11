import hljs from 'highlight.js/lib/core';
import { describe, expect, it } from 'vitest';
import { registerHighlightLanguages } from './highlightConfig';

describe('highlightConfig', () => {
  it('registers common programming languages and aliases for markdown code blocks', () => {
    registerHighlightLanguages(hljs);

    const supportedLanguages = [
      'c',
      'cpp',
      'c++',
      'csharp',
      'cs',
      'java',
      'go',
      'golang',
      'rust',
      'rs',
      'php',
      'ruby',
      'rb',
      'swift',
      'kotlin',
      'kt',
      'dart',
      'lua',
      'r',
      'perl',
      'powershell',
      'ps1',
      'dockerfile',
      'docker',
      'graphql',
      'scss',
      'less',
      'ini',
      'makefile',
      'make',
      'html',
      'jsonc',
      'postgres',
      'mysql',
      'sqlite',
      'mjs',
      'docker-compose',
    ];

    expect(supportedLanguages.filter((language) => !hljs.getLanguage(language))).toEqual([]);
  });
});
