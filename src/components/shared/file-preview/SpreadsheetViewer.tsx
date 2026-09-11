import React, { useEffect, useMemo, useState, useCallback, forwardRef } from 'react';
import { TableVirtuoso, type TableComponents } from 'react-virtuoso';
import type { UploadedFile } from '@/types';
import * as XLSX from 'xlsx';
import { GoogleSpinner } from '@/components/icons/GoogleSpinner';
import {
  AlertCircle,
  FileSpreadsheet,
  Search,
  Table,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
} from 'lucide-react';

interface SpreadsheetViewerProps {
  file: UploadedFile;
}

export const SpreadsheetViewer: React.FC<SpreadsheetViewerProps> = ({ file }) => {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [isCopiedCsv, setIsCopiedCsv] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setSearchQuery('');
    setSortCol(null);

    const loadWorkbook = async () => {
      try {
        let buffer: ArrayBuffer | null = null;
        if (file.rawFile instanceof Blob) {
          buffer = await file.rawFile.arrayBuffer();
        } else if (file.dataUrl) {
          const response = await fetch(file.dataUrl);
          buffer = await response.arrayBuffer();
        }

        if (!buffer) {
          throw new Error('No data available for spreadsheet preview.');
        }

        if (cancelled) return;

        const wb = XLSX.read(buffer, { type: 'array' });
        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          throw new Error('Spreadsheet contains no sheets.');
        }

        if (!cancelled) {
          setWorkbook(wb);
          setActiveSheetName(wb.SheetNames[0]);
          setIsLoading(false);
        }
      } catch (parseError) {
        if (!cancelled) {
          setError(parseError instanceof Error ? parseError.message : 'Failed to parse spreadsheet file.');
          setIsLoading(false);
        }
      }
    };

    void loadWorkbook();

    return () => {
      cancelled = true;
    };
  }, [file]);

  const rawRows = useMemo(() => {
    if (!workbook || !activeSheetName) return [];
    const sheet = workbook.Sheets[activeSheetName];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
  }, [workbook, activeSheetName]);

  const maxCols = useMemo(() => {
    return rawRows.reduce((max, row) => Math.max(max, row.length), 0);
  }, [rawRows]);

  const headerRow = useMemo(() => rawRows[0] || [], [rawRows]);
  const bodyRows = useMemo(() => rawRows.slice(1), [rawRows]);

  const handleSort = useCallback(
    (colIdx: number) => {
      if (sortCol === colIdx) {
        if (sortAsc) {
          setSortAsc(false);
        } else {
          setSortCol(null);
          setSortAsc(true);
        }
      } else {
        setSortCol(colIdx);
        setSortAsc(true);
      }
    },
    [sortCol, sortAsc],
  );

  const sortedBodyRows = useMemo(() => {
    if (sortCol === null) return bodyRows;
    return [...bodyRows].sort((a, b) => {
      const valA = a[sortCol];
      const valB = b[sortCol];
      if (valA === valB) return 0;
      if (valA === undefined || valA === null || valA === '') return 1;
      if (valB === undefined || valB === null || valB === '') return -1;

      // Check if both values can be interpreted numerically (including percentages and currency)
      const parseNum = (v: unknown): number => {
        if (typeof v === 'number') return v;
        const cleaned = String(v)
          .replace(/[%$¥,]/g, '')
          .trim();
        const parsed = Number(cleaned);
        return isNaN(parsed) ? NaN : parsed;
      };

      const numA = parseNum(valA);
      const numB = parseNum(valB);

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortAsc ? numA - numB : numB - numA;
      }

      const strA = String(valA);
      const strB = String(valB);
      return sortAsc ? strA.localeCompare(strB, 'zh-CN') : strB.localeCompare(strA, 'zh-CN');
    });
  }, [bodyRows, sortCol, sortAsc]);

  const filteredBodyRows = useMemo(() => {
    if (!searchQuery.trim()) return sortedBodyRows;
    const query = searchQuery.toLowerCase();
    return sortedBodyRows.filter((row) =>
      row.some((cell) => cell !== null && cell !== undefined && String(cell).toLowerCase().includes(query)),
    );
  }, [sortedBodyRows, searchQuery]);

  const handleCopyAsCsv = useCallback(async () => {
    if (!workbook || !activeSheetName) return;
    const sheet = workbook.Sheets[activeSheetName];
    if (!sheet) return;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    try {
      await navigator.clipboard.writeText(csv);
      setIsCopiedCsv(true);
      setTimeout(() => setIsCopiedCsv(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  }, [workbook, activeSheetName]);

  // Column letters generator: A, B, C... Z, AA, AB...
  const getColLabel = (index: number) => {
    let label = '';
    let num = index;
    while (num >= 0) {
      label = String.fromCharCode((num % 26) + 65) + label;
      num = Math.floor(num / 26) - 1;
    }
    return label;
  };

  const renderCellContent = useCallback(
    (val: string | number | boolean | null | undefined) => {
      if (val === null || val === undefined || val === '') return '';
      const text = String(val);
      if (!searchQuery.trim()) return text;

      const query = searchQuery.toLowerCase();
      const lower = text.toLowerCase();
      const matchIndex = lower.indexOf(query);
      if (matchIndex === -1) return text;

      const before = text.slice(0, matchIndex);
      const match = text.slice(matchIndex, matchIndex + query.length);
      const after = text.slice(matchIndex + query.length);

      return (
        <>
          {before}
          <mark className="bg-amber-300 text-amber-950 font-bold px-0.5 rounded-xs">{match}</mark>
          {after}
        </>
      );
    },
    [searchQuery],
  );

  const virtuosoComponents: TableComponents<(string | number | boolean | null)[]> = useMemo(
    () => ({
      Table: ({ style, ...props }) => (
        <table
          {...props}
          style={{ ...style, width: '100%', borderCollapse: 'collapse' }}
          className="w-full border-collapse text-xs font-sans text-left"
        />
      ),
      TableHead: forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>((props, ref) => (
        <thead {...props} ref={ref} className="sticky top-0 bg-[var(--theme-bg-secondary)] shadow-xs z-10" />
      )),
      TableRow: (props) => (
        <tr
          {...props}
          className="border-b border-[var(--theme-border-secondary)]/40 hover:bg-[var(--theme-bg-secondary)]/50 even:bg-[var(--theme-bg-secondary)]/15 transition-colors"
        />
      ),
    }),
    [],
  );

  const fixedHeaderContent = useCallback(() => {
    return (
      <>
        <tr className="border-b border-[var(--theme-border-secondary)] text-[var(--theme-text-tertiary)] font-mono text-[11px]">
          <th className="w-12 min-w-12 px-2 py-1 text-center bg-[var(--theme-bg-tertiary)]/50 border-r border-[var(--theme-border-secondary)] font-normal select-none">
            #
          </th>
          {Array.from({ length: maxCols }).map((_, colIdx) => {
            const isSorted = sortCol === colIdx;
            return (
              <th
                key={colIdx}
                onClick={() => handleSort(colIdx)}
                className="px-3 py-1 border-r border-[var(--theme-border-secondary)] font-normal text-center select-none bg-[var(--theme-bg-tertiary)]/20 hover:bg-[var(--theme-bg-tertiary)]/50 cursor-pointer transition-colors group min-w-[120px]"
                title={`点击按列 ${getColLabel(colIdx)} 排序`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span>{getColLabel(colIdx)}</span>
                  {isSorted ? (
                    sortAsc ? (
                      <ArrowUp size={11} className="text-[var(--theme-text-accent)]" />
                    ) : (
                      <ArrowDown size={11} className="text-[var(--theme-text-accent)]" />
                    )
                  ) : (
                    <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                  )}
                </div>
              </th>
            );
          })}
        </tr>

        {headerRow.length > 0 && (
          <tr className="border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)]/90 font-semibold text-[var(--theme-text-primary)]">
            <th className="w-12 min-w-12 px-2 py-2 text-center bg-[var(--theme-bg-tertiary)]/40 border-r border-[var(--theme-border-secondary)] font-mono select-none text-[var(--theme-text-tertiary)] text-[11px]">
              1
            </th>
            {Array.from({ length: maxCols }).map((_, colIdx) => (
              <th
                key={colIdx}
                className="px-3.5 py-2 border-r border-[var(--theme-border-secondary)] whitespace-nowrap overflow-hidden text-ellipsis min-w-[120px] max-w-sm"
                title={headerRow[colIdx] !== undefined ? String(headerRow[colIdx]) : ''}
              >
                {headerRow[colIdx] !== undefined ? String(headerRow[colIdx]) : ''}
              </th>
            ))}
          </tr>
        )}
      </>
    );
  }, [maxCols, sortCol, sortAsc, headerRow, handleSort]);

  const itemContent = useCallback(
    (rowIdx: number, row: (string | number | boolean | null)[]) => {
      const actualRowNumber = rowIdx + 2;
      return (
        <>
          <td className="w-12 min-w-12 px-2 py-1.5 text-center bg-[var(--theme-bg-secondary)]/30 border-r border-[var(--theme-border-secondary)] font-mono text-[11px] text-[var(--theme-text-tertiary)] select-none">
            {actualRowNumber}
          </td>

          {Array.from({ length: maxCols }).map((_, colIdx) => {
            const cellVal = row[colIdx];
            return (
              <td
                key={colIdx}
                className="px-3.5 py-1.5 border-r border-[var(--theme-border-secondary)]/30 whitespace-nowrap overflow-hidden text-ellipsis min-w-[120px] max-w-sm font-mono text-xs text-[var(--theme-text-primary)]"
                title={cellVal !== undefined && cellVal !== null ? String(cellVal) : ''}
              >
                {renderCellContent(cellVal)}
              </td>
            );
          })}
        </>
      );
    },
    [maxCols, renderCellContent],
  );

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-[var(--theme-text-secondary)] gap-3 bg-transparent">
        <GoogleSpinner size={36} />
        <p className="text-sm font-medium">正在解析电子表格...</p>
      </div>
    );
  }

  if (error || !workbook) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-[var(--theme-text-danger)] gap-3 bg-transparent">
        <AlertCircle size={44} />
        <p className="text-sm font-medium">{error || '无法读取该表格文件'}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--theme-bg-primary)] select-text">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/70 backdrop-blur-sm z-20 flex-shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5 custom-scrollbar">
          <Table size={15} className="text-[var(--theme-text-tertiary)] shrink-0 mr-1" />
          {workbook.SheetNames.map((sheetName) => (
            <button
              key={sheetName}
              type="button"
              onClick={() => {
                setActiveSheetName(sheetName);
                setSearchQuery('');
                setSortCol(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeSheetName === sheetName
                  ? 'bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] shadow-sm font-semibold'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  activeSheetName === sheetName ? 'bg-current' : 'bg-transparent'
                }`}
              />
              {sheetName}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 ml-auto">
          <span className="text-xs text-[var(--theme-text-tertiary)] font-mono whitespace-nowrap hidden sm:inline">
            {searchQuery.trim()
              ? `已匹配 ${filteredBodyRows.length} / ${bodyRows.length} 行`
              : `${bodyRows.length} 行 · ${maxCols} 列`}
          </span>

          <div className="relative flex items-center">
            <Search size={14} className="absolute left-2.5 text-[var(--theme-text-tertiary)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索表格内容..."
              className="pl-8 pr-7 py-1 text-xs rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-border-focus)] w-32 sm:w-48 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] cursor-pointer"
                title="清除搜索"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyAsCsv}
            className="px-2.5 py-1 text-xs rounded-lg border border-[var(--theme-border-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)] transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            title="复制当前工作表为 CSV"
          >
            {isCopiedCsv ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
            <span className="hidden sm:inline">{isCopiedCsv ? '已复制' : '复制 CSV'}</span>
          </button>
        </div>
      </div>

      <div className="flex-grow min-h-0 relative bg-[var(--theme-bg-primary)]">
        {rawRows.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-[var(--theme-text-tertiary)] gap-2">
            <FileSpreadsheet size={36} className="opacity-40" />
            <p className="text-sm">当前工作表为空</p>
          </div>
        ) : filteredBodyRows.length === 0 && searchQuery.trim() ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-[var(--theme-text-tertiary)] gap-2 p-6">
            <Search size={32} className="opacity-40" />
            <p className="text-sm">未找到与 &quot;{searchQuery}&quot; 相关的表格数据</p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2 text-xs text-[var(--theme-text-accent)] hover:underline cursor-pointer"
            >
              清除搜索条件
            </button>
          </div>
        ) : (
          <TableVirtuoso
            style={{ height: '100%', width: '100%' }}
            className="custom-scrollbar"
            data={filteredBodyRows}
            initialItemCount={Math.min(50, filteredBodyRows.length)}
            components={virtuosoComponents}
            fixedHeaderContent={fixedHeaderContent}
            itemContent={itemContent}
          />
        )}
      </div>
    </div>
  );
};
