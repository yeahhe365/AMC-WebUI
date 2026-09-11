import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { UrlContextModal } from './UrlContextModal';

describe('UrlContextModal', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('renders modal with tips and disabled insert button initially', () => {
    act(() => {
      renderer.root.render(<UrlContextModal isOpen={true} onClose={() => {}} />);
    });

    expect(document.body.textContent).toContain('URL Context');
    expect(document.body.textContent).toContain('Capabilities & Limits');
    expect(document.body.textContent).toContain('Up to 20 URLs per prompt request');
    expect(document.body.textContent).toContain('Maximum 34MB content size per URL');

    const allButtons = Array.from(document.body.querySelectorAll('button'));
    const insert = allButtons.find((b) => b.textContent?.includes('Insert into Prompt'));
    expect(insert?.disabled).toBe(true);
  });

  it('parses valid and invalid URLs and handles insertion and tool enablement', () => {
    const onInsertUrls = vi.fn();
    const onEnableTool = vi.fn();
    const onClose = vi.fn();

    act(() => {
      renderer.root.render(
        <UrlContextModal
          isOpen={true}
          onClose={onClose}
          onInsertUrls={onInsertUrls}
          onEnableTool={onEnableTool}
          isToolEnabled={false}
        />,
      );
    });

    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    act(() => {
      // Enter valid url, localhost url, and youtube url
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(
        textarea,
        'https://example.com/api\nhttp://localhost:3000\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('1 valid URL(s)');
    expect(document.body.textContent).toContain('2 invalid');
    expect(document.body.textContent).toContain('example.com/api');
    expect(document.body.textContent).toContain('Localhost');
    expect(document.body.textContent).toContain('YouTube');

    const allButtons = Array.from(document.body.querySelectorAll('button'));
    const insertBtn = allButtons.find((b) => b.textContent?.includes('Insert into Prompt'));
    expect(insertBtn?.disabled).toBe(false);

    act(() => {
      insertBtn?.click();
    });

    expect(onInsertUrls).toHaveBeenCalledTimes(1);
    expect(onInsertUrls).toHaveBeenCalledWith(['https://example.com/api']);
    expect(onEnableTool).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('displays warning when exceeding 20 URLs limit', () => {
    act(() => {
      renderer.root.render(<UrlContextModal isOpen={true} onClose={() => {}} />);
    });

    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement;
    const urls = Array.from({ length: 22 }, (_, i) => `https://site.org/page-${i}`).join('\n');

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, urls);
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(document.body.textContent).toContain(
      'Gemini supports up to 20 URLs per request. Extra URLs may be ignored.',
    );
  });
});
