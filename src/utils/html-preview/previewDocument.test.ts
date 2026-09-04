import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildHtmlPreviewSrcDoc,
  buildStreamingHtmlPreviewSrcDoc,
  buildUnrestrictedHtmlPreviewSrcDoc,
  createStaticPreviewSnapshotContainer,
  loadKatex,
  HTML_PREVIEW_DIAGNOSTIC_EVENT,
  HTML_PREVIEW_MESSAGE_CHANNEL,
  HTML_PREVIEW_STREAM_RENDER_EVENT,
} from './previewDocument';

describe('htmlPreview utilities', () => {
  // KaTeX is now loaded lazily so the math chunk is not pulled into every
  // markdown message. The math-rendering tests need it in memory, so load it
  // up front before asserting rendered `class="katex"` output.
  beforeAll(async () => {
    await loadKatex();
  });

  it('injects the iframe bridge script into preview documents', () => {
    const srcDoc = buildHtmlPreviewSrcDoc('<html><head><title>Demo</title></head><body>Hello</body></html>');

    expect(srcDoc).toContain(HTML_PREVIEW_MESSAGE_CHANNEL);
    expect(srcDoc).toContain('parent.postMessage');
    expect(srcDoc).toContain("event.key === 'Escape'");
  });

  it('measures artifact height from content bounds instead of body/html offsetHeight', () => {
    const srcDoc = buildHtmlPreviewSrcDoc('<section style="height:200px">Content</section>');

    // offsetHeight of body/html locks to the iframe viewport and leaves blank space under content.
    expect(srcDoc).toContain('measureContentHeight');
    expect(srcDoc).toContain('getBoundingClientRect');
    expect(srcDoc).toContain("el.style.minHeight = '0'");
    expect(srcDoc).toContain('isMeasuringHeight');
    expect(srcDoc).not.toMatch(/body\s*\?\s*body\.offsetHeight/);
    expect(srcDoc).not.toMatch(/root\s*\?\s*root\.offsetHeight/);
  });

  it('forces content-sized html/body so min-height:100vh cannot inflate the frame', () => {
    const srcDoc = buildHtmlPreviewSrcDoc('<section>Content</section>');

    expect(srcDoc).toContain('height:auto!important');
    expect(srcDoc).toContain('min-height:0!important');
    expect(srcDoc).toContain('max-height:none!important');
  });

  it('injects a sandboxed preview CSP while allowing inline scripts and HTTPS assets', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(
      '<html><head><title>Demo</title><script src="https://cdn.example/app.js"></script></head><body><img src="https://example.com/demo.png" alt="Demo"></body></html>',
    );

    expect(srcDoc).toContain('http-equiv="Content-Security-Policy"');
    expect(srcDoc).toContain("default-src 'none'");
    expect(srcDoc).toContain("script-src 'unsafe-inline'");
    expect(srcDoc).toContain('img-src https: data: blob:');
    expect(srcDoc).toContain('connect-src https: data: blob:');
    expect(srcDoc).toContain("frame-src 'none'");
    expect(srcDoc).toContain("object-src 'none'");
    expect(srcDoc).toContain("base-uri 'none'");
    expect(srcDoc.indexOf('http-equiv="Content-Security-Policy"')).toBeLessThan(srcDoc.indexOf('example.com/demo.png'));
  });

  it('allows sandboxed artifact previews to load HTTPS runtime assets', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(
      '<html><head><script type="module" src="https://cdn.example/app.js"></script><link rel="stylesheet" href="https://cdn.example/app.css"></head><body></body></html>',
    );

    expect(srcDoc).toContain("script-src 'unsafe-inline' https: blob:");
    expect(srcDoc).toContain("style-src 'unsafe-inline' https:");
    expect(srcDoc).toContain('font-src https: data:');
    expect(srcDoc).toContain('connect-src https: data: blob:');
    expect(srcDoc).toContain('worker-src blob:');
  });

  it('injects the preview CSP into fragment wrappers before bridge scripts', () => {
    const srcDoc = buildHtmlPreviewSrcDoc('<section><p>Fragment</p></section>');

    expect(srcDoc).toContain('<head><meta http-equiv="Content-Security-Policy"');
    expect(srcDoc.indexOf('Content-Security-Policy')).toBeLessThan(srcDoc.indexOf(HTML_PREVIEW_MESSAGE_CHANNEL));
  });

  it('builds a stable streaming preview runner that receives html over postMessage', () => {
    const srcDoc = buildStreamingHtmlPreviewSrcDoc();

    expect(srcDoc).toContain('data-amc-stream-preview-root');
    expect(srcDoc).toContain(HTML_PREVIEW_MESSAGE_CHANNEL);
    expect(srcDoc).toContain(HTML_PREVIEW_STREAM_RENDER_EVENT);
    expect(srcDoc).toContain('event.data.event !== streamRenderEvent');
    expect(srcDoc).toContain('replaceChildren');
    expect(srcDoc).not.toContain('<section>First chunk</section>');
  });

  it('still injects the CSP when the artifact merely mentions the policy string', () => {
    // A tutorial artifact that documents `http-equiv="Content-Security-Policy"`
    // must not suppress the real injected policy — otherwise the sandboxed
    // preview runs without one.
    const srcDoc = buildHtmlPreviewSrcDoc(
      '<section><p>Add &lt;meta http-equiv="Content-Security-Policy" content="default-src ...&gt;</p></section>',
    );

    expect(srcDoc).toContain('http-equiv="Content-Security-Policy"');
    expect(srcDoc).toContain("default-src 'none'");
  });

  it('does not double-inject the theme or base font size when they are already present', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(
      '<html><head><style data-amc-live-artifact-theme="true">:root{--x:1}</style><style data-amc-live-artifact-base-font-size="true">:root{font-size:10px}</style></head><body>x</body></html>',
      { baseFontSize: 18, themeId: 'onyx' },
    );

    // Still no CSP meta (independent of theme/font-size), but the theme and
    // font-size injections must be skipped — not duplicated.
    expect(srcDoc.match(/data-amc-live-artifact-theme="true"/g)?.length).toBe(1);
    expect(srcDoc.match(/data-amc-live-artifact-base-font-size="true"/g)?.length).toBe(1);
  });

  it('streaming preview runner keeps full document attributes in sync', () => {
    const srcDoc = buildStreamingHtmlPreviewSrcDoc();

    expect(srcDoc).toContain('syncDocumentAttributes');
    expect(srcDoc).toContain('parsedDocument.documentElement');
    expect(srcDoc).toContain('parsedDocument.body');
  });

  it('injects a bridge command for clearing iframe selections from the parent', () => {
    const srcDoc = buildHtmlPreviewSrcDoc('<section><p>Select this artifact text.</p></section>');

    expect(srcDoc).toContain("event.data.event !== 'clear-selection'");
    expect(srcDoc).toContain('window.getSelection()?.removeAllRanges()');
  });

  it('maps accent-surface to a soft tint, not solid bgAccent (avoids blue-on-blue invisible text)', () => {
    const pearl = buildHtmlPreviewSrcDoc('<section>x</section>', { themeId: 'pearl' });
    const onyx = buildHtmlPreviewSrcDoc('<section>x</section>', { themeId: 'onyx' });

    // Pearl: textLink and bgAccent are both #2563eb; surface must use soft bgInfo instead.
    expect(pearl).toContain('--amc-live-artifact-accent:#2563eb');
    expect(pearl).toContain('--amc-live-artifact-accent-surface:rgba(37, 99, 235, 0.06)');
    expect(pearl).not.toContain('--amc-live-artifact-accent-surface:#2563eb');
    expect(pearl).toContain('--amc-live-artifact-success-surface:rgba(22, 163, 74, 0.1)');
    expect(pearl).toContain('--amc-live-artifact-danger-surface:#fef2f2');
    expect(pearl).toContain('--amc-live-artifact-warning-surface:rgba(212, 167, 44, 0.1)');

    expect(onyx).toContain('--amc-live-artifact-accent:#6ba3fc');
    expect(onyx).toContain('--amc-live-artifact-accent-surface:rgba(30, 58, 138, 0.25)');
    expect(onyx).not.toContain('--amc-live-artifact-accent-surface:#4f7cf5');
  });

  it('injects a declarative Live Artifact follow-up click bridge', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(
      `<section><button data-amc-followup='{"instruction":"Continue","state":{"selected":"B"}}'>Continue</button></section>`,
    );

    expect(srcDoc).toContain('data-amc-followup');
    expect(srcDoc).toContain("notify('followup'");
    expect(srcDoc).toContain("closest('[data-amc-followup]')");
    expect(srcDoc).toContain('JSON.parse');
  });

  it('injects a declarative copy bridge that relays data-amc-copy clicks', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(`<section><button data-amc-copy="npm install katex">Copy</button></section>`);

    expect(srcDoc).toContain('data-amc-copy');
    expect(srcDoc).toContain("closest('[data-amc-copy]')");
    expect(srcDoc).toContain('"copy"');
  });

  it('injects bridge helpers for collecting current declarative artifact state', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(
      `<section data-amc-followup-scope>
        <input data-amc-state-key="priority" value="low-risk" />
        <button data-amc-followup='{"instruction":"Continue"}'>Continue</button>
      </section>`,
    );

    expect(srcDoc).toContain('data-amc-state-key');
    expect(srcDoc).toContain('collectFollowupState');
    expect(srcDoc).toContain('data-amc-followup-scope');
    expect(srcDoc).toContain('mergeFollowupState');
  });

  it('injects a Live Artifact text selection bridge', () => {
    const srcDoc = buildHtmlPreviewSrcDoc('<section><p>Select this artifact text.</p></section>');

    expect(srcDoc).toContain("notify('selection'");
    expect(srcDoc).toContain("document.addEventListener('selectionchange'");
    expect(srcDoc).toContain('window.getSelection');
    expect(srcDoc).toContain('getBoundingClientRect');
  });

  it('injects preview diagnostics for blocked resources and runtime failures', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(
      '<section><img src="https://example.com/missing.png" alt="Missing"></section>',
    );

    expect(srcDoc).toContain(HTML_PREVIEW_DIAGNOSTIC_EVENT);
    expect(srcDoc).toContain('resource-error');
    expect(srcDoc).toContain('runtime-error');
    expect(srcDoc).toContain('unhandledrejection');
    expect(srcDoc).toContain('securitypolicyviolation');
    expect(srcDoc).toContain('csp-violation');
  });

  it('does not fire followup for synthetic (untrusted) clicks', () => {
    const messages: unknown[] = [];
    const srcDoc = buildHtmlPreviewSrcDoc(
      `<section><button data-amc-followup="生成参考文献">生成参考文献</button></section>`,
    );
    const scriptContent = srcDoc.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(scriptContent).toBeDefined();

    const originalPostMessage = window.postMessage;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;

    window.postMessage = ((message: unknown) => {
      messages.push(message);
    }) as Window['postMessage'];
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    }) as Window['requestAnimationFrame'];
    window.cancelAnimationFrame = (() => {}) as Window['cancelAnimationFrame'];

    try {
      document.body.innerHTML = '<section><button data-amc-followup="生成参考文献">生成参考文献</button></section>';
      window.eval(scriptContent!);
      // The bridge only honors real user gestures (event.isTrusted) so a
      // script-injected synthetic click (element.click() or dispatchEvent of a
      // fresh MouseEvent) cannot trigger a followup on the parent page. jsdom
      // cannot synthesize a trusted event, so we assert the security property:
      // an untrusted click produces no followup message.
      document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(messages).toEqual([]);
    } finally {
      document.body.innerHTML = '';
      window.postMessage = originalPostMessage;
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it('does not relay data-amc-copy for synthetic (untrusted) clicks', () => {
    const messages: unknown[] = [];
    const srcDoc = buildHtmlPreviewSrcDoc(`<section><button data-amc-copy="npm install katex">Copy</button></section>`);
    const scriptContent = srcDoc.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(scriptContent).toBeDefined();

    const originalPostMessage = window.postMessage;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;

    window.postMessage = ((message: unknown) => {
      messages.push(message);
    }) as Window['postMessage'];
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    }) as Window['requestAnimationFrame'];
    window.cancelAnimationFrame = (() => {}) as Window['cancelAnimationFrame'];

    try {
      document.body.innerHTML = '<section><button data-amc-copy="npm install katex">Copy</button></section>';
      window.eval(scriptContent!);
      // Same security property as the followup test: a synthetic (untrusted)
      // click must not fire a copy event to the parent page.
      document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(messages).toEqual([]);
    } finally {
      document.body.innerHTML = '';
      window.postMessage = originalPostMessage;
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it('pre-renders TeX math delimiters inside preview HTML with KaTeX styles', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(
      '<section><p>Action chunk $a_{t:t+H-1}$</p><p>Loss $$L = ||\\epsilon - \\epsilon_\\theta(x_t,t)||^2$$</p></section>',
    );

    expect(srcDoc).toContain('class="katex"');
    expect(srcDoc).toContain('a_{t:t+H-1}');
    expect(srcDoc).toContain('L = ||\\epsilon - \\epsilon_\\theta(x_t,t)||^2');
    expect(srcDoc).toContain('data-amc-katex');
    expect(srcDoc).toContain('.katex');
  });

  it('pre-renders parenthesized and bracketed TeX math inside preview HTML', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(
      String.raw`<section><p>Inline \(a_t\)</p><p>Display \[E = mc^2\]</p></section>`,
    );

    expect(srcDoc).toContain('class="katex"');
    expect(srcDoc).toContain('a_t');
    expect(srcDoc).toContain('E = mc^2');
    expect(srcDoc).toContain('data-amc-katex');
    expect(srcDoc).not.toContain(String.raw`\(a_t\)`);
    expect(srcDoc).not.toContain(String.raw`\[E = mc^2\]`);
  });

  it('pre-renders common TeX math environments inside preview HTML', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(
      String.raw`<section><p>\begin{align}a&=b\\c&=d\end{align}</p><p>f(x)=\begin{cases}x,&x>0\\0,&x\le0\end{cases}</p></section>`,
    );

    expect(srcDoc).toContain('class="katex"');
    expect(srcDoc).toContain(String.raw`\begin{align}`);
    expect(srcDoc).toContain(String.raw`\begin{cases}`);
    expect(srcDoc).toContain('data-amc-katex');
    expect(srcDoc).not.toContain(String.raw`<p>\begin{align}`);
  });

  it('does not render TeX delimiters inside code-like preview HTML elements', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(
      '<section><p>Formula $x_t$</p><code>$x_t$</code><pre>$$y_t$$</pre></section>',
    );

    expect(srcDoc).toContain('class="katex"');
    expect(srcDoc).toContain('<code>$x_t$</code>');
    expect(srcDoc).toContain('<pre>$$y_t$$</pre>');
  });

  it('does not treat ordinary dollar amounts as preview math', () => {
    const srcDoc = buildHtmlPreviewSrcDoc('<section><p>Budget $20 and $30 this week.</p></section>');

    expect(srcDoc).not.toContain('class="katex"');
    expect(srcDoc).toContain('Budget $20 and $30 this week.');
  });

  it('renders asymptotic complexity formulas in preview HTML', () => {
    const srcDoc = buildHtmlPreviewSrcDoc('<section><p>AR $O(L)$</p><p>NAR $O(1)$</p></section>');

    expect(srcDoc).toContain('class="katex"');
    expect(srcDoc).toContain('O(L)');
    expect(srcDoc).toContain('O(1)');
    expect(srcDoc).not.toContain('$O(L)$');
    expect(srcDoc).not.toContain('$O(1)$');
  });

  it('creates a static screenshot container without scripts or inline event handlers', async () => {
    const { container, cleanup } = await createStaticPreviewSnapshotContainer(
      '<html><head><style>.demo { color: red; }</style><script>window.parent.alert("x")</script></head><body class="demo" onclick="alert(1)"><button onmouseover="alert(2)">Run</button></body></html>',
      document,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
    expect(container.querySelector('[onmouseover]')).toBeNull();
    expect(container.textContent).toContain('Run');
    expect(container.querySelector('style')?.textContent).toContain('.demo');

    cleanup();
  });

  it('keeps the static screenshot container renderable for html2canvas', async () => {
    const { container, cleanup } = await createStaticPreviewSnapshotContainer(
      '<html><body><div style="width:120px;height:40px;background:#000;color:#fff">Visible</div></body></html>',
      document,
    );

    expect(container.style.opacity).not.toBe('0');
    expect(container.style.visibility).not.toBe('hidden');
    expect(container.style.pointerEvents).toBe('none');
    expect(container.textContent).toContain('Visible');

    cleanup();
  });

  it('strips scripts and inline event handlers from artifact HTML before rendering', () => {
    const srcDoc = buildHtmlPreviewSrcDoc(
      '<section><script>alert(1)</script><button onclick="alert(2)">Run</button><img src="javascript:alert(3)" alt="x"></section>',
    );

    expect(srcDoc).not.toContain('<script>alert(1)</script>');
    expect(srcDoc).not.toContain('onclick=');
    expect(srcDoc).not.toContain('javascript:alert(3)');
    expect(srcDoc).toContain('Run');
  });

  it('injects a horizontal-scroll fallback so wide artifacts are not clipped', () => {
    const srcDoc = buildHtmlPreviewSrcDoc('<section>wide</section>');

    expect(srcDoc).toContain('body{overflow-x:auto;}');
  });

  it('builds unrestricted code-block previews without CSP, sanitization, or theme height clamps', () => {
    const srcDoc = buildUnrestrictedHtmlPreviewSrcDoc(
      [
        '<html><head><script src="https://cdn.example/app.js"></script></head>',
        '<body style="min-height:100vh">',
        '<script>window.boot=1</script>',
        '<iframe src="https://example.com/embed"></iframe>',
        '<button onclick="alert(1)">Go</button>',
        '<p>Budget $20</p>',
        '</body></html>',
      ].join(''),
    );

    expect(srcDoc).toContain('cdn.example/app.js');
    expect(srcDoc).toContain('<script>window.boot=1</script>');
    expect(srcDoc).toContain('<iframe src="https://example.com/embed"></iframe>');
    expect(srcDoc).toContain('onclick="alert(1)"');
    expect(srcDoc).toContain('Budget $20');
    expect(srcDoc).toContain('min-height:100vh');
    expect(srcDoc).toContain(HTML_PREVIEW_MESSAGE_CHANNEL);
    expect(srcDoc).not.toContain('Content-Security-Policy');
    expect(srcDoc).not.toContain('height:auto!important');
    expect(srcDoc).not.toContain('data-amc-live-artifact-theme');
  });

  it('wraps unrestricted HTML fragments without rewriting their markup', () => {
    const srcDoc = buildUnrestrictedHtmlPreviewSrcDoc('<section onclick="x()">Hi</section>');

    expect(srcDoc).toContain('<section onclick="x()">Hi</section>');
    expect(srcDoc).toContain('<html>');
    expect(srcDoc).toContain(HTML_PREVIEW_MESSAGE_CHANNEL);
  });

  it('uses the same unrestricted engine when privilege is passed to the shared builder', () => {
    const html = '<section onclick="x()">Hi</section>';

    expect(buildHtmlPreviewSrcDoc(html, { privilege: 'unrestricted' })).toBe(buildUnrestrictedHtmlPreviewSrcDoc(html));
    expect(buildHtmlPreviewSrcDoc(html)).not.toContain('onclick=');
  });

  it('keeps inline handlers in unrestricted screenshot fallbacks', async () => {
    const { container, cleanup } = await createStaticPreviewSnapshotContainer(
      '<html><body><button onclick="run()">Go</button></body></html>',
      document,
      { sanitize: false },
    );

    expect(container.querySelector('[onclick]')?.getAttribute('onclick')).toBe('run()');
    expect(container.textContent).toContain('Go');

    cleanup();
  });

  describe('DOM-layer injection (script/comment/pre containing </body>)', () => {
    it('does not inject the bridge into a script string containing </body> (live artifacts)', () => {
      // Live Artifacts sanitize <script> tags entirely, so the script containing
      // the literal </body> is stripped. The bridge must still land in a real
      // <script> at the END of the body — never spliced into a string (which
      // would be a SyntaxError and white-screen the frame).
      const srcDoc = buildHtmlPreviewSrcDoc(
        `<html><head></head><body><script>const tpl = '<div></body></div>';</script><p>Hello</p></body></html>`,
      );

      const bridgeIndex = srcDoc.indexOf(HTML_PREVIEW_MESSAGE_CHANNEL);
      expect(bridgeIndex).toBeGreaterThan(srcDoc.indexOf('Hello'));
      // The script was sanitized out (its literal </body> string is gone).
      expect(srcDoc.indexOf('<div></body></div>')).toBe(-1);
    });

    it('does not inject the bridge before <pre> text that displays </body> (live artifacts)', () => {
      const srcDoc = buildHtmlPreviewSrcDoc(
        '<html><head></head><body><p>Intro</p><pre>&lt;/body&gt;</pre></body></html>',
      );

      const bridgeIndex = srcDoc.indexOf(HTML_PREVIEW_MESSAGE_CHANNEL);
      expect(bridgeIndex).toBeGreaterThan(srcDoc.indexOf('Intro'));
      // The pre text must survive un-escaped.
      expect(srcDoc).toContain('</body>');
    });

    it('does not inject the bridge into a script string containing </body> (unrestricted preview)', () => {
      const srcDoc = buildUnrestrictedHtmlPreviewSrcDoc(
        `<html><head></head><body><script>const tpl = '<div></body></div>';</script><p>Hello</p></body></html>`,
      );

      const bridgeIndex = srcDoc.indexOf(HTML_PREVIEW_MESSAGE_CHANNEL);
      expect(bridgeIndex).toBeGreaterThan(srcDoc.indexOf('Hello'));
      expect(srcDoc.indexOf('<div></body></div>')).toBeGreaterThan(-1);
    });

    it('does not inject the bridge before a comment containing </body> (unrestricted preview)', () => {
      const srcDoc = buildUnrestrictedHtmlPreviewSrcDoc(
        '<html><head></head><body><!-- literal </body> here --><p>Hello</p></body></html>',
      );

      const bridgeIndex = srcDoc.indexOf(HTML_PREVIEW_MESSAGE_CHANNEL);
      expect(bridgeIndex).toBeGreaterThan(srcDoc.indexOf('Hello'));
      expect(srcDoc).toContain('</body>');
    });

    it('wraps a fragment with no <html> root and appends the bridge last (unrestricted preview)', () => {
      const srcDoc = buildUnrestrictedHtmlPreviewSrcDoc('<p>fragment</p>');

      const bridgeIndex = srcDoc.indexOf(HTML_PREVIEW_MESSAGE_CHANNEL);
      expect(bridgeIndex).toBeGreaterThan(srcDoc.indexOf('fragment'));
      // Serialized as a full document.
      expect(srcDoc).toMatch(/^<!DOCTYPE html><html>/);
    });

    it('still treats content whose string contains <html as a fragment needing a wrapper', () => {
      // A fragment whose text merely mentions "<html" must not be mistaken for
      // a complete document (the old sniffing regex matched the first "<html ").
      const srcDoc = buildUnrestrictedHtmlPreviewSrcDoc('<p>show me &lt;html lang="en"&gt;</p>');

      expect(srcDoc).toMatch(/^<!DOCTYPE html><html>/);
      const bridgeIndex = srcDoc.indexOf(HTML_PREVIEW_MESSAGE_CHANNEL);
      expect(bridgeIndex).toBeGreaterThan(srcDoc.indexOf('show me'));
    });

    it('still injects CSP when model prose mentions the meta tag (DOM guard, not regex)', () => {
      const srcDoc = buildHtmlPreviewSrcDoc(
        '<section><p>Add &lt;meta http-equiv="Content-Security-Policy" content="default-src ...&gt;</p></section>',
      );

      expect(srcDoc).toContain('http-equiv="Content-Security-Policy"');
      expect(srcDoc).toContain("default-src 'none'");
    });

    it('does not double-inject the CSP meta when a real CSP element already exists', () => {
      const srcDoc = buildHtmlPreviewSrcDoc(
        '<html><head><meta http-equiv="Content-Security-Policy" content="default-src &apos;self&apos;"></head><body>x</body></html>',
      );

      expect(srcDoc.match(/http-equiv="Content-Security-Policy"/g)?.length).toBe(1);
    });

    it('injects the CSP meta into the head for fragment wrappers', () => {
      const srcDoc = buildHtmlPreviewSrcDoc('<section><p>Fragment</p></section>');

      const cspIndex = srcDoc.indexOf('Content-Security-Policy');
      const bodyIndex = srcDoc.indexOf('<body>');
      expect(cspIndex).toBeGreaterThan(-1);
      expect(cspIndex).toBeLessThan(bodyIndex);
    });
  });
});
