import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it } from 'vitest';
import { LanguageIcon } from './LanguageIcon';

describe('LanguageIcon', () => {
  const renderer = setupTestRenderer();

  const renderIcon = (language: string) => {
    act(() => {
      renderer.root.render(<LanguageIcon language={language} />);
    });
  };

  const svgPaths = (icon: Element | null) => icon?.querySelectorAll('path').length ?? 0;

  it('renders a branded Python badge with a normalized display label', () => {
    renderIcon('py');

    const badge = renderer.container.querySelector('[data-language-badge="python"]');
    const icon = renderer.container.querySelector('[data-language-icon="python"]');
    const meta = renderer.container.querySelector('[data-language-meta]');
    const svg = icon?.querySelector('svg');

    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Python');
    expect(badge?.className.split(/\s+/)).toContain('gap-1.5');
    expect(icon).not.toBeNull();
    expect(icon?.className.split(/\s+/)).toContain('h-5');
    // Slot is height-fixed only; SVG icons keep intrinsic 20×20
    expect(icon?.className.split(/\s+/)).not.toContain('w-5');
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
    // Material-icon-theme python icon is a 24×24 monochrome SVG
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svgPaths(icon)).toBeGreaterThan(0);
    expect(meta).not.toBeNull();
    expect(meta?.className.split(/\s+/)).toContain('inline-flex');
    expect(meta?.className.split(/\s+/)).toContain('items-center');
    expect(meta?.textContent).not.toContain('PY');
  });

  it('renders a single TSX label with the react-ts material icon', () => {
    renderIcon('tsx');

    const badge = renderer.container.querySelector('[data-language-badge="tsx"]');
    const icon = renderer.container.querySelector('[data-language-icon="react-ts"]');
    const meta = renderer.container.querySelector('[data-language-meta]');

    expect(badge).not.toBeNull();
    expect(meta?.textContent?.trim()).toBe('TSX');
    expect(badge?.textContent).not.toContain('TypeScript React');
    expect(icon?.querySelector('svg')?.getAttribute('width')).toBe('20');
    expect(icon?.querySelector('svg')?.getAttribute('height')).toBe('20');
  });

  it('renders a single React label without a redundant JSX compact tag', () => {
    renderIcon('jsx');

    const meta = renderer.container.querySelector('[data-language-meta]');
    const icon = renderer.container.querySelector('[data-language-icon="react"]');

    expect(meta?.textContent?.trim()).toBe('React');
    expect(meta?.textContent).not.toMatch(/JSX/i);
    expect(icon?.querySelector('svg')?.getAttribute('width')).toBe('20');
    expect(icon?.querySelector('svg')?.getAttribute('height')).toBe('20');
  });

  it('avoids redundant compact labels for diagram and markdown languages', () => {
    const cases: Array<{ language: string; expected: string; forbidden?: RegExp }> = [
      { language: 'dot', expected: 'DOT' },
      { language: 'graphviz', expected: 'GraphvizDOT' }, // Graphviz + compact DOT
      { language: 'mermaid', expected: 'Mermaid' },
      { language: 'markdown', expected: 'Markdown' },
      { language: 'md', expected: 'Markdown' },
    ];

    cases.forEach(({ language, expected, forbidden }) => {
      renderIcon(language);

      const meta = renderer.container.querySelector('[data-language-meta]');
      expect(meta?.textContent?.replace(/\s+/g, '')).toBe(expected);
      if (forbidden) {
        expect(meta?.textContent).not.toMatch(forbidden);
      }
    });
  });

  it('renders material SVG icons for JavaScript and CSS instead of text glyphs', () => {
    renderIcon('css');

    const cssIcon = renderer.container.querySelector('[data-language-icon="css"]');

    expect(cssIcon).not.toBeNull();
    expect(cssIcon?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 32 32');
    expect(cssIcon?.querySelector('svg')).not.toBeNull();
    expect(cssIcon?.querySelector('span')).toBeNull(); // no TextGlyph

    renderIcon('js');

    const jsIcon = renderer.container.querySelector('[data-language-icon="javascript"]');

    expect(jsIcon).not.toBeNull();
    expect(jsIcon?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(jsIcon?.querySelector('svg')).not.toBeNull();
    expect(jsIcon?.querySelector('span')).toBeNull(); // no TextGlyph
  });

  it('renders TypeScript code blocks with the SVG language icon', () => {
    renderIcon('typescript');

    const badge = renderer.container.querySelector('[data-language-badge="typescript"]');
    const icon = renderer.container.querySelector('[data-language-icon="typescript"]');

    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('TypeScript');
    expect(icon?.querySelector('svg')?.getAttribute('width')).toBe('20');
    expect(icon?.querySelector('svg')?.getAttribute('height')).toBe('20');
    expect(icon?.textContent).not.toContain('TS');
  });

  it('renders dedicated SVG icons for common code block languages', () => {
    const cases = [
      ['go', 'go', 'Go'],
      ['golang', 'go', 'Go'],
      ['rust', 'rust', 'Rust'],
      ['rs', 'rust', 'Rust'],
      ['java', 'java', 'Java'],
      ['cs', 'csharp', 'C#'],
      ['csharp', 'csharp', 'C#'],
      ['kotlin', 'kotlin', 'Kotlin'],
      ['kt', 'kotlin', 'Kotlin'],
      ['ruby', 'ruby', 'Ruby'],
      ['rb', 'ruby', 'Ruby'],
      ['php', 'php', 'PHP'],
      ['swift', 'swift', 'Swift'],
      ['dart', 'dart', 'Dart'],
      ['lua', 'lua', 'Lua'],
      ['c', 'c', 'C'],
      ['cpp', 'cpp', 'C++'],
      ['c++', 'cpp', 'C++'],
      ['sql', 'database', 'SQL'],
      ['postgresql', 'database', 'SQL'],
      ['bash', 'console', 'Shell'],
      ['powershell', 'powershell', 'PowerShell'],
      ['ps1', 'powershell', 'PowerShell'],
      ['yaml', 'yaml', 'YAML'],
      ['toml', 'toml', 'TOML'],
      ['ini', 'settings', 'INI'],
    ];

    cases.forEach(([language, iconId, label]) => {
      renderIcon(language);

      const icon = renderer.container.querySelector(`[data-language-icon="${iconId}"]`);
      const badge = renderer.container.querySelector('[data-language-badge]');

      expect(badge?.textContent).toContain(label);
      expect(icon?.querySelector('svg')?.getAttribute('width')).toBe('20');
      expect(icon?.querySelector('svg')?.getAttribute('height')).toBe('20');
    });
  });

  it('falls back to a generic code badge for unknown languages', () => {
    renderIcon('brainfuck');

    const badge = renderer.container.querySelector('[data-language-badge="brainfuck"]');
    const icon = renderer.container.querySelector('[data-language-icon="generic"]');

    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('brainfuck');
    expect(icon).not.toBeNull();
    expect(icon?.querySelector('svg')?.getAttribute('width')).toBe('20');
  });
});
