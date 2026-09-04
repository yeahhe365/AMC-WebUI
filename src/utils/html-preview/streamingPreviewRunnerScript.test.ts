import { describe, expect, it } from 'vitest';
import { CHART_RENDERER_SCRIPT } from './chartRendererScript';
import { HTML_PREVIEW_MESSAGE_CHANNEL, HTML_PREVIEW_STREAM_RENDER_EVENT } from './previewMessageProtocol';
import { STREAMING_PREVIEW_RUNNER_SCRIPT } from './streamingPreviewRunnerScript';

const CHART_BAR = '{"type":"bar","x":["A","B"],"series":[{"y":[1,2]}]}';
const CHART_PIE = '{"type":"pie","slices":[{"name":"a","y":1}]}';

const runStreamingRunner = (): void => {
  // The exported constant is a full `<script>...</script>` string; strip the
  // tags so it can be executed against the jsdom window/document.
  const code = STREAMING_PREVIEW_RUNNER_SCRIPT.replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
  const run = new Function('window', 'document', code);
  run(window, document);
};

const runChartRenderer = (): { renderAll: () => void } => {
  const stubWindow: Record<string, unknown> = {
    document,
    MutationObserver: undefined,
    requestAnimationFrame: (fn: () => void) => fn(),
    addEventListener: () => {},
    navigator: {},
    location: { origin: 'null' },
  };
  const run = new Function('window', 'document', 'notifyDiagnostic', CHART_RENDERER_SCRIPT);
  run(stubWindow, document, undefined);
  return stubWindow.__amcChart as { renderAll: () => void };
};

const dispatchStream = (html: string): void => {
  const event = new Event('message') as Event & { data?: unknown };
  event.data = { channel: HTML_PREVIEW_MESSAGE_CHANNEL, event: HTML_PREVIEW_STREAM_RENDER_EVENT, html };
  window.dispatchEvent(event);
};

describe('streaming preview runner chart guard', () => {
  it('keeps a rendered chart SVG across attribute-unchanged stream patches and re-renders on change', () => {
    document.body.innerHTML = '<div data-amc-stream-preview-root="true"></div>';
    runStreamingRunner();

    dispatchStream(`<div data-amc-chart='${CHART_BAR}'></div>`);

    const root = document.querySelector('[data-amc-stream-preview-root]')!;
    const chartNode = root.querySelector<HTMLElement>('[data-amc-chart]');
    expect(chartNode).not.toBeNull();

    runChartRenderer();
    expect(chartNode!.querySelector('svg')).not.toBeNull();

    // Same payload again: the guard must preserve the already-rendered SVG.
    dispatchStream(`<div data-amc-chart='${CHART_BAR}'></div>`);
    expect(chartNode!.querySelector('svg')).not.toBeNull();
    expect(chartNode!.getAttribute('data-amc-chart')).toBe(CHART_BAR);

    // Changed payload: the stale SVG is dropped by the patcher, then the
    // renderer (here invoked directly; in the iframe via its observer) rebuilds.
    dispatchStream(`<div data-amc-chart='${CHART_PIE}'></div>`);
    expect(chartNode!.querySelector('svg')).toBeNull();
    expect(chartNode!.getAttribute('data-amc-chart')).toBe(CHART_PIE);

    const { renderAll } = runChartRenderer();
    renderAll();
    expect(chartNode!.querySelector('svg')).not.toBeNull();
    expect(chartNode!.querySelectorAll('svg path')).toHaveLength(1);
  });
});
