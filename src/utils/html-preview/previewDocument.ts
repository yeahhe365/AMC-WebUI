import { AVAILABLE_THEMES, DEFAULT_THEME_ID } from '@/constants/themeRegistry';
import { hydrateGraphvizIntoDocument } from '@/features/graphviz/vizRuntime';
import { PREVIEW_BRIDGE_SCRIPT } from './previewBridgeScript';
import { hydrateChartsIntoDocument } from './chartRendererScript';
import { sanitizeElementTree } from './previewSanitizer';
import { STREAMING_PREVIEW_RUNNER_SCRIPT } from './streamingPreviewRunnerScript';
import type { HtmlPreviewPrivilege } from './previewPrivilege';

export {
  HTML_PREVIEW_CLEAR_SELECTION_EVENT,
  HTML_PREVIEW_COPY_EVENT,
  HTML_PREVIEW_DIAGNOSTIC_EVENT,
  HTML_PREVIEW_GRAPHVIZ_RENDER_REQUEST_EVENT,
  HTML_PREVIEW_GRAPHVIZ_RENDER_RESPONSE_EVENT,
  HTML_PREVIEW_MESSAGE_CHANNEL,
  HTML_PREVIEW_STREAM_RENDER_EVENT,
} from './previewMessageProtocol';

const KATEX_STYLE_ATTRIBUTE = 'data-amc-katex';

/**
 * KaTeX is a heavy (~300KB) dependency used only when an HTML preview actually
 * contains TeX math. It is loaded lazily so the static import graph from
 * ArtifactFrame → previewDocument does not force every markdown message to
 * download the math chunk.
 */
type KatexModule = { default: typeof import('katex').default };
let katexInstance: typeof import('katex').default | null = null;
let katexCss: string | null = null;
let katexLoadingPromise: Promise<void> | null = null;
let katexReadyResolve: (() => void) | null = null;
let katexReadyReject: ((error: unknown) => void) | null = null;
let katexReadyPromise: Promise<void> | null = null;

export const loadKatex = (): Promise<void> => {
  if (!katexLoadingPromise) {
    katexLoadingPromise = Promise.all([
      import('katex').then((module: KatexModule) => {
        katexInstance = module.default;
      }),
      import('katex/dist/katex.min.css?inline').then((cssModule) => {
        katexCss = cssModule.default as string;
      }),
    ])
      .then(() => {
        katexReadyResolve?.();
      })
      .catch((error: unknown) => {
        // A failed load must reject anyone waiting on whenKatexReady() so the
        // waiting frame does not hang "pending" forever. Reset all state so the
        // next render that sees math can attempt the load again (retry).
        katexReadyReject?.(error);
        katexReadyPromise = null;
        katexReadyResolve = null;
        katexReadyReject = null;
        katexLoadingPromise = null;
        throw error;
      });
  }

  return katexLoadingPromise;
};

export const whenKatexReady = (): Promise<void> => {
  if (katexInstance) {
    return Promise.resolve();
  }
  if (!katexReadyPromise) {
    katexReadyPromise = new Promise<void>((resolve, reject) => {
      katexReadyResolve = resolve;
      katexReadyReject = reject;
    });
  }
  return katexReadyPromise;
};
// SECURITY NOTE (intentional): `script-src 'unsafe-inline' https: blob:` is
// deliberately permissive. Live Artifacts are model-authored HTML/JS demos; the
// sanitizer strips declarative <script> tags and event-handler attributes, but
// the demo's own JS is allowed to create <script> elements at runtime (CDN
// loaders, blob: bundles). Tightening this to 'none' would break every demo
// that boots its JS dynamically, so the sanitizer is the first line of defense
// and CSP only blocks cross-origin/network surprises (default-src 'none',
// frame-src/object-src/form-action 'none'). The iframe sandbox omits
// allow-same-origin for message-bubble artifacts, keeping them on an opaque
// origin so scripted content cannot reach the parent page's origin.
const PREVIEW_CONTENT_SECURITY_POLICY =
  "default-src 'none'; img-src https: data: blob:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https: blob:; font-src https: data:; media-src https: data: blob:; connect-src https: data: blob:; worker-src blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const PREVIEW_CONTENT_SECURITY_POLICY_META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CONTENT_SECURITY_POLICY}">`;
const PREVIEW_BASE_FONT_SIZE_ATTRIBUTE = 'data-amc-live-artifact-base-font-size';
const PREVIEW_THEME_ATTRIBUTE = 'data-amc-live-artifact-theme';
const MATH_IGNORED_ANCESTOR_SELECTOR = 'script,style,textarea,pre,code,kbd,samp,.katex';
const DARK_LIVE_ARTIFACT_THEME_IDS = new Set(['onyx', 'graphite']);
const TEX_MATH_SIGNAL_REGEX = /[\\^_{}=+\-*/<>|]|[A-Za-z]\d|\d[A-Za-z]|[\u0370-\u03ff]/;
const TEX_MATH_ENVIRONMENT_NAMES =
  'align\\*?|aligned|alignedat|array|Bmatrix|bmatrix|cases|equation\\*?|gather\\*?|gathered|matrix|multline\\*?|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix';
const TEX_MATH_DELIMITER_REGEX = new RegExp(
  [
    String.raw`\$\$([\s\S]+?)\$\$`,
    String.raw`\$((?:\\.|[^$\\\n])+?)\$`,
    String.raw`\\\(([\s\S]+?)\\\)`,
    String.raw`\\\[([\s\S]+?)\\\]`,
    String.raw`\\begin\{(${TEX_MATH_ENVIRONMENT_NAMES})\}([\s\S]+?)\\end\{\5\}`,
  ].join('|'),
  'g',
);
const ASYMPTOTIC_COMPLEXITY_REGEX = /^(?:O|Θ|Ω|Theta|Omega)\s*\([^)]*[A-Za-z0-9][^)]*\)$/;

const cloneIntoDocument = (node: Node, targetDocument: Document): Node => targetDocument.importNode(node, true);

const isLikelyTexMath = (value: string): boolean => {
  const normalizedValue = value.trim();

  return (
    /^[A-Za-z]$/.test(normalizedValue) ||
    TEX_MATH_SIGNAL_REGEX.test(normalizedValue) ||
    ASYMPTOTIC_COMPLEXITY_REGEX.test(normalizedValue)
  );
};

const hasTexMathDelimiterCandidate = (value: string): boolean => {
  TEX_MATH_DELIMITER_REGEX.lastIndex = 0;
  const hasCandidate = TEX_MATH_DELIMITER_REGEX.test(value);
  TEX_MATH_DELIMITER_REGEX.lastIndex = 0;
  return hasCandidate;
};

const readTexMathMatch = (
  match: RegExpMatchArray,
): { latex: string; displayMode: boolean; shouldValidateMathSignal: boolean } => {
  if (match[1] !== undefined) {
    return { latex: match[1], displayMode: true, shouldValidateMathSignal: true };
  }

  if (match[2] !== undefined) {
    return { latex: match[2], displayMode: false, shouldValidateMathSignal: true };
  }

  if (match[3] !== undefined) {
    return { latex: match[3], displayMode: false, shouldValidateMathSignal: true };
  }

  if (match[4] !== undefined) {
    return { latex: match[4], displayMode: true, shouldValidateMathSignal: true };
  }

  return { latex: match[0], displayMode: true, shouldValidateMathSignal: false };
};

const createRenderedMathFragment = (targetDocument: Document, value: string): DocumentFragment | null => {
  TEX_MATH_DELIMITER_REGEX.lastIndex = 0;

  let lastIndex = 0;
  let rendered = false;
  const fragment = targetDocument.createDocumentFragment();

  for (const match of value.matchAll(TEX_MATH_DELIMITER_REGEX)) {
    const startIndex = match.index ?? 0;

    if (startIndex > 0 && value[startIndex - 1] === '\\') {
      continue;
    }

    const rawMatch = match[0];
    const { latex: rawLatex, displayMode, shouldValidateMathSignal } = readTexMathMatch(match);
    const latex = rawLatex.trim();

    if (!latex || (shouldValidateMathSignal && !isLikelyTexMath(latex))) {
      continue;
    }

    if (startIndex > lastIndex) {
      fragment.appendChild(targetDocument.createTextNode(value.slice(lastIndex, startIndex)));
    }

    try {
      if (!katexInstance) {
        continue;
      }
      const template = targetDocument.createElement('template');
      template.innerHTML = katexInstance.renderToString(latex, {
        displayMode,
        throwOnError: false,
        strict: false,
      });
      fragment.appendChild(template.content.cloneNode(true));
      rendered = true;
    } catch {
      fragment.appendChild(targetDocument.createTextNode(rawMatch));
    }

    lastIndex = startIndex + rawMatch.length;
  }

  if (!rendered) {
    return null;
  }

  if (lastIndex < value.length) {
    fragment.appendChild(targetDocument.createTextNode(value.slice(lastIndex)));
  }

  return fragment;
};

const renderMathInDocument = (targetDocument: Document): boolean => {
  if (!targetDocument.body) {
    return false;
  }

  const showText = targetDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = targetDocument.createTreeWalker(targetDocument.body, showText);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  let rendered = false;

  textNodes.forEach((textNode) => {
    if (textNode.parentElement?.closest(MATH_IGNORED_ANCESTOR_SELECTOR)) {
      return;
    }

    const renderedFragment = createRenderedMathFragment(targetDocument, textNode.data);
    if (!renderedFragment) {
      return;
    }

    textNode.replaceWith(renderedFragment);
    rendered = true;
  });

  return rendered;
};

const injectKatexStyles = (targetDocument: Document) => {
  if (targetDocument.head.querySelector(`style[${KATEX_STYLE_ATTRIBUTE}]`)) {
    return;
  }

  const styleElement = targetDocument.createElement('style');
  styleElement.setAttribute(KATEX_STYLE_ATTRIBUTE, 'true');
  styleElement.textContent = katexCss;
  targetDocument.head.appendChild(styleElement);
};

const renderPreviewMath = (srcDoc: string): string => {
  if (!hasTexMathDelimiterCandidate(srcDoc) || typeof DOMParser === 'undefined') {
    return srcDoc;
  }

  if (!katexInstance) {
    // First sight of a math delimiter in a preview: kick off the lazy KaTeX
    // load and return the untouched source this frame. ArtifactFrame subscribes
    // to whenKatexReady() and re-renders once the chunk has arrived, so the
    // formula appears a tick later instead of blocking every message on it.
    void loadKatex();
    return srcDoc;
  }

  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(srcDoc, 'text/html');

  if (renderMathInDocument(parsedDocument)) {
    injectKatexStyles(parsedDocument);
  }

  return `<!DOCTYPE html>${parsedDocument.documentElement.outerHTML}`;
};

/**
 * Inject head/body-end HTML into a parsed document via the DOM, then serialize.
 *
 * String-based injection (`srcDoc.replace(/<\/body>/i, …)`) is fragile: it
 * replaces the FIRST match, so if model-authored HTML contains the literal
 * `</body>` / `<head>` / `<html ` inside a <script> string, a comment, or
 * displayed source text in a <pre>, the bridge script or head resources land
 * inside that string and the page JS crashes (white screen). Parsing into a
 * real Document and appending elements keeps the injections anchored to the
 * true document structure no matter what the text content contains.
 *
 * DOMParser never executes scripts, and serializing via outerHTML does not
 * escape or rewrite script/style text content, so the round-trip matches what
 * the browser would have parsed from the original srcdoc.
 */
const injectIntoParsedDocument = (
  parsedDocument: Document,
  injections: { headElements?: string[]; bodyEndHtml?: string },
): string => {
  const doc = parsedDocument;

  injections.headElements?.forEach((html) => {
    const template = doc.createElement('template');
    template.innerHTML = html;
    doc.head.appendChild(template.content.cloneNode(true));
  });

  if (injections.bodyEndHtml) {
    const template = doc.createElement('template');
    template.innerHTML = injections.bodyEndHtml;
    doc.body.appendChild(template.content.cloneNode(true));
  }

  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
};

const parsePreviewDocument = (srcDoc: string): Document | null => {
  if (typeof DOMParser === 'undefined') {
    return null;
  }
  return new DOMParser().parseFromString(srcDoc, 'text/html');
};

const injectPreviewSecurityPolicy = (srcDoc: string): string => {
  const parsedDocument = parsePreviewDocument(srcDoc);
  if (!parsedDocument) {
    return srcDoc;
  }

  // Guard on the injected <meta> ELEMENT, not the raw policy string or the
  // attribute text: model prose that merely mentions "Content-Security-Policy"
  // (e.g. a tutorial showing the attribute, or a <pre> displaying the meta
  // syntax) must not suppress the restrictive preview CSP — that would leave
  // the artifact running without one.
  if (parsedDocument.head.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
    return srcDoc;
  }

  return injectIntoParsedDocument(parsedDocument, { headElements: [PREVIEW_CONTENT_SECURITY_POLICY_META] });
};

const resolvePreviewTheme = (themeId?: string) => {
  return (
    AVAILABLE_THEMES.find((theme) => theme.id === themeId) ??
    AVAILABLE_THEMES.find((theme) => theme.id === DEFAULT_THEME_ID) ??
    AVAILABLE_THEMES[0]
  );
};

const buildPreviewThemeStyle = (themeId?: string, options: { varsOnly?: boolean } = {}): string => {
  const theme = resolvePreviewTheme(themeId);
  const colors = theme.colors;
  const colorScheme = DARK_LIVE_ARTIFACT_THEME_IDS.has(theme.id) ? 'dark' : 'light';

  const cssVars = [
    `--amc-live-artifact-text:${colors.textPrimary}`,
    `--amc-live-artifact-muted:${colors.textSecondary}`,
    `--amc-live-artifact-subtle:${colors.textTertiary}`,
    `--amc-live-artifact-surface:${colors.bgTertiary}`,
    `--amc-live-artifact-surface-muted:${colors.bgInput}`,
    `--amc-live-artifact-border:${colors.borderSecondary}`,
    `--amc-live-artifact-accent:${colors.textLink}`,
    `--amc-live-artifact-accent-surface:${colors.bgInfo}`,
    `--amc-live-artifact-success:${colors.textSuccess}`,
    `--amc-live-artifact-success-surface:${colors.bgSuccess}`,
    `--amc-live-artifact-danger:${colors.textDanger}`,
    `--amc-live-artifact-danger-surface:${colors.bgErrorMessage}`,
    `--amc-live-artifact-warning:${colors.textWarning}`,
    `--amc-live-artifact-warning-surface:${colors.bgWarning}`,
  ].join(';');

  if (options.varsOnly) {
    return `<style ${PREVIEW_THEME_ATTRIBUTE}="true">:root{color-scheme:${colorScheme};${cssVars};}</style>`;
  }

  // height/min-height auto: model CSS often uses min-height:100vh / height:100%, which
  // expands to the iframe viewport and reports a locked tall height (blank under content).
  // Surface tokens must be soft fills (bgInfo/bgSuccess/…), never solid interactive fills like bgAccent.
  // bgAccent equals textLink on pearl (#2563eb); pairing accent text on accent-surface would be invisible.
  return `<style ${PREVIEW_THEME_ATTRIBUTE}="true">:root{color-scheme:${colorScheme};${cssVars};}html,body{margin:0;padding:0;height:auto!important;min-height:0!important;max-height:none!important;background:transparent!important;color:var(--amc-live-artifact-text);}body{overflow-x:auto;}</style>`;
};

const injectPreviewTheme = (srcDoc: string, themeId?: string): string => {
  // Guard on the <style> ELEMENT carrying the theme marker, not the bare marker
  // string or the attribute text. A model output that merely references the
  // attribute (e.g. shows `data-amc-live-artifact-theme` in a demo) must not
  // skip the injection and leave every --amc-live-artifact-* variable
  // undefined.
  const parsedDocument = parsePreviewDocument(srcDoc);
  if (!parsedDocument) {
    return srcDoc;
  }
  if (parsedDocument.head.querySelector(`style[${PREVIEW_THEME_ATTRIBUTE}]`)) {
    return srcDoc;
  }

  return injectIntoParsedDocument(parsedDocument, { headElements: [buildPreviewThemeStyle(themeId)] });
};

const buildPreviewBaseFontSizeStyle = (baseFontSize?: number): string => {
  if (typeof baseFontSize !== 'number' || !Number.isFinite(baseFontSize)) {
    return '';
  }

  const fontSize = Math.max(1, Math.round(baseFontSize));
  return `<style ${PREVIEW_BASE_FONT_SIZE_ATTRIBUTE}="true">:root{--amc-live-artifact-font-size:${fontSize}px;font-size:var(--amc-live-artifact-font-size);}body{font-size:var(--amc-live-artifact-font-size);}</style>`;
};

const injectPreviewBaseFontSize = (srcDoc: string, baseFontSize?: number): string => {
  const style = buildPreviewBaseFontSizeStyle(baseFontSize);
  if (!style) {
    return srcDoc;
  }

  // Guard on the injected <style> element, not the bare marker string, so model
  // prose that mentions the attribute still gets the font-size injection.
  const parsedDocument = parsePreviewDocument(srcDoc);
  if (!parsedDocument) {
    return srcDoc;
  }
  if (parsedDocument.head.querySelector(`style[${PREVIEW_BASE_FONT_SIZE_ATTRIBUTE}]`)) {
    return srcDoc;
  }

  return injectIntoParsedDocument(parsedDocument, { headElements: [style] });
};

const prepareHtmlPreviewSrcDoc = (srcDoc: string, options: { baseFontSize?: number; themeId?: string } = {}): string =>
  renderPreviewMath(
    injectPreviewBaseFontSize(
      injectPreviewTheme(injectPreviewSecurityPolicy(srcDoc), options.themeId),
      options.baseFontSize,
    ),
  );

export const buildStreamingHtmlPreviewRenderPayload = (htmlContent: string): string => {
  return renderPreviewMath(htmlContent);
};

const sanitizePreviewHtml = (htmlContent: string): string => {
  if (typeof DOMParser === 'undefined') {
    return htmlContent;
  }

  const parsedDocument = new DOMParser().parseFromString(htmlContent, 'text/html');
  sanitizeElementTree(parsedDocument);
  return `<!DOCTYPE html>${parsedDocument.documentElement.outerHTML}`;
};

/**
 * Append the preview bridge script at the end of a parsed document's <body> via
 * the DOM. Replaces the fragile `srcDoc.replace(/<\/body>/i, …)` which hit the
 * FIRST literal `</body>` — inside a <script> string or displayed <pre> text,
 * that dropped the bridge into the middle of JS and crashed the page (white
 * screen). DOMParser never executes scripts, so appending then serializing is
 * safe and stays anchored to the real body.
 */
const appendBridgeScriptToDocument = (parsedDocument: Document): string => {
  const template = parsedDocument.createElement('template');
  template.innerHTML = PREVIEW_BRIDGE_SCRIPT;
  parsedDocument.body.appendChild(template.content.cloneNode(true));
  return `<!DOCTYPE html>${parsedDocument.documentElement.outerHTML}`;
};

type HtmlPreviewSrcDocOptions = {
  baseFontSize?: number;
  themeId?: string;
  privilege?: HtmlPreviewPrivilege;
};

const buildSanitizedHtmlPreviewSrcDoc = (
  htmlContent: string,
  options: { baseFontSize?: number; themeId?: string } = {},
): string => {
  if (!htmlContent) {
    const srcDoc = `<!DOCTYPE html><html><body></body></html>`;
    return prepareHtmlPreviewSrcDoc(srcDoc, options);
  }

  const sanitized = sanitizePreviewHtml(htmlContent);
  const parsedDocument = parsePreviewDocument(sanitized);
  if (!parsedDocument) {
    return sanitized;
  }
  const srcDoc = appendBridgeScriptToDocument(parsedDocument);
  return prepareHtmlPreviewSrcDoc(srcDoc, options);
};

const buildUnrestrictedPreviewDocument = (htmlContent: string): string => {
  if (!htmlContent) {
    return `<!DOCTYPE html><html><head></head><body></body></html>`;
  }

  // Parse whatever the model produced. DOMParser auto-wraps fragments in a full
  // <html><head></head><body> document without rewriting existing markup, so no
  // `/<html[\s>]/` sniffing is needed — a fragment and a full document both end
  // up with the bridge appended to the real body. Unlike string replacement
  // (`replace(/<\/body>/i, …)`) this cannot land the bridge inside a `</body>`
  // literal in a <script> string or <pre> text.
  const parsedDocument = parsePreviewDocument(htmlContent);
  if (!parsedDocument) {
    return htmlContent;
  }

  return appendBridgeScriptToDocument(parsedDocument);
};

/**
 * One HTML preview runtime, two privilege tiers.
 *
 * Default `sanitized` is the Live Artifact widget (CSP, sanitizer, theme, KaTeX).
 * `unrestricted` is the code-block demo player (no sanitizer/CSP/theme/KaTeX).
 */
export const buildHtmlPreviewSrcDoc = (htmlContent: string, options: HtmlPreviewSrcDocOptions = {}): string => {
  if (options.privilege === 'unrestricted') {
    return buildUnrestrictedPreviewDocument(htmlContent);
  }

  return buildSanitizedHtmlPreviewSrcDoc(htmlContent, options);
};

export const buildStreamingHtmlPreviewSrcDoc = (options: { baseFontSize?: number; themeId?: string } = {}): string => {
  const srcDoc = `<!DOCTYPE html><html><body><div data-amc-stream-preview-root="true"></div></body></html>`;
  const parsedDocument = parsePreviewDocument(srcDoc);
  if (!parsedDocument) {
    return srcDoc;
  }
  const withBridge = appendBridgeScriptToDocument(parsedDocument);
  const withRunner = parsePreviewDocument(withBridge);
  if (!withRunner) {
    return withBridge;
  }
  const runnerTemplate = withRunner.createElement('template');
  runnerTemplate.innerHTML = STREAMING_PREVIEW_RUNNER_SCRIPT;
  withRunner.body.appendChild(runnerTemplate.content.cloneNode(true));
  return prepareHtmlPreviewSrcDoc(`<!DOCTYPE html>${withRunner.documentElement.outerHTML}`, options);
};

/**
 * Code-block demo player. Same runtime as `buildHtmlPreviewSrcDoc` with
 * `privilege: 'unrestricted'`.
 */
export const buildUnrestrictedHtmlPreviewSrcDoc = (
  htmlContent: string,
  options: { baseFontSize?: number; themeId?: string } = {},
): string => {
  return buildHtmlPreviewSrcDoc(htmlContent, { ...options, privilege: 'unrestricted' });
};

export const createStaticPreviewSnapshotContainer = async (
  htmlContent: string,
  targetDocument: Document,
  options: { themeId?: string; sanitize?: boolean } = {},
): Promise<{ container: HTMLElement; cleanup: () => void }> => {
  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(htmlContent, 'text/html');

  if (options.sanitize !== false) {
    sanitizeElementTree(parsedDocument);
  }
  // Hydrate declarative charts as static SVG so the PNG export matches the
  // on-screen artifact. The theme style (varsOnly) is injected so chart SVG
  // colors resolve on the parent page, which never defines --amc-live-artifact-*.
  hydrateChartsIntoDocument(parsedDocument, {
    themeStyle: buildPreviewThemeStyle(options.themeId, { varsOnly: true }),
  });
  // Graphviz hydration needs the lazy viz-js runtime, so the snapshot build is
  // async. Both are awaited before the container is measured and exported.
  await hydrateGraphvizIntoDocument(parsedDocument, { themeId: options.themeId });

  const container = targetDocument.createElement('div');
  container.className = 'is-exporting-png html-preview-snapshot';
  Object.assign(container.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '1200px',
    transform: 'translateX(-200vw)',
    pointerEvents: 'none',
    zIndex: '-1',
    overflow: 'hidden',
    background: '#ffffff',
  });

  parsedDocument.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    container.appendChild(cloneIntoDocument(node, targetDocument));
  });

  const bodyWrapper = targetDocument.createElement('div');
  bodyWrapper.className = parsedDocument.body.className;
  const inlineBodyStyle = parsedDocument.body.getAttribute('style');
  if (inlineBodyStyle) {
    bodyWrapper.setAttribute('style', inlineBodyStyle);
  }

  Array.from(parsedDocument.body.childNodes).forEach((node) => {
    bodyWrapper.appendChild(cloneIntoDocument(node, targetDocument));
  });

  container.appendChild(bodyWrapper);
  targetDocument.body.appendChild(container);

  return {
    container,
    cleanup: () => {
      container.remove();
    },
  };
};
