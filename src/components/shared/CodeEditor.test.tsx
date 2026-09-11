import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { setupTestRenderer } from '@/test/render/renderer';
import { CodeEditor, getLanguageExtension } from './CodeEditor';

describe('CodeEditor getLanguageExtension', () => {
  it('returns valid language extension for JavaScript and TypeScript aliases', () => {
    const jsAliases = ['javascript', 'js', 'jsx', 'ts', 'typescript', 'tsx', 'mjs', 'cjs', 'node'];
    for (const alias of jsAliases) {
      const ext = getLanguageExtension(alias);
      expect(ext, `Failed for ${alias}`).not.toBeNull();
    }
  });

  it('returns valid language extension for HTML and HTM', () => {
    expect(getLanguageExtension('html')).not.toBeNull();
    expect(getLanguageExtension('htm')).not.toBeNull();
    expect(getLanguageExtension('HTML')).not.toBeNull();
    expect(getLanguageExtension('language-html')).not.toBeNull();
    expect(getLanguageExtension('.html')).not.toBeNull();
  });

  it('returns valid language extension for CSS, SCSS, LESS', () => {
    expect(getLanguageExtension('css')).not.toBeNull();
    expect(getLanguageExtension('scss')).not.toBeNull();
    expect(getLanguageExtension('less')).not.toBeNull();
  });

  it('returns valid language extension for XML and SVG', () => {
    expect(getLanguageExtension('xml')).not.toBeNull();
    expect(getLanguageExtension('svg')).not.toBeNull();
  });

  it('returns valid language extension for Markdown', () => {
    expect(getLanguageExtension('markdown')).not.toBeNull();
    expect(getLanguageExtension('md')).not.toBeNull();
  });

  it('returns valid language extension for SQL and SQL dialects', () => {
    expect(getLanguageExtension('sql')).not.toBeNull();
    expect(getLanguageExtension('mysql')).not.toBeNull();
    expect(getLanguageExtension('pgsql')).not.toBeNull();
    expect(getLanguageExtension('postgres')).not.toBeNull();
    expect(getLanguageExtension('postgresql')).not.toBeNull();
    expect(getLanguageExtension('sqlite')).not.toBeNull();
  });

  it('returns valid language extension for Python, JSON, C/C++, Rust, Java, PHP, YAML, Go', () => {
    expect(getLanguageExtension('python')).not.toBeNull();
    expect(getLanguageExtension('py')).not.toBeNull();
    expect(getLanguageExtension('json')).not.toBeNull();
    expect(getLanguageExtension('jsonc')).not.toBeNull();
    expect(getLanguageExtension('cpp')).not.toBeNull();
    expect(getLanguageExtension('c')).not.toBeNull();
    expect(getLanguageExtension('rust')).not.toBeNull();
    expect(getLanguageExtension('rs')).not.toBeNull();
    expect(getLanguageExtension('java')).not.toBeNull();
    expect(getLanguageExtension('php')).not.toBeNull();
    expect(getLanguageExtension('yaml')).not.toBeNull();
    expect(getLanguageExtension('yml')).not.toBeNull();
    expect(getLanguageExtension('go')).not.toBeNull();
  });

  it('returns null for unsupported or plain text languages', () => {
    expect(getLanguageExtension('plaintext')).toBeNull();
    expect(getLanguageExtension('txt')).toBeNull();
    expect(getLanguageExtension('unknown-lang-xyz')).toBeNull();
    expect(getLanguageExtension('')).toBeNull();
  });
});

describe('CodeEditor component', () => {
  const renderer = setupTestRenderer();

  it('renders CodeEditor component with html language without errors', () => {
    act(() => {
      renderer.root.render(
        <CodeEditor value="<div>Hello World</div>" onChange={() => {}} language="html" readOnly={true} />,
      );
    });
    expect(renderer.container).toBeDefined();
    expect(renderer.container.querySelector('.cm-editor')).not.toBeNull();
  });
});
