import { logService } from '@/services/logService';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload } from './core';

export interface ExportTableToExcelOptions {
  fileName?: string;
  sheetName?: string;
}

/**
 * Extracts 2D string matrix from an HTMLTableElement.
 */
export const extractTableData = (table: HTMLTableElement): string[][] => {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) {
    return [];
  }

  return rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      return cells.map((cell) => ((cell as HTMLElement).innerText || cell.textContent || '').trim());
    })
    .filter((row) => row.length > 0);
};

/**
 * Exports tabular data or an HTMLTableElement to a genuine .xlsx file.
 * Dynamically imports SheetJS (xlsx) to avoid impacting initial bundle size.
 */
export const exportTableToExcel = async (
  tableElementOrData: HTMLTableElement | string[][],
  options: ExportTableToExcelOptions = {},
): Promise<boolean> => {
  try {
    const data: string[][] =
      tableElementOrData instanceof HTMLTableElement ? extractTableData(tableElementOrData) : tableElementOrData;

    if (!data || data.length === 0 || data.every((row) => row.length === 0)) {
      return false;
    }

    // Dynamic import to keep xlsx out of the initial bundle
    const XLSX = await import('xlsx');

    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Auto-calculate column widths based on maximum content length per column
    const maxCols = Math.max(...data.map((row) => row.length));
    const colWidths = Array.from({ length: maxCols }, (_, colIndex) => {
      const maxLength = Math.max(...data.map((row) => (row[colIndex] ? String(row[colIndex]).length : 0)));
      return { wch: Math.min(Math.max(maxLength + 3, 10), 60) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'Sheet1');

    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = createManagedObjectUrl(blob);
    const fileName = options.fileName || `table-export-${Date.now()}.xlsx`;
    triggerDownload(url, fileName);
    return true;
  } catch (error) {
    logService.error('Failed to export table to Excel:', error);
    return false;
  }
};
