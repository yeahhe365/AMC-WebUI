import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it, vi } from 'vitest';
import { renderBasicMarkdown, type BasicMarkdownRendererTestProps } from '@/test/message/basicMarkdownRenderer';

describe('BasicMarkdownRenderer', () => {
  const renderer = setupTestRenderer();
  const renderMarkdown = (props: BasicMarkdownRendererTestProps) => renderBasicMarkdown(renderer.root, props);

  it('renders bold text when quoted emphasis is adjacent to surrounding CJK text', () => {
    renderMarkdown({ content: '遇到的**“不定式”**问题。' });

    const strong = renderer.container.querySelector('strong');

    expect(renderer.container.textContent).toBe('遇到的“不定式”问题。');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('“不定式”');
  });

  it('renders bold text when wrapped quotes are followed by additional CJK text inside emphasis', () => {
    renderMarkdown({ content: '这句话听起来像是一个**“反差萌”的幽默表达**' });

    const strong = renderer.container.querySelector('strong');

    expect(renderer.container.textContent).toBe('这句话听起来像是一个“反差萌”的幽默表达');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('“反差萌”的幽默表达');
  });

  it('renders bold title text that ends with punctuation before adjacent content', () => {
    renderMarkdown({ content: '**背景：**这是说明。' });

    const strong = renderer.container.querySelector('strong');

    expect(renderer.container.textContent).toBe('背景：这是说明。');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('背景：');
  });

  it('renders wrapped and title-style fallback bold text in the same paragraph', () => {
    renderMarkdown({ content: '先看**“不定式”**，再看**背景：**这是说明。' });

    const strongTexts = Array.from(renderer.container.querySelectorAll('strong')).map((strong) => strong.textContent);

    expect(renderer.container.textContent).toBe('先看“不定式”，再看背景：这是说明。');
    expect(strongTexts).toEqual(['“不定式”', '背景：']);
  });

  it('renders underscored bold text adjacent to CJK text', () => {
    renderMarkdown({ content: '这是__重点__内容。' });

    const strong = renderer.container.querySelector('strong');

    expect(renderer.container.textContent).toBe('这是重点内容。');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('重点');
  });

  it('keeps underscore markers literal inside ASCII identifiers', () => {
    renderMarkdown({ content: 'Keep foo__bar__baz literal.' });

    expect(renderer.container.textContent).toBe('Keep foo__bar__baz literal.');
    expect(renderer.container.querySelector('strong')).toBeNull();
  });

  it('keeps quoted emphasis markers literal inside inline code', () => {
    renderMarkdown({ content: '示例：`遇到的**“不定式”**问题。`' });

    const code = renderer.container.querySelector('code');

    expect(code?.textContent).toBe('遇到的**“不定式”**问题。');
    expect(renderer.container.querySelector('strong')).toBeNull();
  });

  it('preserves html table captions when raw html is allowed', () => {
    renderMarkdown({
      content:
        'Inline raw HTML:\n\n<table><caption>Monthly totals</caption><thead><tr><th>Name</th><th>Total</th></tr></thead><tbody><tr><td>Alice</td><td>42</td></tr></tbody></table>',
      allowHtml: true,
    });

    const caption = renderer.container.querySelector('caption');

    expect(caption).not.toBeNull();
    expect(caption?.textContent).toBe('Monthly totals');
  });

  it('renders generated files inside sanitized tool result blocks', () => {
    renderMarkdown({
      content:
        '<div class="tool-result outcome-ok"><strong>Execution Result (OK):</strong><pre><code>plot saved</code></pre></div>',
      allowHtml: true,
      files: [
        {
          id: 'generated-plot',
          name: 'generated-plot.png',
          type: 'image/png',
          size: 12,
          dataUrl: 'blob:generated-plot',
          uploadState: 'active',
        },
      ],
    });

    const generatedOutputLabel = renderer.container.textContent || '';
    const image = renderer.container.querySelector('img');

    expect(generatedOutputLabel).toContain('Generated Output Files');
    expect(image?.getAttribute('src')).toBe('blob:generated-plot');
  });

  it('renders server code execution blocks inside the code-execution card', () => {
    renderMarkdown({
      content:
        '\n\n<pre class="code-exec-code"><code class="language-python">print(&quot;hi&quot;)&#10;&#10;print(&quot;bye&quot;)</code></pre>\n\n' +
        '\n\n<div class="tool-result outcome-ok"><pre><code class="language-text">hi&#10;bye</code></pre></div>\n\n',
      allowHtml: true,
    });

    const card = renderer.container.querySelector('[data-code-execution="true"]');
    expect(card).not.toBeNull();

    const text = renderer.container.textContent || '';
    expect(text).toContain('Code Execution');
    expect(text).toContain('Execution Complete');
    // Blank code lines survive the single-line HTML block encoding.
    expect(text).toContain('print("hi")');
    expect(text).toContain('print("bye")');
    expect(text).toContain('hi\nbye');

    // Copy + download actions are always reachable (no hover gating).
    expect(renderer.container.querySelector('button[title="Copy Output"]')).not.toBeNull();
    expect(renderer.container.querySelector('button[title="Download Output"]')).not.toBeNull();
  });

  it('hides the legacy baked result header and shows the localized one instead', () => {
    renderMarkdown({
      content:
        '<div class="tool-result outcome-ok"><strong>Execution Result (OUTCOME_OK):</strong><pre><code>out</code></pre></div>',
      allowHtml: true,
    });

    const text = renderer.container.textContent || '';
    expect(text).not.toContain('Execution Result (OUTCOME_OK)');
    expect(text).toContain('Execution Complete');
  });

  it('shows the running state on the code-execution card while the sandbox has no result yet', () => {
    renderMarkdown({
      content: '\n\n<pre class="code-exec-code"><code class="language-python">x = 1</code></pre>\n\n',
      allowHtml: true,
      hasPendingCodeExecution: true,
    });

    const text = renderer.container.textContent || '';
    expect(text).toContain('Running code…');
    expect(renderer.container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('keeps the localized result header for an unknown outcome', () => {
    renderMarkdown({
      content: '<div class="tool-result outcome-outcome_unspecified"><pre><code>?</code></pre></div>',
      allowHtml: true,
    });

    expect(renderer.container.textContent).toContain('Execution Result Unknown');
  });

  it('preserves safe inline styles in allowed raw html', () => {
    renderMarkdown({
      content:
        'Inline raw HTML:\n\n' +
        '<div style="display:flex;gap:12px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:12px;padding:20px 16px">' +
        '<table style="width:100%;border-collapse:collapse;text-align:center">' +
        '<tbody><tr><td style="padding:12px 16px"><span style="background:#e8f5e9;color:#2e7d32;border-radius:20px">Ready</span></td></tr></tbody>' +
        '</table></div>',
      allowHtml: true,
    });

    const wrapper = renderer.container.querySelector('div[style*="display"]');
    const table = renderer.container.querySelector('table');
    const cell = renderer.container.querySelector('td');
    const badge = renderer.container.querySelector('span');
    const wrapperStyle = wrapper?.getAttribute('style')?.replace(/\s+/g, '');
    const tableStyle = table?.getAttribute('style')?.replace(/\s+/g, '');
    const cellStyle = cell?.getAttribute('style')?.replace(/\s+/g, '');
    const badgeStyle = badge?.getAttribute('style')?.replace(/\s+/g, '');

    expect(wrapperStyle).toContain('display:flex');
    expect(wrapperStyle).toContain('background:linear-gradient(135deg');
    expect(wrapperStyle).toContain('border-radius:12px');
    expect(tableStyle).toContain('border-collapse:collapse');
    expect(cellStyle).toContain('padding:12px16px');
    expect(badgeStyle).toContain('border-radius:20px');
  });

  it('preserves richer safe controls and svg primitives in allowed raw html', () => {
    renderMarkdown({
      content:
        'Inline raw HTML:\n\n' +
        '<section style="display:grid;grid-template-columns:1fr auto;align-content:center;justify-items:start;aspect-ratio:2/1">' +
        '<label for="tone">Tone</label>' +
        '<input id="tone" type="range" min="0" max="10" value="7" aria-label="Tone" />' +
        '<button type="button" disabled>Preview</button>' +
        '<progress value="70" max="100">70%</progress>' +
        '<meter min="0" max="100" value="70">70</meter>' +
        '<svg viewBox="0 0 120 40" width="120" height="40" role="img" aria-label="trend">' +
        '<rect x="0" y="0" width="120" height="40" fill="#eef2ff" />' +
        '<circle cx="24" cy="20" r="8" fill="#4f46e5" />' +
        '<text x="42" y="24" fill="#111827">OK</text>' +
        '</svg>' +
        '</section>',
      allowHtml: true,
    });

    const sectionStyle = renderer.container.querySelector('section')?.getAttribute('style')?.replace(/\s+/g, '');

    expect(sectionStyle).toContain('display:grid');
    expect(sectionStyle).toContain('grid-template-columns:1frauto');
    expect(sectionStyle).toContain('align-content:center');
    expect(sectionStyle).toContain('justify-items:start');
    expect(sectionStyle).toContain('aspect-ratio:2/1');
    expect(renderer.container.querySelector('label')?.getAttribute('for')).toBe('tone');
    expect(renderer.container.querySelector('input[type="range"]')?.getAttribute('value')).toBe('7');
    expect(renderer.container.querySelector('button[disabled]')?.textContent).toBe('Preview');
    expect(renderer.container.querySelector('progress')?.getAttribute('value')).toBe('70');
    expect(renderer.container.querySelector('meter')?.getAttribute('value')).toBe('70');
    expect(renderer.container.querySelector('rect')?.getAttribute('fill')).toBe('#eef2ff');
    expect(renderer.container.querySelector('circle')?.getAttribute('r')).toBe('8');
    expect(renderer.container.querySelector('text')?.textContent).toBe('OK');
  });

  it('marks styled raw html tables as rich tables so inline styles can win', () => {
    renderMarkdown({
      content:
        'Inline raw HTML:\n\n' +
        '<table style="width:100%;border-collapse:collapse;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08)">' +
        '<thead><tr style="background:#1a1a2e;color:#fff"><th style="padding:12px 16px;background:#16213e">React</th></tr></thead>' +
        '<tbody><tr style="background:#fafafa"><td style="color:#2e7d32;font-weight:600">Ready</td></tr></tbody>' +
        '</table>',
      allowHtml: true,
    });

    const table = renderer.container.querySelector('table');
    const tableWrapper = renderer.container.querySelector('[data-rich-html-table-container="true"]');

    expect(table).not.toBeNull();
    expect(table?.className).toContain('rich-html-table');
    expect(table?.className).not.toContain('w-max');
    expect(tableWrapper).not.toBeNull();
  });

  it('keeps markdown tables on the standard table styling path', () => {
    renderMarkdown({ content: '| Name | Total |\n|---|---:|\n| Alice | 42 |', allowHtml: true });

    const table = renderer.container.querySelector('table');

    expect(table).not.toBeNull();
    expect(table?.className).not.toContain('rich-html-table');
    // Markdown tables carry no data-layout attribute; column sizing is
    // table-layout: auto in CSS.
    expect(table?.getAttribute('data-layout')).toBeNull();
  });

  it('strips raw html positioning attributes that can escape the markdown surface', () => {
    renderMarkdown({
      content:
        'Inline raw HTML:\n\n<section id="danger-zone" class="fixed inset-0 z-[9999]" style="position:fixed;inset:0">Safe text</section>',
      allowHtml: true,
    });

    const section = renderer.container.querySelector('section');

    expect(section).not.toBeNull();
    expect(section?.getAttribute('id')).toBeNull();
    expect(section?.getAttribute('class') ?? '').not.toContain('fixed');
    expect(section?.getAttribute('class') ?? '').not.toContain('z-[9999]');
    expect(section?.getAttribute('style')).toBeNull();
    expect(section?.textContent).toBe('Safe text');
  });

  it('keeps escaped dollar delimiters literal in prose', () => {
    renderMarkdown({ content: 'Price is \\$5\\$ today.' });

    expect(renderer.container.textContent).toContain('Price is $5$ today.');
    expect(renderer.container.textContent).not.toContain('Price is (5) today.');
  });

  it('keeps thinking tags literal inside inline code examples', () => {
    renderMarkdown({ content: '示例：`<thinking>secret</thinking>`', hideThinkingInContext: true });

    const code = renderer.container.querySelector('code');

    expect(code?.textContent).toBe('<thinking>secret</thinking>');
    expect(renderer.container.querySelector('details')).toBeNull();
  });

  it('keeps thinking tags literal inside fenced code blocks', () => {
    renderMarkdown({ content: '```html\n<thinking>secret</thinking>\n```', hideThinkingInContext: true });

    expect(renderer.container.querySelector('details')).toBeNull();
    expect(renderer.container.textContent).toContain('<thinking>secret</thinking>');
  });

  it('keeps all raw html pre children when html is allowed', () => {
    renderMarkdown({ content: '<pre><span>alpha</span>beta</pre>', allowHtml: true });

    expect(renderer.container.textContent).toContain('alpha');
    expect(renderer.container.textContent).toContain('beta');
  });

  it('does not make markdown images clickable when interactive mode is disabled', () => {
    const handleImageClick = vi.fn();

    renderMarkdown({
      content: '![Diagram](data:image/png;base64,ZmFrZQ==)',
      onImageClick: handleImageClick,
      interactiveMode: 'disabled',
    });

    const image = renderer.container.querySelector('img');

    expect(image).not.toBeNull();
    expect(image?.className).not.toContain('cursor-pointer');

    act(() => {
      image?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(handleImageClick).not.toHaveBeenCalled();
  });

  it('renders inline image locate button when link href starts with #image-seek', () => {
    renderMarkdown({
      content: '[图表定位](#image-seek?file=chart.png&box=100%2C200%2C300%2C400)',
    });

    const button = renderer.container.querySelector('[data-testid="inline-image-locate-btn"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('图表定位');
  });
});
