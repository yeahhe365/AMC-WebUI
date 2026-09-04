import { logService } from '@/services/logService';
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Download, FileSpreadsheet, FileText, Copy, Check } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useWindowContext } from '@/contexts/WindowContext';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload } from '@/utils/export/core';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { Z_INDEX_TABLE_FULLSCREEN } from '@/constants/layout';
import {
  MENU_ITEM_BUTTON_CLASS,
  MENU_ITEM_COMPACT_BUTTON_CLASS,
  MENU_ITEM_DEFAULT_STATE_CLASS,
} from '@/constants/menuClasses';

type HastElementLike = {
  properties?: Record<string, unknown>;
};

type TableBlockProps = React.TableHTMLAttributes<HTMLTableElement> & {
  node?: HastElementLike;
};

type TableChildProps = {
  children?: React.ReactNode;
  node?: HastElementLike;
};

const hasRawHtmlInlineStyle = (node?: HastElementLike): boolean => {
  return typeof node?.properties?.style === 'string' && node.properties.style.trim().length > 0;
};

const COPY_FEEDBACK_MS = 2000;

const hasInlineStyle = (node: React.ReactNode): boolean => {
  return React.Children.toArray(node).some((child) => {
    if (!React.isValidElement<TableChildProps>(child)) {
      return false;
    }

    return hasRawHtmlInlineStyle(child.props.node) || hasInlineStyle(child.props.children);
  });
};

export const TableBlock: React.FC<TableBlockProps> = ({ children, className, node, ...props }) => {
  const { t } = useI18n();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const { document: targetDocument } = useWindowContext();
  const tableRef = useRef<HTMLTableElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const fullscreenTriggerRef = useRef<HTMLButtonElement>(null);
  // Distinguishes "first mount" from "fullscreen just closed": on mount the
  // inline trigger is already focused/focusable but the effect would steal
  // focus from wherever the user is typing, so only refocus on the actual
  // fullscreen → inline transition edge.
  const wasFullscreenRef = useRef(false);

  useClickOutside(menuRef, () => setShowDownloadMenu(false));
  useFocusTrap(fullscreenRef, isFullscreen, {
    document: targetDocument,
    restoreFocusTo: fullscreenTriggerRef.current,
  });

  // The inline trigger unmounts while the fullscreen portal is open, so the
  // focus-trap's saved element reference goes stale. When fullscreen closes,
  // refocus the freshly re-mounted trigger button.
  useEffect(() => {
    if (isFullscreen) {
      wasFullscreenRef.current = true;
      return undefined;
    }
    if (wasFullscreenRef.current) {
      wasFullscreenRef.current = false;
      fullscreenTriggerRef.current?.focus();
    }
    return undefined;
  }, [isFullscreen]);

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

  useEffect(() => {
    if (!isFullscreen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    };

    targetDocument.addEventListener('keydown', handleKeyDown);
    return () => targetDocument.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, targetDocument]);

  const handleCopyMarkdown = async () => {
    if (!tableRef.current) return;
    try {
      // GFM has no syntax for merged cells; turndown expands them into empty
      // placeholders and the structure is lost. Fall back to raw HTML so a copy
      // always round-trips the actual table content.
      if (tableRef.current.querySelector('[rowspan],[colspan]')) {
        await navigator.clipboard.writeText(tableRef.current.outerHTML);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
        return;
      }
      const { convertHtmlToMarkdown } = await import('@/utils/htmlToMarkdown');
      const markdown = convertHtmlToMarkdown(tableRef.current.outerHTML);
      await navigator.clipboard.writeText(markdown);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    } catch (error) {
      logService.error('Failed to copy markdown table', error);
    }
  };

  const handleDownloadCSV = () => {
    if (!tableRef.current) return;
    const rows = Array.from(tableRef.current.querySelectorAll('tr'));
    const csvContent = rows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        return cells
          .map((cell) => {
            const text = (cell as HTMLElement).innerText || '';
            // Escape double quotes by doubling them
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(',');
      })
      .join('\n');

    // UTF-8 BOM so Excel detects the encoding and does not garble CJK text.
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = createManagedObjectUrl(blob);
    triggerDownload(url, `table-export-${Date.now()}.csv`);
    setShowDownloadMenu(false);
  };

  const handleDownloadExcel = async () => {
    if (!tableRef.current) return;

    const tableHtml = tableRef.current.outerHTML;
    const template = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--><meta charset="utf-8"></head>
            <body>${tableHtml}</body></html>`;
    const blob = new Blob([template], { type: 'application/vnd.ms-excel' });
    const url = createManagedObjectUrl(blob);
    triggerDownload(url, `table-export-${Date.now()}.xls`);
    setShowDownloadMenu(false);
  };

  const isRichHtmlTable = hasRawHtmlInlineStyle(node) || hasInlineStyle(children);
  const tableClassName = [className, isRichHtmlTable ? 'rich-html-table' : 'text-left'].filter(Boolean).join(' ');
  const inlineContainerClassName = 'relative group/table my-4 w-full max-w-full overflow-visible';
  // Linear style: frameless — the wrapper only provides horizontal scrolling.
  const inlineScrollClassName =
    'overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-[var(--theme-scrollbar-thumb)] scrollbar-track-transparent w-full';
  const fullscreenContainerClassName = isRichHtmlTable
    ? 'w-full max-w-6xl mx-auto markdown-body p-0 my-0 overflow-x-auto max-h-full'
    : 'w-full max-w-6xl mx-auto bg-[var(--theme-bg-primary)] rounded-lg shadow-xl border border-[var(--theme-border-secondary)] markdown-body p-0 my-0 overflow-auto max-h-full';

  // When fullscreen, we use a portal and a specific layout.
  if (isFullscreen) {
    return createPortal(
      <div
        ref={fullscreenRef}
        data-table-fullscreen-overlay="true"
        role="dialog"
        aria-modal="true"
        aria-label={t('tableFullscreenAria')}
        className={`fixed inset-0 ${Z_INDEX_TABLE_FULLSCREEN} bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] p-4 sm:p-10 overflow-auto overscroll-contain flex flex-col items-center animate-in fade-in duration-200`}
      >
        <div className="fixed top-4 right-4 flex gap-2 z-50">
          <button
            onClick={handleCopyMarkdown}
            className={`p-1.5 rounded-lg bg-[var(--theme-bg-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] shadow-sm border border-[var(--theme-border-secondary)] transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
            title={isCopied ? t('copied') : t('tableCopyMarkdown')}
          >
            {isCopied ? <Check size={16} className="text-[var(--theme-text-success)]" /> : <Copy size={16} />}
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowDownloadMenu(!showDownloadMenu)}
              className={`p-1.5 rounded-lg bg-[var(--theme-bg-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] shadow-sm border border-[var(--theme-border-secondary)] transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
              title={t('download')}
            >
              <Download size={16} />
            </button>

            {showDownloadMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-secondary)] rounded-xl shadow-xl overflow-hidden z-50">
                <button
                  onClick={handleDownloadCSV}
                  className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS} px-4 py-3 gap-3`}
                >
                  <FileText size={16} className="text-[var(--theme-text-tertiary)]" />
                  <span>{t('exportToCSV')}</span>
                </button>
                <button
                  onClick={handleDownloadExcel}
                  className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS} px-4 py-3 gap-3`}
                >
                  <FileSpreadsheet size={16} className="text-[var(--theme-text-success)]" />
                  <span>{t('exportToExcel')}</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={toggleFullscreen}
            className={`p-1.5 rounded-lg bg-[var(--theme-bg-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] shadow-sm border border-[var(--theme-border-secondary)] transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
            title={t('tableExitFullscreen')}
          >
            <Minimize2 size={16} />
          </button>
        </div>

        <div className={fullscreenContainerClassName} data-rich-html-table-container={isRichHtmlTable || undefined}>
          <table ref={tableRef} className={tableClassName} {...props}>
            {children}
          </table>
        </div>
      </div>,
      targetDocument.body,
    );
  }

  return (
    <div
      className={inlineContainerClassName}
      data-rich-html-table-container={isRichHtmlTable || undefined}
      data-table-actions-scope="true"
    >
      <div className={inlineScrollClassName}>
        <table ref={tableRef} className={tableClassName} {...props}>
          {children}
        </table>
      </div>

      <div className="absolute top-2 right-2 flex gap-1 z-10 opacity-0 pointer-events-none transition-opacity duration-200 group-hover/table:opacity-100 group-hover/table:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
        <button
          onClick={handleCopyMarkdown}
          aria-label={t('tableCopyMarkdownAria')}
          className={`p-1.5 rounded-md text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
          title={isCopied ? t('copied') : t('tableCopyMarkdown')}
        >
          {isCopied ? <Check size={14} className="text-[var(--theme-text-success)]" /> : <Copy size={14} />}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowDownloadMenu(!showDownloadMenu)}
            aria-label={t('tableDownloadAria')}
            className={`p-1.5 rounded-md text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
            title={t('download')}
          >
            <Download size={14} />
          </button>
          {showDownloadMenu && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-secondary)] rounded-lg shadow-lg overflow-hidden z-50">
              <button
                onClick={handleDownloadCSV}
                className={`${MENU_ITEM_COMPACT_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS}`}
              >
                <FileText size={14} className="text-[var(--theme-text-tertiary)]" />
                <span>{t('exportToCSV')}</span>
              </button>
              <button
                onClick={handleDownloadExcel}
                className={`${MENU_ITEM_COMPACT_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS}`}
              >
                <FileSpreadsheet size={14} className="text-[var(--theme-text-success)]" />
                <span>{t('exportToExcel')}</span>
              </button>
            </div>
          )}
        </div>

        <button
          ref={fullscreenTriggerRef}
          onClick={toggleFullscreen}
          aria-label={t('tableFullscreenAria')}
          className={`p-1.5 rounded-md text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
          title={t('htmlPreviewFullscreen')}
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
};
