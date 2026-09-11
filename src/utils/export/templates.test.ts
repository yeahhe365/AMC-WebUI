import { describe, expect, it } from 'vitest';
import { generateExportHtmlTemplate } from './templates';

describe('generateExportHtmlTemplate', () => {
  it('does not depend on remote CDN scripts for syntax highlighting', () => {
    const html = generateExportHtmlTemplate({
      title: 'Test Export',
      date: '2026-04-11 12:00:00',
      model: 'gemini-test',
      contentHtml: '<pre><code class="hljs language-ts">const x = 1;</code></pre>',
      styles: '<style>.hljs { color: red; }</style>',
      themeId: 'onyx',
      language: 'en',
      rootBgColor: '#000000',
      bodyClasses: 'antialiased',
    });

    expect(html).not.toContain('cdnjs.cloudflare.com');
    expect(html).not.toContain('highlight.min.js');
  });

  it('does not rely on stale message animation class names when exporting', () => {
    const html = generateExportHtmlTemplate({
      title: 'Test Export',
      date: '2026-04-11 12:00:00',
      model: 'gemini-test',
      contentHtml: '<div data-message-id="1">hello</div>',
      styles: '',
      themeId: 'onyx',
      language: 'en',
      rootBgColor: '#000000',
      bodyClasses: 'antialiased',
    });

    expect(html).not.toContain('message-container-animate');
  });

  it('escapes metadata inserted into the exported HTML shell', () => {
    const html = generateExportHtmlTemplate({
      title: '<img src=x onerror=alert(1)>',
      date: '2026-04-26 <script>alert(2)</script>',
      model: 'gemini"><script>alert(3)</script>',
      contentHtml: '<div data-message-id="1">safe content</div>',
      styles: '',
      themeId: 'pearl',
      language: 'en',
      rootBgColor: '#ffffff',
      bodyClasses: 'antialiased',
    });

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('2026-04-26 &lt;script&gt;alert(2)&lt;/script&gt;');
    expect(html).toContain('gemini&quot;&gt;&lt;script&gt;alert(3)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>alert(3)</script>');
  });

  it('neutralizes CSS-breakout payloads in rootBgColor injected into the style block', () => {
    const html = generateExportHtmlTemplate({
      title: 'safe',
      date: '2026-04-26',
      model: 'gemini-test',
      contentHtml: '<div>content</div>',
      styles: '',
      themeId: 'onyx',
      language: 'en',
      rootBgColor: 'red;} body{background:url(https://evil/?leak)/*',
      bodyClasses: 'antialiased',
    });

    expect(html).not.toContain('https://evil/?leak');
    expect(html).not.toContain('red;}');
  });

  it('includes graphviz overflow containment styles and interactive diagram viewer script', () => {
    const html = generateExportHtmlTemplate({
      title: 'Diagram Export',
      date: '2026-04-26',
      model: 'gemini-test',
      contentHtml: '<div data-amc-graphviz="digraph { A -> B }"><svg></svg></div>',
      styles: '',
      themeId: 'pearl',
      language: 'zh-CN',
      rootBgColor: '#ffffff',
      bodyClasses: '',
    });

    expect(html).toContain('[data-amc-graphviz]');
    expect(html).toContain('overflow-x: auto !important');
    expect(html).toContain('max-width: 100% !important');
    expect(html).toContain('amc-diagram-modal-backdrop');
    expect(html).toContain('amc-diagram-modal-canvas');
    expect(html).toContain('openModal(svg)');
  });
});
