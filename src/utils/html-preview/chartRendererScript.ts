/**
 * Declarative chart DSL renderer injected into Live Artifacts.
 *
 * The model emits `<div data-amc-chart='{"type":"bar",...}'></div>` nodes; this
 * script renders them as dependency-free SVG using the iframe's
 * `--amc-live-artifact-*` theme variables. The same string is embedded inside
 * the sandboxed iframe (via PREVIEW_BRIDGE_SCRIPT) and executed on the parent
 * side (via `new Function`) for PNG export hydration, so both render paths
 * share a single implementation.
 *
 * Defensive constraints shared by both runtimes:
 * - no getComputedStyle (unreliable on detached nodes): colors are always
 *   `var(--amc-live-artifact-*)` references, never hardcoded hex values
 * - window APIs are feature-guarded so the script runs synchronously to
 *   completion against a stub window (the export path registers no observer)
 * - `notifyDiagnostic` is bridge-scope only and is guarded with `typeof`, so a
 *   missing binding in the `new Function` scope cannot throw (a bad chart spec
 *   must never break an entire PNG export)
 */

export const CHART_RENDERER_SCRIPT = `
(() => {
  const SELECTOR = '[data-amc-chart]';
  const SIG_ATTR = 'data-amc-chart-sig';
  const PENDING_ATTR = 'data-amc-chart-pending';
  const ERROR_ATTR = 'data-amc-chart-error';
  const RENDERED_ATTR = 'data-amc-chart-rendered';

  const hash = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

  // d3-style tick step: 1/2/5 x 10^k.
  function tickStep(min, max, count) {
    const span = max - min || 1;
    const step0 = Math.abs(span) / Math.max(1, count);
    let step1 = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10));
    const err = step0 / step1;
    if (err >= Math.sqrt(50)) step1 *= 10;
    else if (err >= Math.sqrt(10)) step1 *= 5;
    else if (err >= Math.sqrt(2)) step1 *= 2;
    return step1;
  }

  const niceTicks = (min, max, count = 4) => {
    if (min === max) max = min + 1;
    const step = tickStep(min, max, count);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
    return { lo, hi, step, ticks };
  };

  const formatTick = (v) => {
    const abs = Math.abs(v);
    return abs >= 1000
      ? v.toLocaleString('en-US', { maximumFractionDigits: 1 })
      : Number(v.toFixed(2)).toString();
  };

  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs = {}, text) => {
    const node = document.createElementNS(NS, name);
    for (const k of Object.keys(attrs)) node.setAttribute(k, String(attrs[k]));
    if (text != null) node.textContent = text;
    return node;
  };
  const TEXT_MUTED = 'var(--amc-live-artifact-muted)';
  const BORDER = 'var(--amc-live-artifact-border)';
  const FONT = 'system-ui, sans-serif';
  const W = 560;

  const SEMANTIC_COLORS = {
    accent: 'var(--amc-live-artifact-accent)',
    success: 'var(--amc-live-artifact-success)',
    warning: 'var(--amc-live-artifact-warning)',
    danger: 'var(--amc-live-artifact-danger)',
    muted: 'var(--amc-live-artifact-muted)',
    subtle: 'var(--amc-live-artifact-subtle)',
  };
  const SURFACE_COLORS = {
    accent: 'var(--amc-live-artifact-accent-surface)',
    success: 'var(--amc-live-artifact-success-surface)',
    warning: 'var(--amc-live-artifact-warning-surface)',
    danger: 'var(--amc-live-artifact-danger-surface)',
  };
  const PALETTE = ['accent', 'success', 'warning', 'danger', 'muted', 'subtle'];
  const PALETTE_COLORS = PALETTE.map((k) => SEMANTIC_COLORS[k]);

  const colorKey = (series, index) => {
    const key = series && typeof series.color === 'string' && series.color ? series.color : PALETTE[index % PALETTE.length];
    return SEMANTIC_COLORS[key] || key;
  };
  const seriesColor = (series, index) => colorKey(series, index);
  const seriesSurface = (series, index) => {
    const key = colorKey(series, index);
    return SURFACE_COLORS[key] || SEMANTIC_COLORS[key] || key;
  };

  const VALID_TYPES = ['bar', 'grouped-bar', 'stacked-bar', 'line', 'area', 'pie', 'donut', 'scatter'];

  // Returns a normalized spec, or null when the payload is invalid.
  function normalizeSpec(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!VALID_TYPES.includes(raw.type)) return null;

    const spec = {
      type: raw.type,
      title: typeof raw.title === 'string' ? raw.title : undefined,
      height: isFiniteNum(raw.height) ? clamp(Math.round(raw.height), 120, 480) : 240,
      legend: raw.legend === undefined ? undefined : Boolean(raw.legend),
      xLabel: typeof raw.xLabel === 'string' ? raw.xLabel : undefined,
      yLabel: typeof raw.yLabel === 'string' ? raw.yLabel : undefined,
    };

    if (spec.type === 'pie' || spec.type === 'donut') {
      if (!Array.isArray(raw.slices) || !raw.slices.length) return null;
      const slices = [];
      for (const slice of raw.slices) {
        if (!slice || typeof slice !== 'object' || !isFiniteNum(slice.y)) return null;
        slices.push({
          name: typeof slice.name === 'string' ? slice.name : '',
          y: slice.y,
          color: typeof slice.color === 'string' ? slice.color : undefined,
        });
      }
      spec.slices = slices;
      return spec;
    }

    if (spec.type === 'scatter') {
      if (!Array.isArray(raw.series) || !raw.series.length) return null;
      const series = [];
      for (const s of raw.series) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.points) || !s.points.length) return null;
        const points = [];
        for (const point of s.points) {
          if (!Array.isArray(point) || point.length < 2 || !isFiniteNum(point[0]) || !isFiniteNum(point[1])) {
            return null;
          }
          points.push([point[0], point[1]]);
        }
        series.push({
          name: typeof s.name === 'string' ? s.name : undefined,
          color: typeof s.color === 'string' ? s.color : undefined,
          points,
        });
      }
      spec.series = series;
      return spec;
    }

    // bar / grouped-bar / stacked-bar / line / area
    if (!Array.isArray(raw.x) || !raw.x.length) return null;
    const x = raw.x.map((v) => (isFiniteNum(v) ? v : typeof v === 'string' ? v : null));
    if (x.some((v) => v === null)) return null;
    if (!Array.isArray(raw.series) || !raw.series.length) return null;
    const series = [];
    for (const s of raw.series) {
      if (!s || typeof s !== 'object' || !Array.isArray(s.y) || s.y.length !== x.length) return null;
      if (s.y.some((v) => !isFiniteNum(v))) return null;
      series.push({
        name: typeof s.name === 'string' ? s.name : undefined,
        color: typeof s.color === 'string' ? s.color : undefined,
        y: s.y.slice(),
      });
    }
    spec.x = x;
    spec.series = series;
    return spec;
  }

  function collectYValues(spec) {
    if (spec.type === 'scatter') {
      const values = [];
      for (const s of spec.series) for (const p of s.points) values.push(p[1]);
      return values;
    }
    const values = [];
    for (const s of spec.series) for (const v of s.y) values.push(v);
    return values;
  }

  function collectXValues(spec) {
    if (spec.type === 'scatter') {
      const values = [];
      for (const s of spec.series) for (const p of s.points) values.push(p[0]);
      return values;
    }
    const values = [];
    for (const v of spec.x) if (isFiniteNum(v)) values.push(v);
    return values;
  }

  function plotBox(spec, h, hasLegend) {
    const values = collectYValues(spec);
    let longest = 0;
    for (const v of values) longest = Math.max(longest, formatTick(v).length);
    const padL = clamp(longest * 7 + 14, 36, 64);
    return {
      x: padL,
      y: spec.title ? 30 : 16,
      w: W - padL - 16,
      h: h - (spec.title ? 30 : 16) - (hasLegend ? 48 : 30),
    };
  }

  function makeYScale(values, plot, forceZero) {
    if (!values.length) return { lo: 0, hi: 1, ticks: [0], yAt: () => plot.y + plot.h };
    let min = values[0];
    let max = values[0];
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (forceZero) {
      min = Math.min(0, min);
      max = Math.max(0, max);
    }
    const { lo, hi, ticks } = niceTicks(min, max, 4);
    const range = hi - lo || 1;
    return { lo, hi, ticks, yAt: (v) => plot.y + plot.h - ((v - lo) / range) * plot.h };
  }

  function makeXScale(values, plot) {
    if (!values.length) return { lo: 0, hi: 1, ticks: [0], xAt: () => plot.x };
    let min = values[0];
    let max = values[0];
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const { lo, hi, ticks } = niceTicks(min, max, 6);
    const range = hi - lo || 1;
    return { lo, hi, ticks, xAt: (v) => plot.x + ((v - lo) / range) * plot.w };
  }

  function makeCategoryXScale(n, plot) {
    const band = plot.w / n;
    return { kind: 'category', n, band, xAt: (i) => plot.x + (i + 0.5) * band };
  }

  function drawAxes(spec, plot, xScale, yScale, svg) {
    for (const t of yScale.ticks) {
      const y = yScale.yAt(t);
      svg.appendChild(el('line', { x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, stroke: BORDER, 'stroke-width': 1 }));
      svg.appendChild(el('text', { x: plot.x - 6, y: y + 3, fill: TEXT_MUTED, 'font-size': 10, 'text-anchor': 'end', 'font-family': FONT }, formatTick(t)));
    }
    if (xScale.kind === 'category') {
      for (let i = 0; i < spec.x.length; i += 1) {
        const label = String(spec.x[i]);
        const short = label.length > 12 ? label.slice(0, 11) + '…' : label;
        svg.appendChild(el('text', { x: xScale.xAt(i), y: plot.y + plot.h + 14, fill: TEXT_MUTED, 'font-size': 10, 'text-anchor': 'middle', 'font-family': FONT }, short));
      }
    } else {
      for (const t of xScale.ticks) {
        svg.appendChild(el('text', { x: xScale.xAt(t), y: plot.y + plot.h + 14, fill: TEXT_MUTED, 'font-size': 10, 'text-anchor': 'middle', 'font-family': FONT }, formatTick(t)));
      }
    }
    if (spec.xLabel) {
      svg.appendChild(el('text', { x: plot.x + plot.w / 2, y: plot.y + plot.h + 28, fill: TEXT_MUTED, 'font-size': 11, 'text-anchor': 'middle', 'font-family': FONT }, spec.xLabel));
    }
    if (spec.yLabel) {
      const cy = plot.y + plot.h / 2;
      svg.appendChild(el('text', { x: 12, y: cy, fill: TEXT_MUTED, 'font-size': 11, 'text-anchor': 'middle', 'font-family': FONT, transform: 'rotate(-90 12 ' + cy + ')' }, spec.yLabel));
    }
  }

  function renderBars(spec, plot, xScale, yScale, svg) {
    const n = spec.x.length;
    const groupW = plot.w / n;
    const isStacked = spec.type === 'stacked-bar';
    const seriesCount = spec.series.length;
    const barW = Math.max(2, Math.min(40, groupW * (isStacked ? 0.6 : 0.8 / seriesCount)));
    const baselineY = yScale.yAt(0);
    for (let i = 0; i < n; i += 1) {
      const groupLeft = plot.x + i * groupW;
      if (isStacked) {
        let acc = 0;
        for (let si = 0; si < spec.series.length; si += 1) {
          const s = spec.series[si];
          const v = s.y[i];
          const yTop = yScale.yAt(acc + v);
          const yBottom = yScale.yAt(acc);
          svg.appendChild(el('rect', {
            x: groupLeft + (groupW - barW) / 2,
            y: Math.min(yTop, yBottom),
            width: barW,
            height: Math.max(0, Math.abs(yBottom - yTop)),
            rx: 2,
            fill: seriesColor(s, si),
          }));
          acc += v;
        }
      } else {
        const perGroup = groupW * 0.8;
        const w = Math.max(1, perGroup / seriesCount - 1);
        for (let si = 0; si < spec.series.length; si += 1) {
          const s = spec.series[si];
          const v = s.y[i];
          const yTop = yScale.yAt(v);
          svg.appendChild(el('rect', {
            x: groupLeft + (groupW - perGroup) / 2 + si * (perGroup / seriesCount),
            y: Math.min(yTop, baselineY),
            width: w,
            height: Math.max(0, Math.abs(baselineY - yTop)),
            rx: 1,
            fill: seriesColor(s, si),
          }));
        }
      }
    }
  }

  function renderLines(spec, plot, xScale, yScale, svg) {
    const isArea = spec.type === 'area';
    const baselineY = yScale.yAt(0);
    for (let si = 0; si < spec.series.length; si += 1) {
      const s = spec.series[si];
      const color = seriesColor(s, si);
      const points = [];
      for (let i = 0; i < s.y.length; i += 1) {
        const x = xScale.kind === 'category' ? xScale.xAt(i) : xScale.xAt(spec.x[i]);
        points.push([x, yScale.yAt(s.y[i])]);
      }
      if (isArea && points.length) {
        const fill = seriesSurface(s, si);
        const fillOpacity = fill === color ? 0.15 : undefined;
        const last = points[points.length - 1];
        const first = points[0];
        let d = 'M';
        for (const p of points) d += p[0].toFixed(2) + ',' + p[1].toFixed(2) + ' L';
        d += last[0].toFixed(2) + ',' + baselineY.toFixed(2) + ' L' + first[0].toFixed(2) + ',' + baselineY.toFixed(2) + ' Z';
        const attrs = { d, fill };
        if (fillOpacity !== undefined) attrs['fill-opacity'] = String(fillOpacity);
        svg.appendChild(el('path', attrs));
      }
      if (points.length >= 2) {
        svg.appendChild(el('polyline', {
          points: points.map((p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' '),
          fill: 'none',
          stroke: color,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        }));
      }
      for (const [x, y] of points) {
        svg.appendChild(el('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: 2.5, fill: color }));
      }
    }
  }

  function renderScatter(spec, plot, xScale, yScale, svg) {
    for (let si = 0; si < spec.series.length; si += 1) {
      const s = spec.series[si];
      const color = seriesColor(s, si);
      for (const [x, y] of s.points) {
        svg.appendChild(el('circle', { cx: xScale.xAt(x).toFixed(2), cy: yScale.yAt(y).toFixed(2), r: 2.5, fill: color }));
      }
    }
  }

  function arcPath(cx, cy, r, r0, a0, a1) {
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    if (r0 > 0) {
      const ix0 = cx + Math.cos(a0) * r0;
      const iy0 = cy + Math.sin(a0) * r0;
      const ix1 = cx + Math.cos(a1) * r0;
      const iy1 = cy + Math.sin(a1) * r0;
      return 'M' + x0 + ',' + y0 + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x1 + ',' + y1 + ' L' + ix1 + ',' + iy1 + ' A' + r0 + ',' + r0 + ' 0 ' + large + ' 0 ' + ix0 + ',' + iy0 + ' Z';
    }
    return 'M' + cx + ',' + cy + ' L' + x0 + ',' + y0 + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x1 + ',' + y1 + ' Z';
  }

  function renderPie(spec, svg, h, hasLegend, isDonut) {
    const total = spec.slices.reduce((sum, s) => sum + s.y, 0) || 1;
    const cx = W / 2;
    const cy = hasLegend ? (h - 40) / 2 + 6 : h / 2;
    const r = Math.min(110, (hasLegend ? h - 50 : h - 20) / 2);
    const r0 = isDonut ? r * 0.55 : 0;
    const startAngle = -Math.PI / 2;
    let angle = startAngle;
    for (let i = 0; i < spec.slices.length; i += 1) {
      const slice = spec.slices[i];
      const sweep = (slice.y / total) * Math.PI * 2;
      const a0 = angle;
      // Force the final slice to end exactly where the first began so floating
      // point accumulation can never leave a visible gap in the circle.
      const a1 = i === spec.slices.length - 1 ? startAngle + Math.PI * 2 : angle + sweep;
      svg.appendChild(el('path', {
        d: arcPath(cx, cy, r, r0, a0, a1),
        fill: slice.color ? SEMANTIC_COLORS[slice.color] || slice.color : PALETTE_COLORS[i % PALETTE.length],
      }));
      angle = a1;
    }
    if (isDonut) {
      svg.appendChild(el('text', { x: cx, y: cy + 4, fill: TEXT_MUTED, 'font-size': 14, 'text-anchor': 'middle', 'font-weight': 600, 'font-family': FONT }, formatTick(total)));
    }
    if (hasLegend) {
      const entries = spec.slices.map((slice, i) => ({
        name: slice.name,
        color: slice.color ? SEMANTIC_COLORS[slice.color] || slice.color : PALETTE_COLORS[i % PALETTE.length],
        percent: slice.y / total,
      }));
      appendLegend(svg, entries, h, true);
    }
  }

  function appendLegend(svg, entries, svgHeight, withPercent) {
    const rowHeight = 22;
    const gap = 14;
    let x = 16;
    let row = 0;
    for (const entry of entries) {
      const label = withPercent ? entry.name + ' ' + (entry.percent * 100).toFixed(0) + '%' : entry.name;
      const textWidth = label.length * 6.5 + 14;
      if (x + textWidth > W - 8) {
        x = 16;
        row += 1;
      }
      const y = svgHeight - 20 - row * rowHeight;
      svg.appendChild(el('rect', { x, y: y + 2, width: 10, height: 10, rx: 2, fill: entry.color, 'data-amc-legend': '1' }));
      svg.appendChild(el('text', { x: x + 15, y: y + 10, fill: TEXT_MUTED, 'font-size': 11, 'font-family': FONT }, label));
      x += textWidth + gap;
    }
  }

  function renderCartesian(spec, svg, h) {
    const hasLegend = spec.legend !== undefined ? spec.legend : spec.series.length > 1;
    const plot = plotBox(spec, h, hasLegend);
    const isBar = spec.type === 'bar' || spec.type === 'grouped-bar' || spec.type === 'stacked-bar';
    const yScale = makeYScale(collectYValues(spec), plot, isBar);
    const numericX =
      spec.type === 'scatter' || (spec.x.length > 0 && spec.x.every((v) => isFiniteNum(v)));
    const xScale = numericX ? makeXScale(collectXValues(spec), plot) : makeCategoryXScale(spec.x.length, plot);

    if (spec.type === 'scatter') {
      renderScatter(spec, plot, xScale, yScale, svg);
    } else if (isBar) {
      renderBars(spec, plot, xScale, yScale, svg);
    } else {
      renderLines(spec, plot, xScale, yScale, svg);
    }
    drawAxes(spec, plot, xScale, yScale, svg);
    if (hasLegend) appendLegend(svg, spec.series.map((s, i) => ({ name: s.name || 'Series ' + (i + 1), color: seriesColor(s, i) })), h, false);
  }

  function buildChart(spec) {
    const { svg, h } = buildSvgRoot(spec);
    if (spec.type === 'pie' || spec.type === 'donut') {
      const hasLegend = spec.legend !== undefined ? spec.legend : true;
      renderPie(spec, svg, h, hasLegend, spec.type === 'donut');
    } else {
      renderCartesian(spec, svg, h);
    }
    return svg;
  }

  const buildSvgRoot = (spec) => {
    const h = clamp(spec.height || 240, 120, 480);
    const svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + h,
      width: '100%',
      height: 'auto',
      display: 'block',
      role: 'img',
      'aria-label': spec.title || 'chart',
      style: 'font-family:' + FONT,
    });
    if (spec.title) svg.appendChild(el('title', {}, spec.title));
    return { svg, h };
  };

  function renderChartElement(node) {
    const attr = node.getAttribute('data-amc-chart') || '';
    const sig = hash(attr);
    if (node.getAttribute(SIG_ATTR) === sig) return;

    let raw;
    try {
      raw = JSON.parse(attr);
    } catch {
      // Incomplete JSON mid-stream: stay silent and retry on the next mutation.
      node.setAttribute(PENDING_ATTR, '1');
      return;
    }

    const spec = normalizeSpec(raw);
    node.setAttribute(SIG_ATTR, sig);
    node.removeAttribute(PENDING_ATTR);
    node.textContent = '';
    if (!spec) {
      node.setAttribute(ERROR_ATTR, '1');
      node.removeAttribute(RENDERED_ATTR);
      if (typeof notifyDiagnostic === 'function') {
        notifyDiagnostic({ type: 'chart-error', message: 'Invalid chart spec', snippet: attr.slice(0, 200) });
      }
      return;
    }
    node.removeAttribute(ERROR_ATTR);
    node.setAttribute(RENDERED_ATTR, '1');
    node.appendChild(buildChart(spec));
  }

  function renderAll() {
    document.querySelectorAll(SELECTOR).forEach(renderChartElement);
  }

  let frame = 0;
  const scheduleScan = () => {
    if (frame) return;
    frame = (window.requestAnimationFrame || ((fn) => fn()))(() => {
      frame = 0;
      renderAll();
    });
  };

  renderAll();
  if (window.MutationObserver) {
    new MutationObserver(scheduleScan).observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-amc-chart'],
    });
  }

  window.__amcChart = { renderAll, renderChartElement };
})();
`;

interface HydrateChartsIntoDocumentOptions {
  /**
   * Pre-built Live Artifacts theme style (see buildPreviewThemeStyle with
   * `varsOnly`). Injected into the target document so chart SVG colors resolve
   * on the parent page, which does not define `--amc-live-artifact-*` on its own.
   */
  themeStyle?: string;
}

const makeChartStubWindow = (doc: Document): Record<string, unknown> => ({
  document: doc,
  MutationObserver: undefined,
  requestAnimationFrame: (fn: () => void) => fn(),
  addEventListener: () => {},
  navigator: {},
  location: { origin: 'null' },
});

/**
 * Renders every `data-amc-chart` node in `doc` as static SVG, synchronously.
 *
 * This is the export-path twin of the iframe-embedded renderer: it executes the
 * exact same `CHART_RENDERER_SCRIPT` string via `new Function`, so the exported
 * PNG snapshot and the sandboxed frame always produce identical markup.
 */
export const hydrateChartsIntoDocument = (doc: Document, options: HydrateChartsIntoDocumentOptions = {}): void => {
  if (options.themeStyle) {
    const normalized = options.themeStyle.replace(/<\/?style[^>]*>/g, '');
    if (doc.head && !doc.head.querySelector('[data-amc-live-artifact-theme]')) {
      const styleEl = doc.createElement('style');
      styleEl.setAttribute('data-amc-live-artifact-theme', 'true');
      styleEl.textContent = normalized;
      doc.head.appendChild(styleEl);
    }
  }
  // `new Function` is safe here: the string is a repo-owned constant and CSP
  // does not apply on the parent page.
  const run = new Function('window', 'document', CHART_RENDERER_SCRIPT);
  run(makeChartStubWindow(doc), doc);
};
