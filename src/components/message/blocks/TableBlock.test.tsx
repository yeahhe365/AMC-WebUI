import { act } from 'react';
import { setupTestRenderer, flushPromises } from '@/test/render/renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WindowProvider } from '@/contexts/WindowContext';
import { TableBlock } from './TableBlock';

const triggerDownloadMock = vi.hoisted(() => vi.fn());

vi.mock('@/utils/export/core', () => ({
  triggerDownload: triggerDownloadMock,
}));

describe('TableBlock', () => {
  const renderer = setupTestRenderer();

  afterEach(() => {
    triggerDownloadMock.mockReset();
  });

  it('renders narrow tables without layout classes (CSS handles content-sized columns)', () => {
    act(() => {
      renderer.root.render(
        <WindowProvider window={window} document={document}>
          <TableBlock>
            <thead>
              <tr>
                <th>Name</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Alice</td>
                <td>Long notes that should not force the table into an artificially compressed width.</td>
              </tr>
            </tbody>
          </TableBlock>
        </WindowProvider>,
      );
    });

    const table = renderer.container.querySelector('table');
    const tableClasses = table?.className.split(/\s+/) ?? [];

    // Column sizing is table-layout: auto in CSS; the element carries no layout
    // attribute or width utility classes.
    expect(table?.getAttribute('data-layout')).toBeNull();
    expect(tableClasses).not.toContain('w-max');
    expect(tableClasses).not.toContain('min-w-full');
    expect(tableClasses).not.toContain('w-full');
  });

  it('renders wide tables with natural widths so the wrapper can scroll', () => {
    act(() => {
      renderer.root.render(
        <WindowProvider window={window} document={document}>
          <TableBlock>
            <thead>
              <tr>
                <th>C1</th>
                <th>C2</th>
                <th>C3</th>
                <th>C4</th>
                <th>C5</th>
                <th>C6</th>
                <th>C7</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>a</td>
                <td>b</td>
                <td>c</td>
                <td>d</td>
                <td>e</td>
                <td>f</td>
                <td>g</td>
              </tr>
            </tbody>
          </TableBlock>
        </WindowProvider>,
      );
    });

    const table = renderer.container.querySelector('table');
    // No data-layout attribute: all GFM tables rely on content-sized columns.
    expect(table?.getAttribute('data-layout')).toBeNull();
  });

  it('scopes inline action controls to the table hover area instead of outer message groups', () => {
    act(() => {
      renderer.root.render(
        <WindowProvider window={window} document={document}>
          <TableBlock>
            <tbody>
              <tr>
                <td>Name</td>
                <td>Alice</td>
              </tr>
            </tbody>
          </TableBlock>
        </WindowProvider>,
      );
    });

    const tableContainer = renderer.container.querySelector('[data-table-actions-scope="true"]');
    const actionBar = renderer.container.querySelector('.absolute.top-2.right-2');

    expect(tableContainer).not.toBeNull();
    expect(tableContainer?.className.toString()).toContain('group/table');
    expect(tableContainer?.className.toString()).not.toMatch(/(^|\s)group(\s|$)/);
    expect(actionBar?.className).toContain('opacity-0');
    expect(actionBar?.className).toContain('pointer-events-none');
    expect(actionBar?.className).toContain('group-hover/table:opacity-100');
    expect(actionBar?.className).toContain('group-hover/table:pointer-events-auto');
    expect(actionBar?.className).not.toContain('group-hover:opacity-100');
    expect(actionBar?.className).toContain('focus-within:opacity-100');
    expect(actionBar?.className).not.toContain('sm:opacity-0');
  });

  it('exports Excel using the safe HTML workbook fallback without loading xlsx', async () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:table-export');

    await act(async () => {
      renderer.root.render(
        <WindowProvider window={window} document={document}>
          <TableBlock>
            <tbody>
              <tr>
                <td>Name</td>
                <td>Alice</td>
              </tr>
            </tbody>
          </TableBlock>
        </WindowProvider>,
      );
    });

    const downloadButton = renderer.container.querySelector('button[title="Download"]');
    expect(downloadButton).not.toBeNull();

    await act(async () => {
      downloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const excelButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Export to Excel'),
    );
    expect(excelButton).not.toBeUndefined();

    await act(async () => {
      excelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(createObjectUrl).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/vnd.ms-excel' }));
    expect(triggerDownloadMock).toHaveBeenCalledWith(
      'blob:table-export',
      expect.stringMatching(/^table-export-\d+\.xls$/),
    );

    createObjectUrl.mockRestore();
  });

  it('renders fullscreen tables above modal chrome with contained overlay scrolling', () => {
    act(() => {
      renderer.root.render(
        <WindowProvider window={window} document={document}>
          <TableBlock>
            <tbody>
              <tr>
                <td>Name</td>
                <td>Alice</td>
              </tr>
            </tbody>
          </TableBlock>
        </WindowProvider>,
      );
    });

    const fullscreenButton = renderer.container.querySelector('button[title="Fullscreen"]');
    expect(fullscreenButton).not.toBeNull();

    act(() => {
      fullscreenButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const overlay = document.body.querySelector('[data-table-fullscreen-overlay="true"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('role')).toBe('dialog');
    expect(overlay?.getAttribute('aria-modal')).toBe('true');
    expect(overlay?.className.toString()).toContain('z-[2200]');
    expect(overlay?.className.toString()).toContain('overscroll-contain');
  });

  it('copies raw HTML instead of markdown when the table has merged cells', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await act(async () => {
      renderer.root.render(
        <WindowProvider window={window} document={document}>
          <TableBlock>
            <tbody>
              <tr>
                <td rowSpan={2}>Merged</td>
                <td>Alice</td>
              </tr>
              <tr>
                <td>Bob</td>
              </tr>
            </tbody>
          </TableBlock>
        </WindowProvider>,
      );
    });

    const copyButton = renderer.container.querySelector('button[aria-label="Copy table as markdown"]');

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // The handler awaits a dynamic import before writing; let it resolve.
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const written = writeText.mock.calls[0][0] as string;
    expect(written).toContain('<td');
    expect(written).toContain('rowspan');
    expect(written).toContain('Merged');
  });

  it('copies markdown for plain tables without merged cells', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await act(async () => {
      renderer.root.render(
        <WindowProvider window={window} document={document}>
          <TableBlock>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Alice</td>
                <td>Admin</td>
              </tr>
            </tbody>
          </TableBlock>
        </WindowProvider>,
      );
    });

    const copyButton = renderer.container.querySelector('button[aria-label="Copy table as markdown"]');

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // The handler awaits a dynamic import before writing; let it resolve.
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const written = writeText.mock.calls[0][0] as string;
    expect(written).toContain('|');
    expect(written).not.toContain('<td');
  });

  it('colors copy-success feedback with the theme success token instead of hardcoded green', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await act(async () => {
      renderer.root.render(
        <WindowProvider window={window} document={document}>
          <TableBlock>
            <thead>
              <tr>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Alice</td>
              </tr>
            </tbody>
          </TableBlock>
        </WindowProvider>,
      );
    });

    const copyButton = renderer.container.querySelector('button[aria-label="Copy table as markdown"]');

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();
    });

    expect(renderer.container.querySelector('.text-green-500')).toBeNull();
    const successIcon = renderer.container.querySelector('.text-\\[var\\(--theme-text-success\\)\\]');
    expect(successIcon).not.toBeNull();
  });

  it('prefixes the CSV export with a UTF-8 BOM so Excel reads CJK correctly', async () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv-bom');

    await act(async () => {
      renderer.root.render(
        <WindowProvider window={window} document={document}>
          <TableBlock>
            <tbody>
              <tr>
                <td>名称</td>
                <td>Alice</td>
              </tr>
            </tbody>
          </TableBlock>
        </WindowProvider>,
      );
    });

    const downloadButton = renderer.container.querySelector('button[title="Download"]');

    await act(async () => {
      downloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const csvButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Export to CSV'),
    );
    expect(csvButton).not.toBeUndefined();

    await act(async () => {
      csvButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const blob = createObjectUrl.mock.calls[0][0] as Blob;
    // jsdom does not implement innerText, so the CSV payload is empty here; the
    // bug being guarded against is the missing BOM, so assert the raw bytes.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    expect(blob.type).toBe('text/csv;charset=utf-8;');
    expect(triggerDownloadMock).toHaveBeenCalledWith('blob:csv-bom', expect.stringMatching(/^table-export-\d+\.csv$/));

    createObjectUrl.mockRestore();
  });

  it('does not steal focus from the editor when a table mounts for the first time', () => {
    const outsideButton = document.createElement('button');
    outsideButton.textContent = 'outside';
    document.body.appendChild(outsideButton);
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    act(() => {
      renderer.root.render(
        <WindowProvider window={window} document={document}>
          <TableBlock>
            <tbody>
              <tr>
                <td>Name</td>
                <td>Alice</td>
              </tr>
            </tbody>
          </TableBlock>
        </WindowProvider>,
      );
    });

    // Mounting (or re-mounting after a virtual-list scroll) must not focus the
    // table's inline fullscreen trigger — that yanks the caret out of the input
    // mid-typing. Focus is only restored on the fullscreen→inline edge.
    expect(document.activeElement).toBe(outsideButton);

    document.body.removeChild(outsideButton);
  });

  it('traps focus inside the fullscreen overlay and restores it to the trigger on close', () => {
    act(() => {
      renderer.root.render(
        <WindowProvider window={window} document={document}>
          <TableBlock>
            <tbody>
              <tr>
                <td>Name</td>
                <td>Alice</td>
              </tr>
            </tbody>
          </TableBlock>
        </WindowProvider>,
      );
    });

    const fullscreenButton = renderer.container.querySelector(
      'button[aria-label="Open table fullscreen"]',
    ) as HTMLButtonElement;

    act(() => {
      fullscreenButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const overlay = document.body.querySelector('[data-table-fullscreen-overlay="true"]') as HTMLDivElement;
    expect(overlay).not.toBeNull();
    const firstFocusable = overlay.querySelector<HTMLElement>('button');
    expect(document.activeElement).toBe(firstFocusable);

    // Tab from the last focusable wraps to the first.
    const focusableButtons = Array.from(overlay.querySelectorAll<HTMLElement>('button'));
    const lastFocusable = focusableButtons[focusableButtons.length - 1];
    lastFocusable.focus();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(firstFocusable);

    // Closing returns focus to the trigger button. The inline tree re-mounts
    // when the portal unmounts, so compare against the fresh node by label.
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.body.querySelector('[data-table-fullscreen-overlay="true"]')).toBeNull();
    const focused = document.activeElement as HTMLElement | null;
    expect(focused?.tagName).toBe('BUTTON');
    expect(focused?.getAttribute('aria-label')).toBe('Open table fullscreen');
  });
});
