import { describe, expect, it, vi, beforeEach } from 'vitest';
import { exportTableToExcel, extractTableData } from './tableExcel';

vi.mock('@/services/objectUrlManager', () => ({
  createManagedObjectUrl: vi.fn(() => 'blob:mock-url'),
  releaseManagedObjectUrl: vi.fn(),
}));

vi.mock('./core', () => ({
  triggerDownload: vi.fn(),
}));

describe('tableExcel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractTableData', () => {
    it('returns empty array when table element has no rows', () => {
      const table = document.createElement('table');
      expect(extractTableData(table)).toEqual([]);
    });

    it('extracts headers and cells correctly from HTMLTableElement', () => {
      const table = document.createElement('table');
      table.innerHTML = `
        <thead>
          <tr><th>Name</th><th>Age</th><th>Role</th></tr>
        </thead>
        <tbody>
          <tr><td>Alice</td><td>28</td><td>Engineer</td></tr>
          <tr><td>Bob</td><td>34</td><td>Designer</td></tr>
        </tbody>
      `;
      const result = extractTableData(table);
      expect(result).toEqual([
        ['Name', 'Age', 'Role'],
        ['Alice', '28', 'Engineer'],
        ['Bob', '34', 'Designer'],
      ]);
    });
  });

  describe('exportTableToExcel', () => {
    it('returns false for empty data', async () => {
      const result = await exportTableToExcel([]);
      expect(result).toBe(false);
    });

    it('exports 2D array data to .xlsx and triggers download', async () => {
      const { triggerDownload } = await import('./core');
      const { createManagedObjectUrl } = await import('@/services/objectUrlManager');

      const data = [
        ['Product', 'Price', 'Stock'],
        ['Apple', '$1.50', '100'],
        ['Orange', '$2.00', '50'],
      ];

      const success = await exportTableToExcel(data, { fileName: 'test-products.xlsx' });
      expect(success).toBe(true);

      expect(createManagedObjectUrl).toHaveBeenCalledTimes(1);
      const createdBlob = vi.mocked(createManagedObjectUrl).mock.calls[0][0] as Blob;
      expect(createdBlob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(createdBlob.size).toBeGreaterThan(0);

      expect(triggerDownload).toHaveBeenCalledWith('blob:mock-url', 'test-products.xlsx');
    });

    it('exports HTMLTableElement directly to .xlsx', async () => {
      const { triggerDownload } = await import('./core');

      const table = document.createElement('table');
      table.innerHTML = `
        <tr><th>Col A</th><th>Col B</th></tr>
        <tr><td>1</td><td>2</td></tr>
      `;

      const success = await exportTableToExcel(table);
      expect(success).toBe(true);
      expect(triggerDownload).toHaveBeenCalledWith('blob:mock-url', expect.stringMatching(/^table-export-\d+\.xlsx$/));
    });
  });
});
