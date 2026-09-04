import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AVAILABLE_THEMES } from '@/constants/themeRegistry';
import { DOT_MAX_CHARS, DOT_MAX_EDGES } from './graphvizLimits';
import {
  applyThemeAndLayout,
  buildThemeDefaults,
  flattenGraphvizFill,
  getGraphvizCacheKey,
  normalizeGraphvizColor,
  renderDotToSvg,
  renderDotToSvgCached,
  resolveDotLayout,
  hydrateGraphvizIntoDocument,
} from './vizRuntime';

// Real theme colors (pearl = light) so assertions track the actual registry.
const PEARL = AVAILABLE_THEMES.find((theme) => theme.id === 'pearl')!.colors;

// Provide a fake viz runtime so no WASM is fetched in tests. The returned SVG
// records the processed DOT in a data-code attribute, letting tests assert on
// theme injection / layout rewriting without real layout.
const fakeInstance = {
  renderSVGElement: vi.fn(async (code: string) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-code', code);
    return svg;
  }),
};

vi.mock('@viz-js/viz', () => ({
  instance: vi.fn(async () => fakeInstance),
}));

beforeEach(() => {
  fakeInstance.renderSVGElement.mockClear();
});

// The fake viz stores the processed DOT in a data-code attribute; outerHTML
// serialization HTML-escapes the inner double quotes, so decode via DOMParser
// before asserting on the theme injection / layout rewriting.
const readProcessedCode = (svgString: string): string => {
  const parsed = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  return parsed.documentElement.getAttribute('data-code') ?? '';
};

describe('resolveDotLayout', () => {
  it('defaults to LR when no rankdir present', () => {
    expect(resolveDotLayout('digraph { A -> B }')).toBe('LR');
  });

  it('honors an explicit rankdir', () => {
    expect(resolveDotLayout('digraph { rankdir=TB; A -> B }')).toBe('TB');
  });

  it('forced layout wins over an explicit rankdir', () => {
    expect(resolveDotLayout('digraph { rankdir=TB; A -> B }', 'LR')).toBe('LR');
  });

  it('treats RL/BT as horizontal/vertical families', () => {
    expect(resolveDotLayout('digraph { rankdir=RL; A -> B }')).toBe('LR');
    expect(resolveDotLayout('digraph { rankdir=BT; A -> B }')).toBe('TB');
  });
});

describe('getGraphvizCacheKey', () => {
  it('includes theme, layout, and dot hash', () => {
    const key = getGraphvizCacheKey('digraph { A -> B }', { themeId: 'pearl' });
    expect(key).toContain('pearl');
    expect(key).toContain('LR');
  });

  it('prefixes the key with the render style version', () => {
    expect(getGraphvizCacheKey('digraph { A -> B }')).toMatch(/^v6:/);
  });

  it('normalizes style="rounded" to style="rounded,filled" so fill is preserved', () => {
    const code = applyThemeAndLayout('digraph { node[style="rounded"]; n1[fillcolor=accent] }', { themeId: 'pearl' });
    expect(code).toContain('style="rounded,filled"');
    expect(code).not.toMatch(/style="rounded"(?!,)/);
  });

  it('differs when layout differs for the same dot', () => {
    const lr = getGraphvizCacheKey('digraph { rankdir=TB; A -> B }', { layout: 'LR' });
    const tb = getGraphvizCacheKey('digraph { rankdir=TB; A -> B }', { layout: 'TB' });
    expect(lr).not.toBe(tb);
  });

  it('differs when author-color preservation differs for the same dot', () => {
    const scrubbed = getGraphvizCacheKey('digraph { A [fillcolor="#000"] }', { themeId: 'pearl' });
    const preserved = getGraphvizCacheKey('digraph { A [fillcolor="#000"] }', {
      themeId: 'pearl',
      preserveAuthorColors: true,
    });
    expect(scrubbed).not.toBe(preserved);
  });
});

describe('normalizeGraphvizColor', () => {
  it('converts integer-channel rgba() to 8-digit hex (#RRGGBBAA)', () => {
    expect(normalizeGraphvizColor('rgba(37, 99, 235, 0.06)')).toBe('#2563eb0f');
    expect(normalizeGraphvizColor('rgba(22, 163, 74, 0.1)')).toBe('#16a34a1a');
    expect(normalizeGraphvizColor('rgba(6, 78, 59, 0.25)')).toBe('#064e3b40');
  });

  it('drops the alpha channel when rgb() has none (opaque)', () => {
    expect(normalizeGraphvizColor('rgb(255, 0, 0)')).toBe('#ff0000ff');
  });

  it('rounds fractional alpha to the nearest byte', () => {
    expect(normalizeGraphvizColor('rgba(120, 53, 15, 0.28)')).toBe('#78350f47');
  });

  it('passes Graphviz-safe colors through untouched', () => {
    expect(normalizeGraphvizColor('#fef2f2')).toBe('#fef2f2');
    expect(normalizeGraphvizColor('transparent')).toBe('transparent');
    expect(normalizeGraphvizColor('white')).toBe('white');
    expect(normalizeGraphvizColor('#2563eb')).toBe('#2563eb');
  });

  it('clamps out-of-range positive channels and alpha to the byte range', () => {
    expect(normalizeGraphvizColor('rgba(300, 10, 20, 2)')).toBe('#ff0a14ff');
  });

  it('passes non-integer-channel CSS functions through untouched', () => {
    // Negative channels are not valid CSS rgb() input; the normalizer only owns
    // well-formed integer channels and leaves anything else alone.
    expect(normalizeGraphvizColor('rgba(999, -5, 300, 2)')).toBe('rgba(999, -5, 300, 2)');
  });

  it('does not mangle non-rgba CSS values or prose', () => {
    expect(normalizeGraphvizColor('hsl(220 80% 50%)')).toBe('hsl(220 80% 50%)');
    expect(normalizeGraphvizColor('var(--amc-info)')).toBe('var(--amc-info)');
  });
});

describe('flattenGraphvizFill', () => {
  it('composites translucent surfaces onto an opaque base with a minimum alpha', () => {
    // pearl bgSuccess is 10% green; Graphviz nodes need a stronger opaque mint.
    expect(flattenGraphvizFill('rgba(22, 163, 74, 0.1)', '#ffffff')).toBe('#ccebd7');
  });

  it('leaves already-opaque hex unchanged', () => {
    expect(flattenGraphvizFill('#ffffff', '#000000')).toBe('#ffffff');
    expect(flattenGraphvizFill('#141418', '#000000')).toBe('#141418');
  });
});

describe('buildThemeDefaults', () => {
  it('injects rounded filled card defaults with breathing spacing', () => {
    const defaults = buildThemeDefaults(PEARL);
    expect(defaults).toContain('shape="box"');
    expect(defaults).toContain('style="rounded,filled"');
    expect(defaults).toContain('fillcolor="#ffffff"'); // pearl bgInput
    expect(defaults).toContain('color="#d5d5dc"'); // pearl borderSecondary
    expect(defaults).toContain('pad="0.24"');
    expect(defaults).toContain('nodesep="0.45"');
    expect(defaults).toContain('ranksep="0.7"');
    expect(defaults).toContain('splines="true"');
    expect(defaults).toContain('compound="true"');
    expect(defaults).toContain('arrowsize="0.8"');
    expect(defaults).toContain('penwidth="1.25"');
  });

  it('uses a single sans-serif font, not a CSS font stack', () => {
    const defaults = buildThemeDefaults(PEARL);
    expect(defaults).not.toContain('system-ui');
    expect(defaults).toContain('fontname="Helvetica"');
  });
});

describe('applyThemeAndLayout (v2 theme defaults)', () => {
  it('injects the full card defaults and default LR for a bare DOT', () => {
    const code = applyThemeAndLayout('digraph { A -> B }', { themeId: 'pearl' });
    expect(code).toContain('shape="box"');
    expect(code).toContain('style="rounded,filled"');
    expect(code).toContain('fillcolor="#ffffff"'); // pearl bgInput default node fill
    expect(code).toContain('color="#d5d5dc"'); // pearl borderSecondary node stroke
    expect(code).toContain('pad="0.24"');
    expect(code).toContain('splines="true"');
    expect(code).toContain('arrowsize="0.8"');
    expect(code).toContain('rankdir="LR"');
  });

  it('maps semantic fills to opaque composites and pairs matching stroke/text', () => {
    const code = applyThemeAndLayout('digraph { n1[fillcolor=success]; n2[fillcolor=warning] }', { themeId: 'pearl' });
    const successFill = flattenGraphvizFill(PEARL.bgSuccess, PEARL.bgInput);
    const warningFill = flattenGraphvizFill(PEARL.bgWarning, PEARL.bgInput);
    expect(code).toContain(`fillcolor="${successFill}"`);
    expect(code).toContain(`fillcolor="${warningFill}"`);
    expect(code).toContain('color="#16a34a"'); // pearl textSuccess paired onto n1
    expect(code).toContain('fontcolor="#16a34a"');
    expect(code).toContain('color="#825f0a"'); // pearl textWarning paired onto n2
    expect(code).not.toContain('rgba(');
    expect(code).not.toMatch(/fillcolor="#[0-9a-fA-F]{8}"/);
  });

  it('maps semantic strokes and text to readable text colors', () => {
    const code = applyThemeAndLayout('digraph { n1[color=accent]; n2[fontcolor=muted] }', { themeId: 'pearl' });
    expect(code).toContain('color="#2563eb"'); // pearl textLink
    expect(code).toContain('fontcolor="#4a4a55"'); // pearl textSecondary
  });

  it('maps the accent fill from its rgba surface color, and strokes stay 6-digit hex', () => {
    const code = applyThemeAndLayout('digraph { a[fillcolor=accent]; b[color=accent] }', { themeId: 'pearl' });
    const accentFill = flattenGraphvizFill(PEARL.bgInfo, PEARL.bgInput);
    expect(code).toContain(`fillcolor="${accentFill}"`);
    expect(code).toContain('color="#2563eb"'); // pearl textLink
    expect(code).not.toContain('rgba(');
  });

  it('uses onyx surface colors for the dark theme', () => {
    const ONYX = AVAILABLE_THEMES.find((theme) => theme.id === 'onyx')!.colors;
    const code = applyThemeAndLayout('digraph { n1; n2[fillcolor=success] }', { themeId: 'onyx' });
    expect(code).toContain('fillcolor="#141418"'); // onyx bgInput default node fill
    expect(code).toContain(`fillcolor="${flattenGraphvizFill(ONYX.bgSuccess, ONYX.bgInput)}"`);
  });

  it('keeps an explicit rankdir and rewrites RL/BT into the LR/TB families', () => {
    expect(applyThemeAndLayout('digraph { rankdir=TB; A -> B }', {})).toContain('rankdir="TB"');
    expect(applyThemeAndLayout('digraph { rankdir=RL; A -> B }', {})).toContain('rankdir="LR"');
    expect(applyThemeAndLayout('digraph { rankdir=BT; A -> B }', {})).toContain('rankdir="TB"');
  });

  it('strips hardcoded hex fills so the injected default node fill wins', () => {
    const code = applyThemeAndLayout('digraph { workMode[label="wm" fillcolor="#0a0a0a"] }', { themeId: 'pearl' });
    // The model's black fill is removed; the injected pearl default fill remains.
    expect(code).not.toContain('fillcolor="#0a0a0a"');
    expect(code).toContain('fillcolor="#ffffff"'); // pearl bgInput default node fill
  });

  it('strips hardcoded rgb() and named color values', () => {
    const code = applyThemeAndLayout('digraph { n1[color="rgb(0,0,0)"]; n2[fontcolor=black] }', { themeId: 'pearl' });
    expect(code).not.toContain('rgb(0,0,0)');
    expect(code).not.toContain('fontcolor=black');
    expect(code).not.toMatch(/color="rgb\(0,0,0\)"/);
  });

  it('falls both fill and font back to defaults instead of light-on-light', () => {
    const code = applyThemeAndLayout('digraph { n1[fillcolor="#000000" fontcolor="#ffffff"] }', { themeId: 'pearl' });
    expect(code).not.toContain('fillcolor="#000000"');
    expect(code).not.toContain('fontcolor="#ffffff"');
    expect(code).toContain('fillcolor="#ffffff"'); // pearl default node fill
    expect(code).toContain('fontcolor="#1a1a1f"'); // pearl default node text
  });

  it('keeps semantic color names through the scrub and maps them to theme colors', () => {
    const code = applyThemeAndLayout('digraph { n1[fillcolor=success]; n2[fontcolor=muted] }', { themeId: 'pearl' });
    expect(code).toContain(`fillcolor="${flattenGraphvizFill(PEARL.bgSuccess, PEARL.bgInput)}"`);
    expect(code).toContain('fontcolor="#4a4a55"'); // pearl textSecondary
  });

  it('handles single-quoted hardcoded colors and leaves the label untouched', () => {
    const code = applyThemeAndLayout(`digraph { n1[label="black box" fillcolor='#000000'] }`, { themeId: 'pearl' });
    expect(code).not.toContain('#000000');
    expect(code).toContain('black box'); // label prose is preserved
  });

  it('does not strip theme-default attrs injected into node defaults', () => {
    const code = applyThemeAndLayout('digraph { A -> B }', { themeId: 'pearl' });
    // The injected node default fill/stroke/font survive the scrub.
    expect(code).toContain('fillcolor="#ffffff"');
    expect(code).toContain('color="#d5d5dc"');
    expect(code).toContain('fontcolor="#1a1a1f"');
  });

  it('does not rewrite a color word inside a label', async () => {
    const result = await renderDotToSvg('digraph { LabelNode[label="accent is blue"] }', { themeId: 'pearl' });
    expect(result.ok).toBe(true);
    expect(readProcessedCode((result as { ok: true; svg: string }).svg)).toContain('accent is blue');
  });

  it('preserves author hex colors in ```graphviz``` diagrams instead of scrubbing them', () => {
    const source =
      'digraph { task [label="入口", fillcolor="#F8FAFC", color="#64748B", fontcolor="#0F172A", shape=ellipse] }';
    const code = applyThemeAndLayout(source, { themeId: 'pearl', preserveAuthorColors: true });
    expect(code).toContain('fillcolor="#F8FAFC"');
    expect(code).toContain('color="#64748B"');
    expect(code).toContain('fontcolor="#0F172A"');
    expect(code).not.toMatch(/,\s*,/);
  });

  it('does not leave empty comma attributes after stripping Live Artifacts hardcoded colors', () => {
    const source =
      'digraph { task [label="入口, 保留逗号", fillcolor="#F8FAFC", color="#64748B", fontcolor="#0F172A", shape=ellipse] }';
    const code = applyThemeAndLayout(source, { themeId: 'pearl' });
    expect(code).not.toContain('fillcolor="#F8FAFC"');
    expect(code).not.toMatch(/,\s*,/);
    expect(code).toContain('label="入口, 保留逗号"');
    expect(code).toContain('shape=ellipse');
  });

  it('lets an explicit semantic stroke on the same node win over fill pairing', () => {
    const code = applyThemeAndLayout('digraph { n1[fillcolor=success color=accent] }', { themeId: 'pearl' });
    expect(code).toContain(`fillcolor="${flattenGraphvizFill(PEARL.bgSuccess, PEARL.bgInput)}"`);
    const nodeAttr = code.slice(code.indexOf('n1['), code.indexOf(']', code.indexOf('n1[')) + 1);
    expect(nodeAttr.lastIndexOf('color="#2563eb"')).toBeGreaterThan(nodeAttr.indexOf('color="#16a34a"'));
  });

  it('injects rounded dashed defaults into cluster subgraphs', () => {
    const code = applyThemeAndLayout('digraph { subgraph cluster_infer { label="推理"; n1; } }', { themeId: 'pearl' });
    expect(code).toContain('compound="true"');
    const clusterBody = code.slice(code.indexOf('subgraph cluster_infer'));
    expect(clusterBody).toContain('style="rounded,dashed"');
    expect(clusterBody).toContain('color="#d5d5dc"');
    expect(clusterBody).toContain('label="推理"');
  });
});

describe('renderDotToSvg', () => {
  it('returns empty for blank DOT', async () => {
    const result = await renderDotToSvg('   \n  ');
    expect(result).toEqual({ ok: false, error: 'empty' });
  });

  it('returns too-large when the DOT exceeds char or edge limits', async () => {
    const longDot = `digraph { ${'a'.repeat(DOT_MAX_CHARS + 10)} }`;
    expect(await renderDotToSvg(longDot)).toMatchObject({ ok: false, error: 'too-large' });

    const manyEdges = `digraph { ${'A->B; '.repeat(DOT_MAX_EDGES + 1)} }`;
    expect(await renderDotToSvg(manyEdges)).toMatchObject({ ok: false, error: 'too-large' });
  });

  it('returns too-large when the DOT exceeds the node limit', async () => {
    const dot = `digraph { ${Array.from({ length: 41 }, (_, i) => `n${i}`).join('; ')}; }`;
    expect(await renderDotToSvg(dot)).toMatchObject({ ok: false, error: 'too-large' });
  });

  it('returns render-failed when viz throws', async () => {
    fakeInstance.renderSVGElement.mockRejectedValueOnce(new Error('WASM failed'));
    const result = await renderDotToSvg('digraph { Fail -> Test }');
    expect(result).toMatchObject({ ok: false, error: 'render-failed', message: 'WASM failed' });
  });

  it('injects a transparent theme background and default LR layout', async () => {
    const result = await renderDotToSvg('digraph { Theme -> Test }', { themeId: 'pearl' });
    expect(result.ok).toBe(true);
    const code = readProcessedCode((result as { ok: true; svg: string }).svg);
    expect(code).toContain('bgcolor="transparent"');
    expect(code).toContain('rankdir="LR"');
    // Pearl primary text is near-black; the injected graph fontcolor must match.
    expect(code).toContain('#1a1a1f');
  });

  it('injects v2 card defaults through the render path', async () => {
    const result = await renderDotToSvg('digraph { Theme -> Test }', { themeId: 'pearl' });
    expect(result.ok).toBe(true);
    const code = readProcessedCode((result as { ok: true; svg: string }).svg);
    expect(code).toContain('style="rounded,filled"');
    expect(code).toContain('fillcolor="#ffffff"'); // pearl bgInput
    expect(code).toContain('arrowsize="0.8"');
    expect(code).toContain('fontname="Helvetica"');
    expect(code).not.toContain('system-ui');
  });

  it('rewrites Helvetica in the SVG to a CJK-capable font stack', async () => {
    fakeInstance.renderSVGElement.mockImplementationOnce(async (code: string) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('data-code', code);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('font-family', 'Helvetica');
      text.textContent = '节点';
      svg.appendChild(text);
      return svg;
    });

    const result = await renderDotToSvg('digraph { Font -> Test }');
    expect(result.ok).toBe(true);
    const svg = (result as { ok: true; svg: string }).svg;
    expect(svg).toContain('PingFang SC');
    expect(svg).not.toMatch(/font-family="Helvetica"/);
  });

  it('rewrites an explicit rankdir when a layout is forced', async () => {
    const result = await renderDotToSvg('digraph { rankdir=TB; ForceLayout -> Test }', { layout: 'LR' });
    expect(result.ok).toBe(true);
    expect(readProcessedCode((result as { ok: true; svg: string }).svg)).toContain('rankdir="LR"');
  });

  it('maps semantic color names to theme values', async () => {
    const result = await renderDotToSvg(
      'digraph { ColorNode[color=success]; WarnNode[fontcolor=warning]; ColorNode->WarnNode; }',
      {
        themeId: 'onyx',
      },
    );
    expect(result.ok).toBe(true);
    const code = readProcessedCode((result as { ok: true; svg: string }).svg);
    expect(code).toContain('#4ade80'); // onyx textSuccess
    expect(code).toContain('#fbbf24'); // onyx textWarning
  });

  it('does not rewrite a color word inside a label', async () => {
    const result = await renderDotToSvg('digraph { LabelNode[label="accent is blue"] }', { themeId: 'pearl' });
    expect(result.ok).toBe(true);
    expect(readProcessedCode((result as { ok: true; svg: string }).svg)).toContain('accent is blue');
  });

  it('sanitizes injected script/event-handler/javascript hrefs out of viz output', async () => {
    fakeInstance.renderSVGElement.mockImplementationOnce(async () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('onload', 'alert(1)');
      svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'script'));
      const badAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'a');
      badAnchor.setAttribute('href', 'javascript:alert(2)');
      svg.appendChild(badAnchor);
      return svg;
    });

    const result = await renderDotToSvg('digraph { Sanitize -> Test }');
    expect(result.ok).toBe(true);
    const svg = (result as { ok: true; svg: string }).svg;
    expect(svg).not.toContain('onload');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('javascript:');
    expect(svg).not.toContain('<a');
  });
});

describe('renderDotToSvgCached', () => {
  it('serves the second call from cache without re-rendering', async () => {
    const first = await renderDotToSvgCached('digraph { CacheHit -> Test }', { themeId: 'pearl' });
    expect(first.ok).toBe(true);
    const rendersAfterFirst = fakeInstance.renderSVGElement.mock.calls.length;

    const second = await renderDotToSvgCached('digraph { CacheHit -> Test }', { themeId: 'pearl' });
    expect(second.ok).toBe(true);
    expect(fakeInstance.renderSVGElement.mock.calls.length).toBe(rendersAfterFirst);
  });

  it('keeps distinct entries for distinct theme/layout combos', async () => {
    await renderDotToSvgCached('digraph { DistinctA -> Test }', { themeId: 'pearl', layout: 'LR' });
    await renderDotToSvgCached('digraph { DistinctB -> Test }', { themeId: 'onyx', layout: 'TB' });
    expect(fakeInstance.renderSVGElement.mock.calls.length).toBe(2);
  });

  it('does not cache a failed render', async () => {
    fakeInstance.renderSVGElement.mockRejectedValueOnce(new Error('boom'));
    const first = await renderDotToSvgCached('digraph { NoCacheFail -> Test }', { themeId: 'pearl' });
    expect(first).toMatchObject({ ok: false, error: 'render-failed' });

    const second = await renderDotToSvgCached('digraph { NoCacheFail -> Test }', { themeId: 'pearl' });
    expect(second.ok).toBe(true);
  });
});

describe('hydrateGraphvizIntoDocument', () => {
  it('injects static SVG into data-amc-graphviz nodes', async () => {
    const doc = new DOMParser().parseFromString(
      '<!DOCTYPE html><html><body><div data-amc-graphviz="digraph { Hydrate -> Test }"></div></body></html>',
      'text/html',
    );
    await hydrateGraphvizIntoDocument(doc, { themeId: 'pearl' });

    const node = doc.querySelector('[data-amc-graphviz]')!;
    expect(node.querySelector('svg')).not.toBeNull();
  });

  it('leaves nodes untouched when rendering fails', async () => {
    fakeInstance.renderSVGElement.mockRejectedValue(new Error('boom'));
    const doc = new DOMParser().parseFromString(
      '<!DOCTYPE html><html><body><div data-amc-graphviz="digraph { HydrateFail -> Test }">placeholder</div></body></html>',
      'text/html',
    );
    await hydrateGraphvizIntoDocument(doc, { themeId: 'pearl' });

    const node = doc.querySelector('[data-amc-graphviz]')!;
    expect(node.querySelector('svg')).toBeNull();
    expect(node.textContent).toContain('placeholder');
  });
});
