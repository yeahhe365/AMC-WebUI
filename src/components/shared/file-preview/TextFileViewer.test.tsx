import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadedFile } from '@/types';
import { TextFileViewer, resolveFileLanguage } from './TextFileViewer';

const { mockLazyMarkdownRenderer } = vi.hoisted(() => ({
  mockLazyMarkdownRenderer: vi.fn(
    ({ content, themeId, interactiveMode }: { content: string; themeId: string; interactiveMode?: string }) => (
      <div data-testid="markdown-renderer" data-theme-id={themeId} data-interactive-mode={interactiveMode}>
        {content}
      </div>
    ),
  ),
}));

vi.mock('@/components/message/LazyMarkdownRenderer', () => ({
  LazyMarkdownRenderer: mockLazyMarkdownRenderer,
}));

describe('TextFileViewer', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  const createMarkdownFile = (): UploadedFile => ({
    id: 'markdown-file',
    name: 'notes.md',
    type: 'text/markdown',
    size: 128,
    uploadState: 'active',
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders markdown content inside a theme-aware preview surface', () => {
    act(() => {
      renderer.root.render(
        <TextFileViewer file={createMarkdownFile()} content="# Preview title" renderMode="markdown" themeId="pearl" />,
      );
    });

    const markdownRenderer = renderer.container.querySelector('[data-testid="markdown-renderer"]');

    expect(markdownRenderer).not.toBeNull();
    expect(markdownRenderer?.getAttribute('data-theme-id')).toBe('pearl');
    expect(markdownRenderer?.getAttribute('data-interactive-mode')).toBe('disabled');
    expect(markdownRenderer?.parentElement?.className).toContain('bg-[var(--theme-bg-primary)]');
    expect(renderer.container.textContent).toContain('Preview');
    expect(renderer.container.textContent).toContain('Source');
  });

  it('falls back to plain text for large markdown files until the user opts in to rich rendering', () => {
    const largeMarkdown = `${'# Heading\n\n'}${'Paragraph line\n'.repeat(5000)}`;

    act(() => {
      renderer.root.render(
        <TextFileViewer file={createMarkdownFile()} content={largeMarkdown} renderMode="markdown" themeId="pearl" />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="markdown-renderer"]')).toBeNull();
    expect(renderer.container.textContent).toContain('Large Markdown file detected');
    expect(renderer.container.textContent).toContain('Render Markdown anyway');
    expect(renderer.container.textContent).toContain('# Heading');

    const button = Array.from(renderer.container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('Render Markdown anyway'),
    );

    expect(button).not.toBeUndefined();

    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(renderer.container.querySelector('[data-testid="markdown-renderer"]')).not.toBeNull();
  });

  describe('resolveFileLanguage', () => {
    it('resolves languages accurately from file extensions', () => {
      expect(resolveFileLanguage('index.html')).toBe('html');
      expect(resolveFileLanguage('style.css')).toBe('css');
      expect(resolveFileLanguage('schema.sql')).toBe('sql');
      expect(resolveFileLanguage('icon.svg')).toBe('xml');
      expect(resolveFileLanguage('doc.xml')).toBe('xml');
      expect(resolveFileLanguage('main.rs')).toBe('rust');
      expect(resolveFileLanguage('main.cpp')).toBe('cpp');
      expect(resolveFileLanguage('server.go')).toBe('go');
      expect(resolveFileLanguage('App.java')).toBe('java');
      expect(resolveFileLanguage('index.php')).toBe('php');
      expect(resolveFileLanguage('config.yaml')).toBe('yaml');
      expect(resolveFileLanguage('readme.md')).toBe('markdown');
      expect(resolveFileLanguage('script.py')).toBe('python');
      expect(resolveFileLanguage('app.tsx')).toBe('typescript');
      expect(resolveFileLanguage('app.js')).toBe('javascript');
    });

    it('falls back to MIME type when file extension is absent or unmapped', () => {
      expect(resolveFileLanguage('blob', 'text/html')).toBe('html');
      expect(resolveFileLanguage('blob', 'application/json')).toBe('json');
      expect(resolveFileLanguage('blob', 'text/x-python')).toBe('python');
      expect(resolveFileLanguage('blob', 'image/svg+xml')).toBe('xml');
      expect(resolveFileLanguage('unknown.bin', 'application/octet-stream')).toBe('plaintext');
    });
  });
});
