import { describe, expect, it } from 'vitest';
import { CHART_RENDERER_SCRIPT, hydrateChartsIntoDocument } from './chartRendererScript';

const THEME_STYLE =
  '<style data-amc-live-artifact-theme="true">:root{color-scheme:dark;--amc-live-artifact-accent:#ffffff;}</style>';

const FIXTURES = [
  '{"type":"bar","title":"Q","x":["A","B","C"],"series":[{"name":"s","y":[420,560,380]}]}',
  '{"type":"grouped-bar","x":["A","B"],"series":[{"name":"a","y":[10,20]},{"name":"b","y":[30,40]}]}',
  '{"type":"line","x":["1","2","3"],"series":[{"name":"a","y":[1,2,3]},{"name":"b","y":[3,2,1]}]}',
  '{"type":"area","x":["A","B"],"series":[{"name":"a","y":[5,8]}]}',
  '{"type":"pie","slices":[{"name":"a","y":1},{"name":"b","y":1},{"name":"c","y":2}]}',
  '{"type":"donut","slices":[{"name":"a","y":30},{"name":"b","y":70}]}',
  '{"type":"scatter","series":[{"name":"s","points":[[1,2],[3,4],[5,6]]}]}',
  '{"type":"bar","x":["A","B"],"series":[{"name":"s"}]}', // invalid: series missing y
] as const;

const makeDoc = (chartJson: string): Document => {
  const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><head></head><body></body></html>', 'text/html');
  const div = doc.createElement('div');
  div.setAttribute('data-amc-chart', chartJson);
  doc.body.appendChild(div);
  return doc;
};

const renderRaw = (doc: Document): void => {
  const stubWindow: Record<string, unknown> = {
    document: doc,
    MutationObserver: undefined,
    requestAnimationFrame: (fn: () => void) => fn(),
    addEventListener: () => {},
    navigator: {},
    location: { origin: 'null' },
  };
  const run = new Function('window', 'document', 'notifyDiagnostic', CHART_RENDERER_SCRIPT);
  run(stubWindow, doc, undefined);
};

describe('chart renderer export hydration', () => {
  it('hydrateChartsIntoDocument produces identical SVG to the iframe renderer', () => {
    for (const fixture of FIXTURES) {
      const rawDoc = makeDoc(fixture);
      const hydratedDoc = makeDoc(fixture);

      renderRaw(rawDoc);
      hydrateChartsIntoDocument(hydratedDoc, { themeStyle: THEME_STYLE });

      const rawNode = rawDoc.querySelector('[data-amc-chart]')!;
      const hydratedNode = hydratedDoc.querySelector('[data-amc-chart]')!;
      expect(hydratedNode.outerHTML).toBe(rawNode.outerHTML);
    }
  });

  it('injects the varsOnly theme style into the document head', () => {
    const doc = makeDoc('{"type":"pie","slices":[{"name":"a","y":1}]}');
    hydrateChartsIntoDocument(doc, { themeStyle: THEME_STYLE });

    const style = doc.head.querySelector('[data-amc-live-artifact-theme]');
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('--amc-live-artifact-accent');
  });

  it('does not duplicate the theme style when hydrated twice', () => {
    const doc = makeDoc('{"type":"pie","slices":[{"name":"a","y":1}]}');
    hydrateChartsIntoDocument(doc, { themeStyle: THEME_STYLE });
    hydrateChartsIntoDocument(doc, { themeStyle: THEME_STYLE });

    expect(doc.head.querySelectorAll('[data-amc-live-artifact-theme]')).toHaveLength(1);
  });

  it('hydrates an invalid spec into an error marker without throwing', () => {
    const doc = makeDoc('{"type":"bar","x":["A"],"series":[]}');
    expect(() => hydrateChartsIntoDocument(doc, { themeStyle: THEME_STYLE })).not.toThrow();
    expect(doc.querySelector('[data-amc-chart]')!.getAttribute('data-amc-chart-error')).toBe('1');
  });
});
