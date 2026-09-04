import { describe, expect, it } from 'vitest';
import { sanitizeElementTree, STREAM_SANITIZER_SCRIPT } from './previewSanitizer';

const parseHtml = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

describe('previewSanitizer', () => {
  it('removes scripts and embeds outside code blocks outright', () => {
    const document = parseHtml(
      '<body><section><script>alert(1)</script><iframe src="https://example.com"></iframe><p>ok</p></section></body>',
    );

    sanitizeElementTree(document);

    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('p')?.textContent).toBe('ok');
  });

  it('keeps scripts shown inside pre/code as inert text instead of deleting the example', () => {
    const document = parseHtml(
      '<body><section><pre><code>&lt;script&gt;window.boot()&lt;/script&gt;\n&lt;iframe src="x"&gt;&lt;/iframe&gt;</code></pre></section></body>',
    );

    sanitizeElementTree(document);

    const code = document.querySelector('code');
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain('window.boot()');
    expect(code?.textContent).toContain('<iframe src="x">');
  });

  it('removes executable script elements that are direct children of pre', () => {
    // The HTML parser keeps <script> as an element inside <pre> even though it
    // is "displayed". The sanitizer must neutralize it (here, turn it into text).
    const document = parseHtml('<body><pre><script>alert(1)</script></pre></body>');

    sanitizeElementTree(document);

    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('pre')?.textContent).toContain('alert(1)');
  });

  it('strips dangerous attributes from elements inside code blocks too', () => {
    const document = parseHtml(
      '<body><pre><code><button onclick="alert(1)" href="javascript:alert(2)">Run</button></code></pre></body>',
    );

    sanitizeElementTree(document);

    const button = document.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.hasAttribute('onclick')).toBe(false);
    expect(button?.hasAttribute('href')).toBe(false);
  });

  it('keeps the streaming sanitizer script consistent with the tree sanitizer', () => {
    // The runner embeds its own copy of sanitizeElementTree. It must perform the
    // same pre/code textification so streaming artifacts do not regress.
    expect(STREAM_SANITIZER_SCRIPT).toContain('codeBlockSelector');
    expect(STREAM_SANITIZER_SCRIPT).toContain(
      "element.replaceWith(document.createTextNode(element.textContent || ''))",
    );
    expect(STREAM_SANITIZER_SCRIPT).toContain(
      'parent.querySelectorAll(dangerousSelector).forEach((element) => element.remove())',
    );
  });
});
