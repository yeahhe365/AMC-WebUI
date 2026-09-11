import { describe, expect, it } from 'vitest';
import { sanitizeCssColorFunctionsForPngExport } from './cssColorSanitizer';
import { prepareElementForExport } from './dom';

describe('sanitizeCssColorFunctionsForPngExport', () => {
  it('converts Tailwind oklch palette variables into rgba', () => {
    const css = `
      :root {
        --color-blue-500: oklch(62.3% .214 259.815);
      }

      .text-blue-500 {
        color: var(--color-blue-500);
      }
    `;

    const sanitized = sanitizeCssColorFunctionsForPngExport(css);

    expect(sanitized).not.toContain('oklch');
    expect(sanitized).toContain('--color-blue-500: rgba(43, 127, 255, 1)');
  });

  it('converts Tailwind color-mix oklab theme opacity colors into rgba', () => {
    const css = `
      .bg-quiet {
        background-color: color-mix(in oklab, var(--theme-bg-tertiary) 20%, transparent);
        border-color: color-mix(in oklab, transparent 40%, var(--theme-border-secondary));
      }
    `;

    const sanitized = sanitizeCssColorFunctionsForPngExport(css, {
      resolveCssVariable: (name) =>
        ({
          '--theme-bg-tertiary': '#18181b',
          '--theme-border-secondary': '#27272a',
        })[name] ?? '',
    });

    expect(sanitized).not.toContain('oklab');
    expect(sanitized).not.toContain('color-mix');
    expect(sanitized).toContain('rgba(24, 24, 27, 0.2)');
    expect(sanitized).toContain('rgba(39, 39, 42, 0.6)');
  });
});

describe('prepareElementForExport', () => {
  // Builds a Live Artifact frame the same way React renders <div data-artifact-source={html}>:
  // the attribute is set via setAttribute (properly escaped), not parsed from an innerHTML string,
  // so the raw HTML source survives getAttribute() round-trips.
  const buildArtifactFrame = (html: string, height = '200px'): HTMLElement => {
    const frame = document.createElement('div');
    frame.setAttribute('data-live-artifact-frame', 'true');
    frame.setAttribute('data-artifact-source', html);

    const viewport = document.createElement('div');
    viewport.setAttribute('data-live-artifact-viewport', 'true');
    viewport.style.height = height;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-modals allow-downloads');
    iframe.setAttribute('srcdoc', '<div>Artifact</div>');
    viewport.appendChild(iframe);
    frame.appendChild(viewport);
    return frame;
  };

  it('replaces iframe srcdoc with static snapshot when forPng=false (HTML export path)', async () => {
    const container = document.createElement('div');
    container.appendChild(buildArtifactFrame('<div>Hello HTML Export</div>'));

    const clone = await prepareElementForExport(container, {
      expandDetails: false,
      forPng: false,
    });

    const iframe = clone.querySelector('iframe');
    expect(iframe).toBeNull();

    const snapshotContainer = clone.querySelector('.is-exporting-png');
    expect(snapshotContainer).not.toBeNull();
    expect(snapshotContainer?.textContent).toContain('Hello HTML Export');
  });

  it('replaces iframe srcdoc with static snapshot when forPng=true (PNG export path)', async () => {
    const container = document.createElement('div');
    container.appendChild(buildArtifactFrame('<div>Hello Artifact</div>'));

    const clone = await prepareElementForExport(container, {
      expandDetails: false,
      forPng: true,
    });

    const iframe = clone.querySelector('iframe');
    expect(iframe).toBeNull();

    const snapshotContainer = clone.querySelector('.is-exporting-png');
    expect(snapshotContainer).not.toBeNull();
    expect(snapshotContainer?.textContent).toContain('Hello Artifact');
  });

  it('skips iframe replacement when data-artifact-source is missing', async () => {
    const container = document.createElement('div');
    const frame = buildArtifactFrame('<div>With Source</div>');
    frame.removeAttribute('data-artifact-source');
    container.appendChild(frame);

    const clone = await prepareElementForExport(container, {
      expandDetails: false,
      forPng: true,
    });

    const iframe = clone.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('srcdoc')).toContain('Artifact');
  });

  it('hydrates chart and graphviz declarations in the static snapshot container for HTML export', async () => {
    const artifactSource = `
      <div data-amc-chart='{"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[1,2]}]}' style="height:250px;"></div>
      <div data-amc-graphviz='digraph { a -> b; }'></div>
    `;
    const container = document.createElement('div');
    container.appendChild(buildArtifactFrame(artifactSource));

    const clone = await prepareElementForExport(container, {
      expandDetails: false,
      forPng: false,
    });

    expect(clone.querySelector('iframe')).toBeNull();
    const snapshotContainer = clone.querySelector('.is-exporting-png') as HTMLElement;
    expect(snapshotContainer).not.toBeNull();
    expect(snapshotContainer?.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1);
    expect(snapshotContainer?.style.background).toBe('transparent');
    expect(snapshotContainer?.style.height).toBe('auto');
    expect(snapshotContainer?.style.overflow).toBe('visible');
  });
});
