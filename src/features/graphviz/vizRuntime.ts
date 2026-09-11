import DOMPurify from 'dompurify';
import { logService } from '@/services/logService';
import { AVAILABLE_THEMES, DEFAULT_THEME_ID } from '@/constants/themeRegistry';
import type { Theme } from '@/types/theme';
import { getErrorMessage } from '@/utils/errorMessage';
import { hashString } from '@/utils/stringHash';
import { DOT_MAX_CHARS, DOT_MAX_EDGES, DOT_MAX_NODES, countDotEdges, countDotNodes } from './graphvizLimits';

/**
 * Shared Graphviz (viz-js) runtime used by three render paths so they all lay
 * out the same DOT through one cache and one sanitizer:
 *
 *  1. `GraphvizBlock` — the ```graphviz``` code-block renderer (lazy layout
 *     toggle, JPG export, side panel).
 *  2. Live Artifacts `data-amc-graphviz` nodes — the sandboxed iframe asks the
 *     parent page to render (viz.js is WASM and cannot run inside the opaque
 *     origin), and the parent replies through the preview bridge.
 *  3. PNG export hydration — the same runtime renders static SVG into the
 *     export snapshot so the exported transcript matches the on-screen bubble.
 *
 * `loadVizInstance` keeps the dynamic `@viz-js/viz` import (and its ~MB WASM
 * chunk) lazy: it is only fetched the first time a diagram actually renders.
 */

type DotRenderResult =
  | { ok: true; svg: string }
  | { ok: false; error: 'empty' | 'too-large'; message?: never }
  | { ok: false; error: 'render-failed'; message: string };

interface DotRenderOptions {
  themeId?: string;
  /**
   * Forced layout. When omitted the DOT's own rankdir wins; when no rankdir is
   * present it defaults to LR (the Live Artifacts DSL default). GraphvizBlock
   * passes the user's manual LR/TB toggle here.
   */
  layout?: 'LR' | 'TB';
  /**
   * Chat ```graphviz``` / ```dot``` blocks pass true so author hex and named
   * colors survive. Live Artifacts keep the default (false) and scrub
   * hardcoded colors down to the theme palette.
   */
  preserveAuthorColors?: boolean;
}

type VizInstance = {
  renderSVGElement: (code: string) => SVGSVGElement | Promise<SVGSVGElement>;
};

let vizInstancePromise: Promise<VizInstance> | null = null;

export const getVizInstance = async (): Promise<VizInstance> => {
  if (!vizInstancePromise) {
    vizInstancePromise = import('@viz-js/viz')
      .then(({ instance }) => instance())
      .catch((error) => {
        vizInstancePromise = null;
        throw error;
      });
  }
  return vizInstancePromise;
};

const GRAPHVIZ_CACHE_LIMIT = 64;
const graphvizCache = new Map<string, string>();

// LRU eviction: Map preserves insertion order, so deleting the oldest entry
// before re-inserting on access keeps the cache bounded.
const touchGraphvizCache = (key: string, value: string) => {
  graphvizCache.delete(key);
  graphvizCache.set(key, value);
  while (graphvizCache.size > GRAPHVIZ_CACHE_LIMIT) {
    const oldestKey = graphvizCache.keys().next().value;
    if (oldestKey === undefined) break;
    graphvizCache.delete(oldestKey);
  }
};

const THEME_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const resolveGraphvizTheme = (themeId?: string): Theme => {
  if (themeId && THEME_ID_PATTERN.test(themeId)) {
    const theme = AVAILABLE_THEMES.find((candidate) => candidate.id === themeId);
    if (theme) return theme;
  }
  return AVAILABLE_THEMES.find((candidate) => candidate.id === DEFAULT_THEME_ID) ?? AVAILABLE_THEMES[0];
};

/**
 * Derives the effective layout from a DOT string the same way GraphvizBlock
 * did: an explicit rankdir wins, otherwise LR. Exposed so the cache key and the
 * actual render always agree even when `layout` was not passed explicitly.
 */
export const resolveDotLayout = (dot: string, forced?: 'LR' | 'TB'): 'LR' | 'TB' => {
  if (forced === 'LR' || forced === 'TB') return forced;
  const match = dot.match(/rankdir\s*=\s*(["']?)(LR|TB|RL|BT)\1/i);
  if (match) {
    const dir = match[2].toUpperCase();
    if (dir === 'TB' || dir === 'BT') return 'TB';
    return 'LR';
  }
  return 'LR';
};

export const getGraphvizCacheKey = (dot: string, options: DotRenderOptions = {}): string => {
  const layout = resolveDotLayout(dot, options.layout);
  const colorMode = options.preserveAuthorColors ? 'author' : 'theme';
  return `${RENDER_STYLE_VERSION}:${options.themeId ?? ''}:${layout}:${colorMode}:${hashString(dot)}`;
};

// Semantic color names allowed by the Live Artifacts graphviz DSL. Strokes and
// text map to the theme's readable text colors; fills are flattened onto the
// theme surface so a data-amc-graphviz diagram stays on-theme without washing
// out on a transparent canvas.
const SEMANTIC_COLOR_ATTRS = ['color', 'fontcolor', 'fillcolor', 'bgcolor', 'bordercolor'];
const SEMANTIC_COLOR_NAMES = ['accent', 'success', 'warning', 'danger', 'muted', 'subtle'];
const SEMANTIC_TEXT_MAP: Record<string, keyof Theme['colors']> = {
  accent: 'textLink',
  success: 'textSuccess',
  warning: 'textWarning',
  danger: 'textDanger',
  muted: 'textSecondary',
  subtle: 'textTertiary',
};
const SEMANTIC_FILL_MAP: Record<string, keyof Theme['colors']> = {
  accent: 'bgInfo',
  success: 'bgSuccess',
  warning: 'bgWarning',
  danger: 'bgErrorMessage',
  muted: 'bgInput',
  subtle: 'bgTertiary',
};

// Matches `rgb(r, g, b)` and `rgba(r, g, b, a)` with integer channels and an
// optional float alpha. Theme surface colors are authored in this CSS function
// form; Graphviz does not understand it.
const RGBA_CSS_COLOR_PATTERN = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i;

const toHexByte = (value: number): string =>
  Math.min(255, Math.max(0, Math.round(value)))
    .toString(16)
    .padStart(2, '0');

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

type RgbaColor = { r: number; g: number; b: number; a: number };

const parseCssColor = (color: string): RgbaColor | null => {
  const trimmed = color.trim();
  const rgba = RGBA_CSS_COLOR_PATTERN.exec(trimmed);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  const hex = HEX_COLOR_PATTERN.exec(trimmed);
  if (!hex) return null;
  let digits = hex[1];
  if (digits.length === 3) {
    digits = `${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`;
  }
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
    a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
  };
};

/**
 * Graphviz accepts X11 color names, `#hex`, HSV triples, and float rgb lists —
 * but not CSS `rgb()/rgba()` functions. An unrecognized color silently falls
 * back to opaque black, which is how a semantic fill (`fillcolor=accent`) turned
 * into a black node. Theme surface colors are rgba strings, so every color
 * injected into the DOT must be normalized to 8-digit hex (`#RRGGBBAA`, an alpha
 * channel Graphviz does support) first. Values that are already Graphviz-safe
 * (hex, names) pass through untouched. Only the integer-channel `rgba()` form is
 * handled; percentage channels and `hsl()` are not used by any current theme and
 * would need this function extended.
 */
export const normalizeGraphvizColor = (color: string): string => {
  const trimmed = color.trim();
  const match = RGBA_CSS_COLOR_PATTERN.exec(trimmed);
  if (!match) return trimmed;

  const [, r, g, b, a] = match;
  const alpha = a === undefined ? 255 : Math.round(parseFloat(a) * 255);
  return `#${toHexByte(Number(r))}${toHexByte(Number(g))}${toHexByte(Number(b))}${toHexByte(alpha)}`;
};

/** Graphviz nodes are small; HTML surface alphas (~0.06–0.1) read as almost white. */
const GRAPHVIZ_MIN_FILL_ALPHA = 0.22;

/**
 * Flatten a (possibly translucent) theme surface onto an opaque base so Graphviz
 * fills stay visible against `bgcolor=transparent`. Already-opaque hex passes
 * through. Used for semantic fillcolor/bgcolor, not for strokes.
 */
export const flattenGraphvizFill = (color: string, onto: string): string => {
  const fg = parseCssColor(color);
  if (!fg) return normalizeGraphvizColor(color);
  if (fg.a >= 0.999) {
    return `#${toHexByte(fg.r)}${toHexByte(fg.g)}${toHexByte(fg.b)}`;
  }
  const bg = parseCssColor(onto) ?? { r: 255, g: 255, b: 255, a: 1 };
  const alpha = Math.max(fg.a, GRAPHVIZ_MIN_FILL_ALPHA);
  const mix = (channel: number, base: number) => channel * alpha + base * (1 - alpha);
  return `#${toHexByte(mix(fg.r, bg.r))}${toHexByte(mix(fg.g, bg.g))}${toHexByte(mix(fg.b, bg.b))}`;
};

const GRAPHVIZ_SVG_FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Helvetica, sans-serif';

// Bump when the injected default styling changes so cached SVGs rendered with
// the previous style are never reused (see getGraphvizCacheKey).
const RENDER_STYLE_VERSION = 'v7';

/**
 * Theme-aware default styles injected before the model's own DOT so a bare
 * graph renders as rounded, soft-filled cards with readable spacing. DOT merges
 * same-named attributes with "last wins" and different-named attributes by
 * union, so anything the model writes explicitly still overrides these
 * fallbacks — exactly the safety-net semantics we want.
 */
export const buildThemeDefaults = (colors: Theme['colors']): string => `
  graph [
    bgcolor="transparent"
    pad="0.24"
    nodesep="0.45"
    ranksep="0.7"
    splines="true"
    compound="true"
    outputorder="edgesfirst"
    newrank="true"
    fontname="Helvetica"
    fontcolor="${normalizeGraphvizColor(colors.textPrimary)}"
  ];
  node [
    shape="box"
    style="rounded,filled"
    fillcolor="${flattenGraphvizFill(colors.bgInput, colors.bgInput)}"
    color="${normalizeGraphvizColor(colors.borderSecondary)}"
    fontname="Helvetica"
    fontcolor="${normalizeGraphvizColor(colors.textPrimary)}"
    penwidth="1.2"
    margin="0.18,0.1"
  ];
  edge [
    color="${normalizeGraphvizColor(colors.textSecondary)}"
    fontcolor="${normalizeGraphvizColor(colors.textSecondary)}"
    fontname="Helvetica"
    penwidth="1.25"
    arrowsize="0.8"
  ];
`;

/**
 * After hardcoded color attributes are deleted, comma-separated lists often
 * become `label="x", , , shape=box` or `[penwidth=2, ]`. Graphviz treats an
 * empty attribute as a syntax error (commonly reported near `,` or `;`).
 * Commas inside quoted labels / font stacks must be left alone.
 */
const cleanupEmptyDotAttributes = (dot: string): string => {
  let out = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let i = 0; i < dot.length; i += 1) {
    const ch = dot[i];

    if (quote) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }

    if (ch === ',') {
      let nextIndex = i + 1;
      while (nextIndex < dot.length && /\s/.test(dot[nextIndex])) {
        nextIndex += 1;
      }
      const next = dot[nextIndex];
      if (next === ',' || next === ']') {
        continue;
      }
      if (out.trimEnd().endsWith('[')) {
        continue;
      }
    }

    out += ch;
  }

  return out;
};

/**
 * Recognizes CJK unified ideographs, extensions, and standard CJK punctuation/brackets.
 */
export const isCjkText = (str: string): boolean =>
  /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff01-\uff60\u2018-\u201f]/.test(str);

/**
 * WebAssembly Graphviz compiles without system TrueType/FreeType font metrics and
 * falls back to Latin (Helvetica) Adobe Font Metrics (~0.5em/char). Browser fonts
 * (PingFang SC, Microsoft YaHei) render CJK characters at 1.0em squares, which causes
 * Chinese labels to overflow / burst through node boundaries by ~20-40px on both sides.
 *
 * This function calculates the true rendered bounding width in inches so Graphviz
 * can layout cards with sufficient width and comfortable breathing margins.
 */
export const estimateCjkNodeWidth = (label: string, fontSize = 14): number => {
  const lines = label.split(/\\n|\n|<br\s*\/?>/i);
  let maxPt = 0;
  for (const line of lines) {
    let cjk = 0;
    let latin = 0;
    for (const char of line) {
      if (isCjkText(char)) {
        cjk += 1;
      } else {
        latin += 1;
      }
    }
    const lineWidthPt = cjk * fontSize * 1.05 + latin * fontSize * 0.58;
    if (lineWidthPt > maxPt) maxPt = lineWidthPt;
  }
  // 28pt padding (~0.39 in) provides safe breathing margin around text
  const widthInches = (maxPt + 28) / 72;
  return Math.max(0.75, Number(widthInches.toFixed(2)));
};

const DOT_DECLARATION_KEYWORDS = new Set(['graph', 'node', 'edge', 'subgraph', 'strict', 'digraph']);

/**
 * Scans DOT statements and dynamically injects or updates `width="..."` on any node
 * containing CJK characters, preventing text from clipping or bursting through borders.
 */
export const compensateCjkNodeWidths = (dot: string): string => {
  let out = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let inBracket = false;
  let bracketContent = '';
  let lastIdent = '';
  let sawSpaceAfterIdent = false;
  let isEdgeStatement = false;

  for (let i = 0; i < dot.length; i += 1) {
    const ch = dot[i];

    if (quote) {
      if (inBracket) {
        bracketContent += ch;
      } else {
        out += ch;
      }

      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      if (inBracket) {
        bracketContent += ch;
      } else {
        out += ch;
      }
      continue;
    }

    if (!inBracket) {
      if (ch === '[' && lastIdent) {
        inBracket = true;
        bracketContent = '';
        continue;
      }

      out += ch;

      if (ch === ';' || ch === '{' || ch === '}' || ch === '\n') {
        lastIdent = '';
        sawSpaceAfterIdent = false;
        isEdgeStatement = false;
      } else if (ch === '-' && (dot[i + 1] === '>' || dot[i + 1] === '-')) {
        isEdgeStatement = true;
      } else if (/[a-zA-Z0-9_\u4e00-\u9fa5]/.test(ch)) {
        if (sawSpaceAfterIdent) {
          lastIdent = ch;
          sawSpaceAfterIdent = false;
        } else {
          lastIdent += ch;
        }
      } else if (/\s/.test(ch)) {
        if (lastIdent) sawSpaceAfterIdent = true;
      } else {
        lastIdent = '';
        sawSpaceAfterIdent = false;
      }
    } else {
      if (ch === ']') {
        inBracket = false;
        const nodeId = lastIdent.trim();
        lastIdent = '';
        sawSpaceAfterIdent = false;

        if (!isEdgeStatement && !DOT_DECLARATION_KEYWORDS.has(nodeId.toLowerCase())) {
          const labelMatch = bracketContent.match(/\blabel\s*=\s*"([^"]*)"/);
          const textToMeasure = labelMatch ? labelMatch[1] : isCjkText(nodeId) ? nodeId : '';

          if (textToMeasure && isCjkText(textToMeasure)) {
            const fontSizeMatch = bracketContent.match(/\bfontsize\s*=\s*["']?([0-9.]+)["']?/i);
            const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 14;
            const requiredWidth = estimateCjkNodeWidth(textToMeasure, fontSize);
            const existingWidthMatch = bracketContent.match(/\bwidth\s*=\s*["']?([0-9.]+)["']?/i);

            if (existingWidthMatch) {
              const existingWidth = parseFloat(existingWidthMatch[1]);
              if (existingWidth < requiredWidth) {
                bracketContent = bracketContent.replace(/\bwidth\s*=\s*["']?[0-9.]+["']?/i, `width="${requiredWidth}"`);
              }
            } else {
              bracketContent = `${bracketContent.trimEnd()} width="${requiredWidth}"`;
            }
          }
        }

        out += `[${bracketContent}]`;
      } else {
        bracketContent += ch;
      }
    }
  }

  return out;
};

export const applyThemeAndLayout = (dot: string, options: DotRenderOptions): string => {
  let code = dot;
  const layout = resolveDotLayout(code, options.layout);
  const colors = resolveGraphvizTheme(options.themeId).colors;

  // Compensate CJK node widths so WebAssembly Graphviz accurately sizes card boundaries for Chinese text
  code = compensateCjkNodeWidths(code);

  // Normalize style="rounded" to style="rounded,filled" so fillcolor is never ignored when the model specifies rounded style
  code = code.replace(/\bstyle\s*=\s*(["'])rounded\1/gi, 'style=$1rounded,filled$1');

  // Layout: rewrite an explicit rankdir, or inject the default right after the
  // graph-opening declaration so it wins over any node/edge defaults below.
  const rankdirRegex = /(rankdir\s*=\s*)(["']?)(LR|TB|RL|BT)\2/gi;
  if (rankdirRegex.test(code)) {
    code = code.replace(rankdirRegex, `$1"${layout}"`);
  } else {
    const graphMatch = code.match(/(\s*(?:di)?graph\s+[\w\d_"]*\s*\{)/i);
    if (graphMatch) {
      code = code.replace(graphMatch[0], `${graphMatch[0]}\n  rankdir="${layout}";`);
    }
  }

  // Semantic color names → theme values. The regex is anchored to a known
  // color attribute so `label="accent"` prose is never rewritten. Fills are
  // flattened onto the theme surface; strokes/text use the readable text palette.
  // fillcolor/bgcolor also pair a matching color+fontcolor so a lone
  // `fillcolor=success` is not a pale box with a gray border.
  const semanticColorPattern = new RegExp(
    `\\b(${SEMANTIC_COLOR_ATTRS.join('|')})\\s*=\\s*["']?(${SEMANTIC_COLOR_NAMES.join('|')})["']?`,
    'gi',
  );

  // Strip hardcoded color values the model wrote (violating the Live Artifacts
  // protocol) so the injected theme defaults win. Must run BEFORE the semantic
  // replacement: afterwards every semantic name has been rewritten to a hex/rgb
  // value and there is no way to tell it apart from a model-hardcoded color.
  // The negative lookahead excludes semantic names, which the next pass maps to
  // theme colors. The whole attribute is removed (rather than remapped) so
  // `fillcolor="#000" fontcolor="#fff"` both fall back to the node defaults
  // instead of ending up light-on-light.
  //
  // The lookbehind anchors the attribute name to a structural boundary (`[`,
  // space, `;`, `,`, `{`) while rejecting quote chars (label prose) and word
  // chars (`somefillcolor`). It does not consume the boundary, so two adjacent
  // hardcoded attrs on one line both get stripped. Values are split by shape
  // because a bare named color is ambiguous with an arbitrary word (needs the
  // semantic-name lookahead), while hex/rgb are distinctive on their own.
  const namedColorValue = `(?!(?:${SEMANTIC_COLOR_NAMES.join('|')})\\b)[a-zA-Z][a-zA-Z0-9-]*`;
  const attrName = `(?<!["'\\w])(?:${SEMANTIC_COLOR_ATTRS.join('|')})`;
  const hardcodedColorPattern = new RegExp(
    // rgba?() first so `rgb` is not consumed as a bare word by the named branch.
    `${attrName}\\s*=\\s*["']?(?:rgba?\\([^)]*\\)|#[0-9a-fA-F]{3,8}|${namedColorValue})["']?`,
    'gi',
  );
  if (!options.preserveAuthorColors) {
    code = cleanupEmptyDotAttributes(code.replace(hardcodedColorPattern, ''));
  }

  code = code.replace(semanticColorPattern, (_match, attr: string, name: string) => {
    const semantic = name.toLowerCase();
    const stroke = normalizeGraphvizColor(colors[SEMANTIC_TEXT_MAP[semantic] ?? 'textPrimary']);
    const isFill = attr.toLowerCase() === 'fillcolor' || attr.toLowerCase() === 'bgcolor';
    if (isFill) {
      const fillKey = SEMANTIC_FILL_MAP[semantic] ?? 'bgInput';
      const fill = flattenGraphvizFill(colors[fillKey], colors.bgInput);
      return `${attr}="${fill}" color="${stroke}" fontcolor="${normalizeGraphvizColor(colors.textPrimary)}"`;
    }
    return `${attr}="${stroke}"`;
  });

  // Theme defaults are injected after the opening brace and after semantic color
  // replacement (they only carry concrete hex values, so nothing is rewritten).
  const themeDefaults = buildThemeDefaults(colors);

  const openBraceIndex = code.indexOf('{');
  if (openBraceIndex !== -1) {
    code = code.slice(0, openBraceIndex + 1) + themeDefaults + code.slice(openBraceIndex + 1);
  }

  code = injectClusterDefaults(code, colors);

  return code;
};

const injectClusterDefaults = (dot: string, colors: Theme['colors']): string => {
  const clusterStyle = `
    style="rounded,dashed"
    penwidth="1.35"
    color="${normalizeGraphvizColor(colors.borderSecondary)}"
    fontcolor="${normalizeGraphvizColor(colors.textSecondary)}"
    bgcolor="${flattenGraphvizFill(colors.bgTertiary, colors.bgInput)}"
    margin="16"
    fontsize="11"
    fontname="Helvetica"
`;
  return dot.replace(/\bsubgraph\s+(cluster\w*)\s*\{/gi, (match) => `${match}${clusterStyle}`);
};

const applyGraphvizSvgFonts = (svg: SVGSVGElement): void => {
  const rewrite = (el: Element) => {
    if (el.hasAttribute('font-family')) {
      el.setAttribute('font-family', GRAPHVIZ_SVG_FONT_FAMILY);
    }
    const style = el.getAttribute('style');
    if (style && /font-family\s*:/i.test(style)) {
      el.setAttribute('style', style.replace(/font-family\s*:\s*[^;]+/gi, `font-family: ${GRAPHVIZ_SVG_FONT_FAMILY}`));
    }
  };
  svg.setAttribute('font-family', GRAPHVIZ_SVG_FONT_FAMILY);
  rewrite(svg);
  svg.querySelectorAll('[font-family], [style]').forEach(rewrite);
};

const sanitizeSvg = (svg: string): string => {
  // viz output is not trusted (HTML-like labels can carry event handlers), so
  // sanitize with the SVG profile and strip on* / non-https hrefs. The hook is
  // scoped to this call and removed afterwards so other sanitizers (Mermaid)
  // keep the default behavior.
  const stripDangerousAttributes = (
    _node: Element,
    data: { attrName: string; attrValue: string; keepAttr: boolean },
  ) => {
    if (data.attrName.startsWith('on')) {
      data.keepAttr = false;
      return;
    }
    if (
      (data.attrName === 'href' || data.attrName === 'xlink:href') &&
      data.attrValue &&
      !/^https:/i.test(data.attrValue.trim())
    ) {
      data.keepAttr = false;
    }
  };
  DOMPurify.addHook('uponSanitizeAttribute', stripDangerousAttributes);
  try {
    return DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['script', 'a'],
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute', stripDangerousAttributes);
  }
};

/**
 * Renders DOT to a sanitized SVG string. Never throws for invalid input — the
 * result carries a machine-readable error so the Live Artifacts bridge can show
 * the DOT source as a fallback and the export path can skip the node.
 */
export const renderDotToSvg = async (dot: string, options: DotRenderOptions = {}): Promise<DotRenderResult> => {
  const code = dot.trim();
  if (!code) {
    return { ok: false, error: 'empty' };
  }
  if (code.length > DOT_MAX_CHARS || countDotNodes(code) > DOT_MAX_NODES || countDotEdges(code) > DOT_MAX_EDGES) {
    return { ok: false, error: 'too-large' };
  }

  try {
    const vizInstance = await getVizInstance();
    const processedCode = applyThemeAndLayout(code, options);
    const svgElement = await vizInstance.renderSVGElement(processedCode);
    applyGraphvizSvgFonts(svgElement);

    // Keep the SVG at its natural width so narrow diagrams center via
    // margin:auto and wide ones scroll in the container instead of being
    // proportionally squashed into the available width.
    svgElement.style.maxWidth = 'none';
    svgElement.style.margin = '0 auto';
    svgElement.style.height = 'auto';
    svgElement.style.display = 'block';

    return { ok: true, svg: sanitizeSvg(svgElement.outerHTML) };
  } catch (error) {
    const message = getErrorMessage(error, 'Graphviz render failed');
    logService.error('Failed to render Graphviz diagram', error);
    return { ok: false, error: 'render-failed', message };
  }
};

/**
 * Cached twin of `renderDotToSvg`, shared by the Live Artifacts bridge and the
 * export path. The cache key includes theme + layout, so a diagram rendered for
 * one theme never leaks a stale color into another theme's snapshot.
 */
export const renderDotToSvgCached = async (dot: string, options: DotRenderOptions = {}): Promise<DotRenderResult> => {
  const key = getGraphvizCacheKey(dot, options);
  const cached = graphvizCache.get(key);
  if (cached !== undefined) {
    touchGraphvizCache(key, cached);
    return { ok: true, svg: cached };
  }

  const result = await renderDotToSvg(dot, {
    ...options,
    layout: resolveDotLayout(dot, options.layout),
  });
  if (result.ok) {
    touchGraphvizCache(key, result.svg);
  }
  return result;
};

/**
 * Hydrates every `data-amc-graphviz` node in a detached document (the PNG-export
 * snapshot) as static SVG. Failures leave the node untouched so the export never
 * breaks on a bad diagram — it just shows the inert placeholder.
 */
export const hydrateGraphvizIntoDocument = async (doc: Document, options: DotRenderOptions = {}): Promise<void> => {
  const nodes = Array.from(doc.querySelectorAll('[data-amc-graphviz]'));
  if (nodes.length === 0) {
    return;
  }

  await Promise.all(
    nodes.map(async (node) => {
      const dot = node.getAttribute('data-amc-graphviz') ?? '';
      const result = await renderDotToSvgCached(dot, options);
      if (!result.ok) return;

      try {
        const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
        if (parsed.querySelector('parsererror')) return;

        const htmlEl = node as HTMLElement;
        htmlEl.style.overflowX = 'auto';
        htmlEl.style.maxWidth = '100%';
        htmlEl.style.display = 'block';
        htmlEl.style.cursor = 'zoom-in';
        htmlEl.setAttribute('data-amc-graphviz-state', 'rendered');
        htmlEl.setAttribute('title', '点击放大查看 / Click to zoom');

        node.replaceChildren(parsed.documentElement);
      } catch {
        // Leave the node as-is; it stays an inert placeholder in the snapshot.
      }
    }),
  );
};
