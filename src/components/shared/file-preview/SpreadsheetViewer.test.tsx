import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it } from 'vitest';
import type { UploadedFile } from '@/types';
import * as XLSX from 'xlsx';
import { SpreadsheetViewer } from './SpreadsheetViewer';

describe('SpreadsheetViewer', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  const createSampleWorkbookFile = (): UploadedFile => {
    const wb = XLSX.utils.book_new();
    const wsData1 = [
      ['Model', 'Provider', 'Calls'],
      ['gemini-2.5-pro', 'Google', 12580],
      ['claude-3-7-sonnet', 'Anthropic', 24300],
      ['gpt-4o', 'OpenAI', 41200],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(wsData1);
    XLSX.utils.book_append_sheet(wb, ws1, 'Models');

    const wsData2 = [
      ['Date', 'Active Users'],
      ['2026-01', 5000],
      ['2026-02', 8000],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(wsData2);
    XLSX.utils.book_append_sheet(wb, ws2, 'Users');

    const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbArray], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    return {
      id: 'xlsx-file-1',
      name: 'metrics.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: blob.size,
      rawFile: blob as File,
      uploadState: 'active',
    };
  };

  it('renders spreadsheet with sheet tabs, rows, and full-height layout', async () => {
    const file = createSampleWorkbookFile();

    await act(async () => {
      renderer.root.render(<SpreadsheetViewer file={file} />);
    });

    // Verify card wrapper fills full height and does not have pt-20 clearance
    const outerContainer = renderer.container.firstChild as HTMLElement;
    expect(outerContainer.className).toContain('w-full');
    expect(outerContainer.className).toContain('h-full');
    expect(outerContainer.className).not.toContain('pt-20');

    // Verify sheet tabs exist
    expect(renderer.container.textContent).toContain('Models');
    expect(renderer.container.textContent).toContain('Users');

    // Verify header and body cells
    expect(renderer.container.textContent).toContain('Model');
    expect(renderer.container.textContent).toContain('Provider');
    expect(renderer.container.textContent).toContain('gemini-2.5-pro');
    expect(renderer.container.textContent).toContain('claude-3-7-sonnet');
    expect(renderer.container.textContent).toContain('gpt-4o');
  });

  it('filters rows when searching', async () => {
    const file = createSampleWorkbookFile();

    await act(async () => {
      renderer.root.render(<SpreadsheetViewer file={file} />);
    });

    const searchInput = renderer.container.querySelector('input[placeholder*="搜索表格内容"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    await act(async () => {
      searchInput.value = 'Google';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // React state update via onChange
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      nativeInputValueSetter?.call(searchInput, 'Google');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(renderer.container.textContent).toContain('gemini-2.5-pro');
  });

  it('virtualizes large datasets without rendering all rows to DOM', async () => {
    const wb = XLSX.utils.book_new();
    const headers = ['ID', 'Name', 'Score'];
    const rows = Array.from({ length: 500 }, (_, i) => [i + 1, `User ${i + 1}`, (i * 17) % 100]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'BigData');
    const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbArray], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const file: UploadedFile = {
      id: 'big-data-file',
      name: 'bigdata.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: blob.size,
      rawFile: blob as File,
      uploadState: 'active',
    };

    await act(async () => {
      renderer.root.render(<SpreadsheetViewer file={file} />);
    });

    // Renders initial items
    expect(renderer.container.textContent).toContain('User 1');
    // Does NOT render row 499 into DOM, proving virtualization
    expect(renderer.container.textContent).not.toContain('User 499');
  });
});
