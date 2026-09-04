import { describe, expect, it } from 'vitest';
import { CHART_RENDERER_SCRIPT } from './chartRendererScript';

type ChartApi = { renderAll: () => void };

const createChartDoc = (chartJson: string): Document => {
  const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html');
  const div = doc.createElement('div');
  div.setAttribute('data-amc-chart', chartJson);
  doc.body.appendChild(div);
  return doc;
};

/**
 * Runs the renderer against a detached jsdom document using the exact same
 * `new Function` bridge the export path uses. `skipDiagnostic` models the
 * export-hydration scope where `notifyDiagnostic` is not defined.
 */
const runRenderer = (
  doc: Document,
  options: { skipDiagnostic?: boolean } = {},
): { api: ChartApi; diagnostics: unknown[] } => {
  const diagnostics: unknown[] = [];
  const stubWindow: Record<string, unknown> = {
    document: doc,
    MutationObserver: undefined,
    requestAnimationFrame: (fn: () => void) => fn(),
    addEventListener: () => {},
    navigator: {},
    location: { origin: 'null' },
  };
  const notify = options.skipDiagnostic ? undefined : (payload: unknown) => diagnostics.push(payload);
  const run = new Function('window', 'document', 'notifyDiagnostic', CHART_RENDERER_SCRIPT);
  run(stubWindow, doc, notify);
  return { api: stubWindow.__amcChart as ChartApi, diagnostics };
};

describe('chartRendererScript', () => {
  it('renders a single-series bar chart with rects inside the plot area', () => {
    const doc = createChartDoc(
      '{"type":"bar","title":"Q","x":["A","B","C","D"],"series":[{"name":"s","y":[420,560,380,610]}]}',
    );
    runRenderer(doc);

    const svg = doc.querySelector('svg');
    expect(svg).not.toBeNull();
    const rects = Array.from(doc.querySelectorAll('svg rect'));
    expect(rects).toHaveLength(4);
    for (const rect of rects) {
      expect(Number(rect.getAttribute('width'))).toBeGreaterThanOrEqual(0);
      const x = Number(rect.getAttribute('x'));
      const width = Number(rect.getAttribute('width'));
      expect(x).toBeGreaterThanOrEqual(36 - 1e-6);
      expect(x + width).toBeLessThanOrEqual(544 + 1e-6);
    }
  });

  it('renders grouped bars side by side without overlap', () => {
    const doc = createChartDoc(
      '{"type":"grouped-bar","x":["A","B"],"series":[{"name":"a","y":[10,20]},{"name":"b","y":[30,40]}]}',
    );
    runRenderer(doc);

    const rects = Array.from(doc.querySelectorAll('svg rect:not([data-amc-legend])'));
    expect(rects).toHaveLength(4);
    const r0 = rects[0]!;
    const r1 = rects[1]!;
    const x0 = Number(r0.getAttribute('x'));
    const width0 = Number(r0.getAttribute('width'));
    const x1 = Number(r1.getAttribute('x'));
    expect(x0 + width0).toBeLessThanOrEqual(x1 + 1.01);
  });

  it('stacks segments within each bar group', () => {
    const doc = createChartDoc(
      '{"type":"stacked-bar","x":["A","B"],"series":[{"name":"a","y":[10,20]},{"name":"b","y":[30,40]}]}',
    );
    runRenderer(doc);

    const rects = Array.from(doc.querySelectorAll('svg rect:not([data-amc-legend])'));
    expect(rects).toHaveLength(4);
    const groupX = rects[0]!.getAttribute('x');
    const groupARects = rects.filter((rect) => rect.getAttribute('x') === groupX);
    expect(groupARects).toHaveLength(2);
    const top0 = Number(groupARects[0]!.getAttribute('y'));
    const top1 = Number(groupARects[1]!.getAttribute('y'));
    // Second segment sits above the first: smaller y means higher on screen.
    expect(top1).toBeLessThan(top0);
  });

  it('renders a line chart with one point per datum and markers', () => {
    const doc = createChartDoc(
      '{"type":"line","title":"L","x":["1","2","3","4"],"series":[{"name":"s","y":[100,200,300,400]}]}',
    );
    runRenderer(doc);

    const polyline = doc.querySelector('svg polyline');
    expect(polyline).not.toBeNull();
    const points = (polyline!.getAttribute('points') ?? '').split(' ').filter(Boolean);
    expect(points).toHaveLength(4);
    const firstX = Number(points[0]!.split(',')[0]);
    const lastX = Number(points[3]!.split(',')[0]);
    expect(firstX).toBeGreaterThanOrEqual(36);
    expect(lastX).toBeLessThanOrEqual(544);
    expect(doc.querySelectorAll('svg circle')).toHaveLength(4);
  });

  it('renders pie slices whose last arc closes back onto the start', () => {
    const doc = createChartDoc('{"type":"pie","slices":[{"name":"a","y":1},{"name":"b","y":1},{"name":"c","y":2}]}');
    runRenderer(doc);

    const paths = Array.from(doc.querySelectorAll('svg path'));
    expect(paths).toHaveLength(3);
    const firstD = paths[0]!.getAttribute('d')!;
    const lastD = paths[2]!.getAttribute('d')!;

    const startMatch = firstD.match(/ L([-\d.eE]+),([-\d.eE]+) A/);
    const endMatch = lastD.match(/ ([-\d.eE]+),([-\d.eE]+) Z$/);
    expect(startMatch).not.toBeNull();
    expect(endMatch).not.toBeNull();

    const startX = Number(startMatch![1]);
    const startY = Number(startMatch![2]);
    const endX = Number(endMatch![1]);
    const endY = Number(endMatch![2]);
    // The final slice must end exactly where the first began (floating-point safe).
    expect(Math.abs(startX - endX)).toBeLessThan(1e-6);
    expect(Math.abs(startY - endY)).toBeLessThan(1e-6);
  });

  it('renders donut slices with inner and outer arcs plus a center total', () => {
    const doc = createChartDoc('{"type":"donut","slices":[{"name":"a","y":30},{"name":"b","y":70}]}');
    runRenderer(doc);

    const paths = Array.from(doc.querySelectorAll('svg path'));
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect(path.getAttribute('d')!.match(/ A\d/g)).toHaveLength(2);
    }
    expect(doc.querySelector('svg')!.textContent).toContain('100');
  });

  it('renders scatter points', () => {
    const doc = createChartDoc('{"type":"scatter","series":[{"name":"s","points":[[1,2],[3,4],[5,6]]}]}');
    runRenderer(doc);

    expect(doc.querySelectorAll('svg circle')).toHaveLength(3);
  });

  it('marks incomplete streaming JSON as pending and renders once completed', () => {
    const doc = createChartDoc('{"type":"bar","x":["A","B"],"series":[{"y":[1,');
    const { api } = runRenderer(doc);

    const node = doc.querySelector('[data-amc-chart]')!;
    expect(node.getAttribute('data-amc-chart-pending')).toBe('1');
    expect(node.querySelector('svg')).toBeNull();

    node.setAttribute('data-amc-chart', '{"type":"bar","x":["A","B"],"series":[{"y":[1,2]}]}');
    api.renderAll();
    expect(node.getAttribute('data-amc-chart-pending')).toBeNull();
    expect(node.querySelector('svg')).not.toBeNull();
  });

  it('marks invalid specs as errors and reports a chart-error diagnostic', () => {
    const doc = createChartDoc('{"type":"bar","x":["A","B"],"series":[{"name":"s"}]}');
    const { diagnostics } = runRenderer(doc);

    const node = doc.querySelector('[data-amc-chart]')!;
    expect(node.getAttribute('data-amc-chart-error')).toBe('1');
    expect(diagnostics).toHaveLength(1);
    expect((diagnostics[0] as { type?: string }).type).toBe('chart-error');
  });

  it('does not throw when notifyDiagnostic is unavailable (export hydration scope)', () => {
    const doc = createChartDoc('{"type":"bar","x":["A"],"series":[{"y":[]}]}');
    const { diagnostics } = runRenderer(doc, { skipDiagnostic: true });

    expect(diagnostics).toHaveLength(0);
    expect(doc.querySelector('[data-amc-chart]')!.getAttribute('data-amc-chart-error')).toBe('1');
  });

  it('handles all-zero data without NaN or divide-by-zero crashes', () => {
    const doc = createChartDoc('{"type":"bar","x":["A","B"],"series":[{"name":"z","y":[0,0]}]}');
    expect(() => runRenderer(doc)).not.toThrow();

    const svg = doc.querySelector('svg')!;
    expect(svg.textContent).not.toContain('NaN');
    for (const rect of doc.querySelectorAll('svg rect')) {
      expect(Number.isNaN(Number(rect.getAttribute('width')))).toBe(false);
      expect(Number.isNaN(Number(rect.getAttribute('y')))).toBe(false);
    }
  });

  it('uses theme variables instead of hardcoded colors', () => {
    const doc = createChartDoc('{"type":"bar","x":["A","B"],"series":[{"name":"s","y":[1,2]}]}');
    runRenderer(doc);

    const svg = doc.querySelector('svg')!;
    expect(svg.outerHTML).not.toMatch(/fill="#/);
    expect(svg.outerHTML).not.toMatch(/stroke="#/);
    expect(svg.outerHTML).toContain('var(--amc-live-artifact-accent)');
  });

  it('passes through an explicit custom series color', () => {
    const doc = createChartDoc('{"type":"bar","x":["A"],"series":[{"name":"s","color":"#ff0000","y":[5]}]}');
    runRenderer(doc);

    expect(doc.querySelector('svg')!.outerHTML).toContain('#ff0000');
  });
});
