import { describe, expect, it } from 'vitest';
import {
  extractAutoPreviewableBlock,
  getAutoPreviewType,
  getCodeBlockPreviewType,
  isLikelyHtml,
  isLikelyStreamingHtmlArtifact,
  normalizePreviewableMarkdownContent,
} from './previewableMarkdown';

describe('auto-preview strict detection (no content sniffing of mislabeled languages)', () => {
  it('never auto-preview mislabeled fenced blocks with an explicit non-HTML language', () => {
    expect(getAutoPreviewType('<div>Ready</div>', 'python')).toBeNull();
    expect(getAutoPreviewType('<table><tr><td>x</td></tr></table>', 'text')).toBeNull();
    expect(getAutoPreviewType('<button>Go</button>', 'css')).toBeNull();
  });

  it('auto-previews fenced blocks with explicit html/svg languages', () => {
    expect(getAutoPreviewType('<div>Ready</div>', 'html')).toBe('html');
    expect(getAutoPreviewType('<div>Ready</div>', 'HTML')).toBe('html');
    expect(getAutoPreviewType('<div>Ready</div>', 'htm')).toBe('html');
    expect(getAutoPreviewType('<svg viewBox="0 0 10 10"></svg>', 'svg')).toBe('svg');
  });

  it('never auto-previews Live Artifact fences (inline ArtifactFrame only, no modal)', () => {
    // amc-live-artifact-html blocks render inline via ArtifactFrame and must
    // never trigger the automatic fullscreen preview modal. Bare HTML model
    // replies are wrapped into this fence by normalizePreviewableMarkdownContent,
    // so they are excluded from auto-open here too.
    expect(getAutoPreviewType('<div>Ready</div>', 'amc-live-artifact-html')).toBeNull();
    expect(extractAutoPreviewableBlock('```amc-live-artifact-html\n<div>Ready</div>\n```')).toBeNull();
  });

  it('never auto-previews amc-live-artifact-interaction fences (interaction forms never auto-open)', () => {
    const interactionJson = JSON.stringify({
      instruction: 'Collect writing options',
      schema: { type: 'object', properties: { tone: { type: 'string' } } },
    });

    expect(getAutoPreviewType(interactionJson, 'amc-live-artifact-interaction')).toBeNull();
    expect(extractAutoPreviewableBlock(`\`\`\`amc-live-artifact-interaction\n${interactionJson}\n\`\`\``)).toBeNull();
  });

  it('does not auto-open bare full HTML documents wrapped as live artifacts', () => {
    // normalizePreviewableMarkdownContent wraps bare HTML documents into the
    // amc-live-artifact-html fence, so by the time the auto-open path runs they
    // are Live Artifacts and must not open the preview modal.
    const wrapped = normalizePreviewableMarkdownContent('<!DOCTYPE html><html><body>hi</body></html>');
    expect(extractAutoPreviewableBlock(wrapped)).toBeNull();
  });

  it('auto-previews unlabeled fenced blocks only when they are full HTML/SVG documents', () => {
    expect(getAutoPreviewType('<html><body>Hello</body></html>', '')).toBe('html');
    expect(getAutoPreviewType('<svg viewBox="0 0 10 10"><circle r="4" /></svg>', '')).toBe('svg');
    expect(getAutoPreviewType('<div>Ready</div>', '')).toBeNull();
  });

  it('extracts only strict auto-preview targets from mixed markdown', () => {
    expect(
      extractAutoPreviewableBlock('Intro\n\n```python\n<div>Ready</div>\n```\n\n```html\n<span>Go</span>\n```'),
    ).toEqual({ content: '<span>Go</span>', markupType: 'html' });
    expect(extractAutoPreviewableBlock('```text\n<table><tr><td>x</td></tr></table>\n```')).toBeNull();
    expect(extractAutoPreviewableBlock('```css\n<button>Go</button>\n```')).toBeNull();
  });

  it('falls back to a full unlabeled HTML/SVG document but not a bare fragment', () => {
    expect(extractAutoPreviewableBlock('<!DOCTYPE html><html><body>Hello</body></html>')).toEqual({
      content: '<!DOCTYPE html><html><body>Hello</body></html>',
      markupType: 'html',
    });
    expect(extractAutoPreviewableBlock('<div>Ready</div>')).toBeNull();
  });

  it('keeps the manual preview path (getCodeBlockPreviewType) lenient for mislabeled fragments', () => {
    // Manual preview button behavior must be preserved.
    expect(getCodeBlockPreviewType('<div style="display:flex"><span>Ready</span></div>', 'css')).toBe('html');
  });
});

describe('previewableMarkdown detection', () => {
  it('only treats standalone html documents as previewable html by content', () => {
    expect(getCodeBlockPreviewType('  <html><body>Hello</body></html>  ')).toBe('html');
    expect(getCodeBlockPreviewType('const tpl = `<html><body>Hello</body></html>`;')).toBe(null);
  });

  it('treats standalone svg markup as previewable content', () => {
    expect(getCodeBlockPreviewType('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>')).toBe('svg');
  });

  it('treats standalone html fragments as previewable even when the fence language is wrong', () => {
    const fragment = '<div style="display:flex;gap:12px"><span>Ready</span></div>';

    expect(getCodeBlockPreviewType(fragment, 'css')).toBe('html');
  });

  it('treats richer inline artifact primitives as previewable html fragments', () => {
    expect(getCodeBlockPreviewType('<label for="tone">Tone</label>')).toBe('html');
    expect(getCodeBlockPreviewType('<progress value="70" max="100">70%</progress>')).toBe('html');
    expect(getCodeBlockPreviewType('<meter min="0" max="100" value="70">70</meter>')).toBe('html');
  });

  it('does not treat embedded html strings inside code as previewable fragments', () => {
    expect(getCodeBlockPreviewType('const card = `<div>Ready</div>`;', 'js')).toBe(null);
  });

  it('removes markdown-breaking blank lines inside standalone raw html fragments', () => {
    const fragment = `<div style="padding:24px">
  <section style="background:white">
    <p>Transformer summary</p>
  </section>

  <!-- 三大核心特性 -->
  <div style="display:grid">
    <strong>Self-Attention</strong>
  </div>
</div>`;

    expect(normalizePreviewableMarkdownContent(fragment)).toBe(`\`\`\`amc-live-artifact-html
<div style="padding:24px">
  <section style="background:white">
    <p>Transformer summary</p>
  </section>
  <!-- 三大核心特性 -->
  <div style="display:grid">
    <strong>Self-Attention</strong>
  </div>
</div>
\`\`\``);
  });

  it('leaves a leading prose + bare fragment inline instead of promoting it to a Live Artifact', () => {
    const fragment = '<section style="display:grid"><strong>Inline Artifact</strong></section>';

    // Inline "prose + HTML" is intentionally rendered as rich markdown (with
    // theme tokens from the main page), not promoted into an artifact frame.
    expect(normalizePreviewableMarkdownContent(`已为你生成：\n${fragment}`)).toBe(`已为你生成：\n${fragment}`);
  });

  it('wraps a full html document that has trailing prose after </html>', () => {
    const document = '<!DOCTYPE html><html><head><title>Live</title></head><body><main>Hello</main></body></html>';

    expect(normalizePreviewableMarkdownContent(`${document}Done!`)).toBe(
      `\`\`\`amc-live-artifact-html
${document}
\`\`\`

Done!`,
    );
  });

  it('still treats a full html document with only trailing comments as one artifact', () => {
    const document = '<html><body><p>Hello</p></body></html>';

    expect(normalizePreviewableMarkdownContent(`${document}<!-- end -->`)).toBe(
      `\`\`\`amc-live-artifact-html
${document}<!-- end -->
\`\`\``,
    );
  });

  it('removes markdown-breaking blank lines inside streaming raw html fragments before they close', () => {
    const fragment = `<div style="padding:24px">
    <section style="background:white">
        <p>Transformer summary</p>
    </section>

    <!-- 三大核心特性 -->
    <div style="display:grid">
        <strong>Self-Attention</strong>`;

    expect(normalizePreviewableMarkdownContent(fragment)).toBe(`<div style="padding:24px">
    <section style="background:white">
        <p>Transformer summary</p>
    </section>
    <!-- 三大核心特性 -->
    <div style="display:grid">
        <strong>Self-Attention</strong>`);
  });

  it('wraps streaming raw html fragments in stable Live Artifact fences when loading', () => {
    const fragment = `<div style="padding:24px">
    <section style="background:white">
        <p>Transformer summary</p>
    </section>

    <!-- 三大核心特性 -->
    <div style="display:grid">
        <strong>Self-Attention</strong>`;

    expect(normalizePreviewableMarkdownContent(fragment, { isStreaming: true })).toBe(`\`\`\`amc-live-artifact-html
<div style="padding:24px">
    <section style="background:white">
        <p>Transformer summary</p>
    </section>
    <!-- 三大核心特性 -->
    <div style="display:grid">
        <strong>Self-Attention</strong>
\`\`\``);
  });

  it('wraps streaming full html documents before the closing html tag arrives', () => {
    const partialDocument = '<!DOCTYPE html><html><head><title>Live</title></head><body><main>Loading';

    expect(normalizePreviewableMarkdownContent(partialDocument, { isStreaming: true })).toBe(
      `\`\`\`amc-live-artifact-html\n${partialDocument}\n\`\`\``,
    );
  });

  it('keeps bare mislabeled html fragments fenced when they carry no Live Artifact marker', () => {
    const fragment =
      '<!-- 核心定义卡片 -->\n<div style="padding:20px;background:#f9fafb"><strong>Transformer</strong></div>';

    // 收紧后的判定:裸片段无 LA 标记、也不是完整文档,意图不可区分,一律按
    // 源码显示(该特性引入前的行为)。手动预览按钮仍可用(见下方断言)。
    expect(normalizePreviewableMarkdownContent(`Intro\n\n\`\`\`css\n${fragment}\n\`\`\``)).toBe(
      `Intro\n\n\`\`\`css\n${fragment}\n\`\`\``,
    );
    expect(getCodeBlockPreviewType(fragment, 'css')).toBe('html');
  });

  it('keeps streaming mislabeled html fragments inside unclosed css fences when they have no LA marker', () => {
    const content = `<div style="padding:24px">
    <section style="background:white">
        <p>Transformer summary</p>
    </section>

\`\`\`css
    </div>
    <!-- 右侧：核心贡献与特质 -->
    <div style="display:grid">
        <strong>Self-Attention</strong>`;

    expect(normalizePreviewableMarkdownContent(content)).toBe(content);
  });

  it('keeps real css code blocks fenced', () => {
    const css = '.card { color: #2563eb; display: grid; }';

    expect(normalizePreviewableMarkdownContent(`\`\`\`css\n${css}\n\`\`\``)).toBe(`\`\`\`css\n${css}\n\`\`\``);
  });

  it('keeps full html documents fenced for preview', () => {
    const document = '<!DOCTYPE html><html><head><style>body{color:red}</style></head><body>Hello</body></html>';

    expect(normalizePreviewableMarkdownContent(document)).toBe(`\`\`\`amc-live-artifact-html\n${document}\n\`\`\``);
    expect(normalizePreviewableMarkdownContent(`\`\`\`html\n${document}\n\`\`\``)).toBe(
      `\`\`\`html\n${document}\n\`\`\``,
    );
  });

  it('wraps html fragments that include style tags as Live Artifacts', () => {
    const fragment = '<section><style>.card{color:red}</style><div class="card">Styled artifact</div></section>';

    expect(normalizePreviewableMarkdownContent(fragment)).toBe(`\`\`\`amc-live-artifact-html\n${fragment}\n\`\`\``);
    expect(isLikelyHtml(fragment)).toBe(true);
    expect(isLikelyStreamingHtmlArtifact(fragment)).toBe(true);
  });

  it('still treats Live Artifact fragments that mention iframe/script tags as previewable', () => {
    // Models often document tags like <iframe> inside table cells. Classification must
    // not reject the whole artifact (sanitizer still strips real embeds at render time).
    const fragment =
      '<div style="display:block;width:100%">' +
      '<h2>结论</h2>' +
      '<p>核心模块透视</p>' +
      '<table><tr><td>通过 <iframe src="https://example.com"></iframe> 嵌入联网版</td></tr></table>' +
      '</div>';

    expect(isLikelyHtml(fragment)).toBe(true);
    expect(isLikelyStreamingHtmlArtifact(fragment)).toBe(true);
    expect(normalizePreviewableMarkdownContent(fragment)).toBe(`\`\`\`amc-live-artifact-html\n${fragment}\n\`\`\``);
  });

  it('wraps bare Live Artifact interaction JSON in the dedicated interaction fence', () => {
    const interaction = JSON.stringify(
      {
        instruction: 'Continue with these choices.',
        schema: {
          type: 'object',
          properties: {
            tone: { type: 'string', enum: ['brief', 'detailed'] },
          },
        },
      },
      null,
      2,
    );

    expect(normalizePreviewableMarkdownContent(interaction)).toBe(
      `\`\`\`amc-live-artifact-interaction\n${interaction}\n\`\`\``,
    );
  });

  it('wraps streaming interaction JSON candidates before they parse completely', () => {
    const interaction = '{"instruction":"Collect writing options","schema":{';

    expect(normalizePreviewableMarkdownContent(interaction, { isStreaming: true })).toBe(
      `\`\`\`amc-live-artifact-interaction\n${interaction}\n\`\`\``,
    );
  });

  it('wraps bare objects with instruction+schema the same way CodeBlock shapes them', () => {
    // The bare-JSON wrapping uses the same lenient shape gate as CodeBlock
    // (starts with '{' + contains "instruction" + "schema"). A spec that is
    // structurally invalid (or merely repairable) still gets wrapped so CodeBlock
    // can render a diagnostic card instead of falling through to plain text.
    const schemaExample = JSON.stringify(
      {
        instruction: 'This is only an API example.',
        schema: {
          type: 'object',
          properties: {
            topic: { title: 'Topic' },
          },
        },
      },
      null,
      2,
    );

    expect(normalizePreviewableMarkdownContent(schemaExample)).toBe(
      `\`\`\`amc-live-artifact-interaction\n${schemaExample}\n\`\`\``,
    );
  });
});

describe('mislabeled HTML fence unwrapping (tightened)', () => {
  it('unwraps a full HTML document mislabeled as text and rewraps it as a Live Artifact', () => {
    const document = '<!doctype html><html><head><title>Live</title></head><body>Hello</body></html>';

    expect(normalizePreviewableMarkdownContent(`\`\`\`text\n${document}\n\`\`\``)).toBe(
      `\`\`\`amc-live-artifact-html\n${document}\n\`\`\``,
    );
  });

  it('unwraps a full HTML document mislabeled as markdown and rewraps it as a Live Artifact', () => {
    const document = '<html><body><main>Hello</main></body></html>';

    expect(normalizePreviewableMarkdownContent(`\`\`\`md\n${document}\n\`\`\``)).toBe(
      `\`\`\`amc-live-artifact-html\n${document}\n\`\`\``,
    );
  });

  it('keeps a bare html fragment without a Live Artifact marker fenced', () => {
    expect(normalizePreviewableMarkdownContent('```text\n<div>hi</div>\n```')).toBe('```text\n<div>hi</div>\n```');
  });

  it('unwraps a mislabeled fragment that contains a Live Artifacts CSS variable', () => {
    const content = '.card { background: var(--amc-live-artifact-surface); color: var(--amc-live-artifact-text); }';

    expect(normalizePreviewableMarkdownContent(`\`\`\`css\n${content}\n\`\`\``)).toBe(content);
  });

  it('unwraps a mislabeled fragment that contains a data-amc-* interactive attribute and rewraps it as a Live Artifact', () => {
    const content = '<div data-amc-followup=\'{"instruction":"继续"}\'>Continue</div>';

    expect(normalizePreviewableMarkdownContent(`\`\`\`text\n${content}\n\`\`\``)).toBe(
      `\`\`\`amc-live-artifact-html\n${content}\n\`\`\``,
    );
  });

  it('keeps even a full HTML document fenced when unwrapMislabeledHtmlBlocks is false', () => {
    const document = '<!doctype html><html><body>Hello</body></html>';

    expect(
      normalizePreviewableMarkdownContent(`\`\`\`text\n${document}\n\`\`\``, { unwrapMislabeledHtmlBlocks: false }),
    ).toBe(`\`\`\`text\n${document}\n\`\`\``);
  });

  it('keeps a bare html fragment fenced when unwrapMislabeledHtmlBlocks is false', () => {
    expect(
      normalizePreviewableMarkdownContent('```text\n<div>hi</div>\n```', { unwrapMislabeledHtmlBlocks: false }),
    ).toBe('```text\n<div>hi</div>\n```');
  });

  it('unwraps a streaming full document and rewraps it as a Live Artifact', () => {
    const partialDocument = '<!doctype html><html><head><title>Live</title></head><body><main>Loading';

    expect(normalizePreviewableMarkdownContent(`\`\`\`text\n${partialDocument}`, { isStreaming: true })).toBe(
      `\`\`\`amc-live-artifact-html\n${partialDocument}\n\`\`\``,
    );
  });

  it('keeps a streaming bare fragment fenced when it has no Live Artifact marker', () => {
    expect(normalizePreviewableMarkdownContent('```text\n<div>hi</div>', { isStreaming: true })).toBe(
      '```text\n<div>hi</div>',
    );
  });

  it('does not double-wrap or strip existing Live Artifact fences', () => {
    const document = '<!doctype html><html><body>Hello</body></html>';
    const wrapped = `\`\`\`amc-live-artifact-html\n${document}\n\`\`\``;

    expect(normalizePreviewableMarkdownContent(wrapped)).toBe(wrapped);
    expect(normalizePreviewableMarkdownContent(wrapped, { isStreaming: true })).toBe(wrapped);
  });

  it('keeps explicit html/svg fences untouched by the mislabel unwrap path', () => {
    const document = '<!doctype html><html><body>Hello</body></html>';

    expect(normalizePreviewableMarkdownContent(`\`\`\`html\n${document}\n\`\`\``)).toBe(
      `\`\`\`html\n${document}\n\`\`\``,
    );
  });

  it('does not misprocess a mislabeled fence whose content contains nested fences', () => {
    // FENCED_CODE_BLOCK_REGEX approximates on nested fences; assert no crash and
    // the outer fence survives the unwrap pass when there is no strong signal.
    const content = '```text\nfunction example() {\n  const s = "```js\\nconst x = 1;\\n```";\n  return s;\n}\n```';

    expect(normalizePreviewableMarkdownContent(content)).toBe(content);
  });
});
