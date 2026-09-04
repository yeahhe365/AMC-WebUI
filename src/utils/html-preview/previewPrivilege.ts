/**
 * HTML preview is one runtime with two privilege tiers:
 *
 * - `sanitized`: Live Artifacts (message bubbles + expanded modal). Opaque
 *   origin, CSP, sanitizer, theme/KaTeX. Follow-up protocol is allowed.
 * - `unrestricted`: code-block demo player (modal + side panel). Same-origin
 *   so storage/CDN demos work. Follow-up is not a demo API.
 *
 * Fence language picks the default tier; expanding a preview must keep the
 * same tier rather than silently switching engines.
 */
export type HtmlPreviewPrivilege = 'sanitized' | 'unrestricted';

export interface HtmlPreviewOpenOptions {
  initialTrueFullscreen?: boolean;
  privilege?: HtmlPreviewPrivilege;
  themeId?: string;
  baseFontSize?: number;
}

export type OpenHtmlPreviewHandler = (html: string, options?: HtmlPreviewOpenOptions) => void;

export interface HtmlPreviewRequest {
  html: string;
  privilege: HtmlPreviewPrivilege;
  themeId?: string;
  baseFontSize?: number;
  initialTrueFullscreen: boolean;
}

export const DEFAULT_HTML_PREVIEW_PRIVILEGE: HtmlPreviewPrivilege = 'unrestricted';

/**
 * Sandbox tokens shared by every preview iframe of a given privilege.
 *
 * Unrestricted demos keep same-origin / popups / pointer-lock so CDN apps work.
 * `allow-top-navigation-by-user-activation` is intentionally omitted: a click
 * inside the demo must not navigate the AMC tab away.
 */
export const HTML_PREVIEW_SANDBOX: Record<HtmlPreviewPrivilege, string> = {
  sanitized: 'allow-scripts allow-forms allow-popups allow-modals allow-downloads',
  unrestricted:
    'allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin allow-popups-to-escape-sandbox allow-presentation allow-pointer-lock',
};

export const isHtmlPreviewMessageOriginAllowed = (
  origin: string,
  privilege: HtmlPreviewPrivilege,
  parentOrigin: string,
): boolean => {
  if (origin === 'null') {
    return true;
  }

  return privilege === 'unrestricted' && origin === parentOrigin;
};

export const createHtmlPreviewRequest = (html: string, options: HtmlPreviewOpenOptions = {}): HtmlPreviewRequest => ({
  html,
  privilege: options.privilege ?? DEFAULT_HTML_PREVIEW_PRIVILEGE,
  initialTrueFullscreen: options.initialTrueFullscreen ?? false,
  ...(options.themeId ? { themeId: options.themeId } : {}),
  ...(typeof options.baseFontSize === 'number' ? { baseFontSize: options.baseFontSize } : {}),
});
