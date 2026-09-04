import { describe, expect, it } from 'vitest';
import { createHtmlPreviewRequest, HTML_PREVIEW_SANDBOX, isHtmlPreviewMessageOriginAllowed } from './previewPrivilege';

describe('HTML preview privilege', () => {
  it('keeps sanitized previews opaque and unrestricted previews same-origin', () => {
    expect(HTML_PREVIEW_SANDBOX.sanitized).toContain('allow-scripts');
    expect(HTML_PREVIEW_SANDBOX.sanitized).not.toContain('allow-same-origin');
    expect(HTML_PREVIEW_SANDBOX.unrestricted).toContain('allow-same-origin');
  });

  it('never grants top-level navigation to either preview sandbox', () => {
    expect(HTML_PREVIEW_SANDBOX.sanitized).not.toContain('allow-top-navigation');
    expect(HTML_PREVIEW_SANDBOX.unrestricted).not.toContain('allow-top-navigation');
  });

  it('accepts opaque-origin posts for both tiers and parent-origin posts only when unrestricted', () => {
    const parentOrigin = 'https://app.example';

    expect(isHtmlPreviewMessageOriginAllowed('null', 'sanitized', parentOrigin)).toBe(true);
    expect(isHtmlPreviewMessageOriginAllowed('null', 'unrestricted', parentOrigin)).toBe(true);
    expect(isHtmlPreviewMessageOriginAllowed(parentOrigin, 'unrestricted', parentOrigin)).toBe(true);
    expect(isHtmlPreviewMessageOriginAllowed(parentOrigin, 'sanitized', parentOrigin)).toBe(false);
    expect(isHtmlPreviewMessageOriginAllowed('https://evil.example', 'unrestricted', parentOrigin)).toBe(false);
  });

  it('defaults opened previews to the unrestricted demo player unless a tier is given', () => {
    expect(createHtmlPreviewRequest('<p>Hi</p>')).toEqual({
      html: '<p>Hi</p>',
      privilege: 'unrestricted',
      initialTrueFullscreen: false,
    });
    expect(
      createHtmlPreviewRequest('<section>Widget</section>', {
        privilege: 'sanitized',
        themeId: 'onyx',
        baseFontSize: 18,
        initialTrueFullscreen: true,
      }),
    ).toEqual({
      html: '<section>Widget</section>',
      privilege: 'sanitized',
      themeId: 'onyx',
      baseFontSize: 18,
      initialTrueFullscreen: true,
    });
  });
});
