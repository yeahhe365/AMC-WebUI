import React, { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it } from 'vitest';
import { HtmlPreviewContent } from './HtmlPreviewContent';

describe('HtmlPreviewContent', () => {
  const renderer = setupTestRenderer();

  it('renders the iframe with an unrestricted sandbox and bridged srcDoc content', () => {
    const iframeRef = React.createRef<HTMLIFrameElement>();
    const htmlWithScript =
      '<html><head><script src="https://cdn.example/app.js"></script></head><body><button onclick="run()">Hello</button></body></html>';

    act(() => {
      renderer.root.render(
        <HtmlPreviewContent iframeRef={iframeRef} htmlContent={htmlWithScript} scale={1} contentHeight={0} />,
      );
    });

    const iframe = renderer.container.querySelector('iframe');
    const sandbox = iframe?.getAttribute('sandbox') ?? '';
    const srcDoc = iframe?.getAttribute('srcdoc') ?? '';

    expect(sandbox.split(/\s+/)).toEqual(
      expect.arrayContaining([
        'allow-scripts',
        'allow-same-origin',
        'allow-forms',
        'allow-popups',
        'allow-modals',
        'allow-downloads',
      ]),
    );
    expect(sandbox).not.toContain('allow-top-navigation');
    // Unrestricted: keep model scripts/handlers and do not inject a CSP.
    expect(srcDoc).toContain('cdn.example/app.js');
    expect(srcDoc).toContain('onclick="run()"');
    expect(srcDoc).not.toContain('Content-Security-Policy');
    expect(srcDoc).toContain('parent.postMessage');
  });

  it('renders sanitized Live Artifact previews without same-origin or model scripts', () => {
    const iframeRef = React.createRef<HTMLIFrameElement>();
    const htmlWithScript =
      '<html><head><script src="https://cdn.example/app.js"></script></head><body><button onclick="run()">Hello</button></body></html>';

    act(() => {
      renderer.root.render(
        <HtmlPreviewContent
          iframeRef={iframeRef}
          htmlContent={htmlWithScript}
          scale={1}
          contentHeight={0}
          privilege="sanitized"
          themeId="pearl"
        />,
      );
    });

    const iframe = renderer.container.querySelector('iframe');
    const sandbox = iframe?.getAttribute('sandbox') ?? '';
    const srcDoc = iframe?.getAttribute('srcdoc') ?? '';

    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(srcDoc).toContain('Content-Security-Policy');
    expect(srcDoc).not.toContain('cdn.example/app.js');
    expect(srcDoc).not.toContain('onclick=');
    expect(srcDoc).toContain('data-amc-live-artifact-theme');
  });
});
