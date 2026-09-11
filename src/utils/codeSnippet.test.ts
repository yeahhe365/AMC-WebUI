import { describe, expect, it } from 'vitest';
import { repairIncompleteSvg, detectSnippetFilename, getSnippetMimeType, LANGUAGE_EXTENSION_MAP } from './codeSnippet';

describe('repairIncompleteSvg', () => {
  it('returns empty string if given empty input', () => {
    expect(repairIncompleteSvg('')).toBe('');
  });

  it('preserves already complete SVGs while ensuring xmlns is present', () => {
    const completeSvg = '<svg width="100" height="100"><circle cx="50" cy="50" r="40" /></svg>';
    const result = repairIncompleteSvg(completeSvg);
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result).toContain('</svg>');
  });

  it('repairs truncated SVG with unclosed tags and unclosed root svg', () => {
    const truncatedSvg = `<svg viewBox="0 0 100 100">
  <defs>
    <linearGradient id="grad">
      <stop offset="0%" stop-color="#f00" />
  <g id="layer1">
    <path d="M10 20 L30 40" />
    <circle cx="20" cy="20" r="5" />`;

    const repaired = repairIncompleteSvg(truncatedSvg);
    expect(repaired).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(repaired).toContain('</linearGradient>');
    expect(repaired).toContain('</defs>');
    expect(repaired).toContain('</g>');
    expect(repaired).toContain('</svg>');
  });

  it('cleans up a dangling unclosed tag fragment at the end', () => {
    const cutOffMidTag = `<svg viewBox="0 0 100 100">
  <g id="shapes">
    <rect width="10" height="10" />
    <path d="M 0 0`;

    const repaired = repairIncompleteSvg(cutOffMidTag);
    expect(repaired).not.toContain('<path d="M 0 0');
    expect(repaired).toContain('</g>');
    expect(repaired).toContain('</svg>');
  });
});

describe('detectSnippetFilename', () => {
  it('detects title from HTML/SVG <title> tags without double extensions', () => {
    expect(detectSnippetFilename('<svg><title>Garfield Cat</title></svg>', 'svg', 'svg')).toBe('Garfield Cat.svg');
    expect(detectSnippetFilename('<svg><title>Garfield Cat.svg</title></svg>', 'svg', 'svg')).toBe('Garfield Cat.svg');
    expect(detectSnippetFilename('<html><head><title>Dashboard</title></head></html>', 'html', 'html')).toBe(
      'Dashboard.html',
    );
    expect(detectSnippetFilename('<html><head><title>Dashboard.html</title></head></html>', 'html', 'html')).toBe(
      'Dashboard.html',
    );
  });

  it('detects SVG title from aria-label, id, or desc without double extensions', () => {
    expect(detectSnippetFilename('<svg aria-label="Logo Icon"></svg>', 'svg', 'svg')).toBe('Logo Icon.svg');
    expect(detectSnippetFilename('<svg aria-label="Logo Icon.svg"></svg>', 'svg', 'svg')).toBe('Logo Icon.svg');
    expect(detectSnippetFilename('<svg id="primary-chart"></svg>', 'svg', 'svg')).toBe('primary-chart.svg');
    expect(detectSnippetFilename('<svg><desc>System Architecture.svg</desc></svg>', 'svg', 'svg')).toBe(
      'System Architecture.svg',
    );
  });

  it('detects filename from comments in first 3 lines when extension is compatible', () => {
    expect(detectSnippetFilename('// filename: App.tsx\nimport React from "react";', 'tsx', 'tsx')).toBe('App.tsx');
    expect(detectSnippetFilename('# filename: server.py\nimport os', 'python', 'py')).toBe('server.py');
    expect(detectSnippetFilename('// utils.ts\nexport function test() {}', 'typescript', 'ts')).toBe('utils.ts');
    expect(detectSnippetFilename('# main.py\ndef main(): pass', 'python', 'py')).toBe('main.py');
    expect(detectSnippetFilename('<!-- filename: index.html -->\n<div>hello</div>', 'html', 'html')).toBe('index.html');
  });

  it('appends correct extension when comment specifies filename without extension', () => {
    expect(detectSnippetFilename('// filename: App\nimport React from "react";', 'tsx', 'tsx')).toBe('App.tsx');
    expect(detectSnippetFilename('# filename: my_script\nprint(1)', 'python', 'py')).toBe('my_script.py');
  });

  it('rejects regular sentence comments with numbers or dots to avoid corrupt extensions', () => {
    expect(detectSnippetFilename('// 1. 初始化服务\nconst a = 1;', 'javascript', 'js')).toBe('snippet.js');
    expect(detectSnippetFilename('// 1. First step in algorithm\nconst a = 1;', 'javascript', 'js')).toBe('snippet.js');
    expect(detectSnippetFilename('# 1.0 start server\nimport os', 'python', 'py')).toBe('snippet.py');
    expect(detectSnippetFilename('// e.g. some text\nconst x = 2;', 'javascript', 'js')).toBe('snippet.js');
    expect(detectSnippetFilename('# 3.14159 is pi\nx = 3.14', 'python', 'py')).toBe('snippet.py');
  });

  it('honors explicit markdown fence filenames', () => {
    expect(detectSnippetFilename('import os', 'python', 'py', 'pipeline.py')).toBe('pipeline.py');
    expect(detectSnippetFilename('import os', 'python', 'py', 'pipeline')).toBe('pipeline.py');
    expect(detectSnippetFilename('<div>hello</div>', 'html', 'html', 'index.html')).toBe('index.html');
  });

  it('handles Dockerfile and Makefile correctly', () => {
    expect(detectSnippetFilename('FROM node:18', 'dockerfile', 'dockerfile')).toBe('Dockerfile');
    expect(detectSnippetFilename('all: build', 'makefile', 'mk')).toBe('Makefile');
  });

  it('provides safe fallbacks', () => {
    expect(detectSnippetFilename('console.log(1);', 'javascript', 'js')).toBe('snippet.js');
    expect(detectSnippetFilename('<svg></svg>', 'svg', 'svg')).toBe('vector-graphic.svg');
    expect(detectSnippetFilename('<div>hi</div>', 'html', 'html')).toBe('snippet.html');
  });
});

describe('getSnippetMimeType', () => {
  it('includes charset=utf-8 in MIME types', () => {
    expect(getSnippetMimeType('svg')).toBe('image/svg+xml;charset=utf-8');
    expect(getSnippetMimeType('html')).toBe('text/html;charset=utf-8');
    expect(getSnippetMimeType('javascript')).toBe('application/javascript;charset=utf-8');
    expect(getSnippetMimeType('json')).toBe('application/json;charset=utf-8');
    expect(getSnippetMimeType('python')).toBe('text/plain;charset=utf-8');
  });
});

describe('LANGUAGE_EXTENSION_MAP', () => {
  it('maps common languages properly', () => {
    expect(LANGUAGE_EXTENSION_MAP['amc-live-artifact-html']).toBe('html');
    expect(LANGUAGE_EXTENSION_MAP['svg']).toBe('svg');
    expect(LANGUAGE_EXTENSION_MAP['python']).toBe('py');
    expect(LANGUAGE_EXTENSION_MAP['typescript']).toBe('ts');
    expect(LANGUAGE_EXTENSION_MAP['mermaid']).toBe('mmd');
    expect(LANGUAGE_EXTENSION_MAP['dot']).toBe('dot');
  });
});
