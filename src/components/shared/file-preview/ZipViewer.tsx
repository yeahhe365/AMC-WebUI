import React, { useEffect, useMemo, useState } from 'react';
import type { UploadedFile } from '@/types';
import JSZip from 'jszip';
import { GoogleSpinner } from '@/components/icons/GoogleSpinner';
import { AlertCircle, Archive, Code2, Download, Eye, Folder, Search, Sparkles, X } from 'lucide-react';
import { triggerDownload } from '@/utils/export/core';
import { getFileDisplayMeta } from '@/utils/file/fileDisplayStyles';
import { formatFileSize } from '@/utils/file/fileSize';
import { sanitizeZipEntryPath } from '@/utils/import-context/zipSafety';
import { useI18n } from '@/contexts/I18nContext';
import { isMarkdownFile } from '@/utils/file/fileTypeClassification';
import { LazyMarkdownRenderer } from '@/components/message/LazyMarkdownRenderer';
import { useSettingsStore } from '@/stores/settingsStore';

interface ZipViewerProps {
  file: UploadedFile;
  onConvertToContext?: (contextFile: File) => void | Promise<void>;
}

interface ZipEntryInfo {
  path: string;
  name: string;
  isDir: boolean;
  date: Date;
  size?: number;
  entry: JSZip.JSZipObject;
}

const getFileIcon = (fileName: string, isDir: boolean) => {
  if (isDir) return <Folder size={16} className="text-amber-400 shrink-0" />;
  const { Icon: FileIcon, colorClass } = getFileDisplayMeta({ name: fileName });
  return <FileIcon size={16} className={`${colorClass} shrink-0`} strokeWidth={1.75} />;
};

export const ZipViewer: React.FC<ZipViewerProps> = ({ file, onConvertToContext }) => {
  const { t } = useI18n();
  const currentThemeId = useSettingsStore((state) => state.currentTheme.id);
  const [entries, setEntries] = useState<ZipEntryInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewItem, setPreviewItem] = useState<{ path: string; name: string; content: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<'preview' | 'source'>('preview');
  const [isConvertingContext, setIsConvertingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setPreviewItem(null);

    const loadZip = async () => {
      try {
        let buffer: ArrayBuffer | null = null;
        if (file.rawFile instanceof Blob) {
          buffer = await file.rawFile.arrayBuffer();
        } else if (file.dataUrl) {
          const response = await fetch(file.dataUrl);
          buffer = await response.arrayBuffer();
        }

        if (!buffer) {
          throw new Error('No data available for ZIP preview.');
        }

        if (cancelled) return;

        const zip = await JSZip.loadAsync(buffer);
        const parsedEntries: ZipEntryInfo[] = [];

        zip.forEach((relativePath, zipEntry) => {
          const safePath = sanitizeZipEntryPath(relativePath);
          if (!safePath) {
            return;
          }

          const parts = safePath.split('/');
          const name = parts[parts.length - 1] || safePath;

          // @ts-expect-error JSZip internal uncompressedSize
          const uncompressedSize = zipEntry._data?.uncompressedSize as number | undefined;

          parsedEntries.push({
            path: safePath,
            name,
            isDir: zipEntry.dir,
            date: zipEntry.date,
            size: uncompressedSize,
            entry: zipEntry,
          });
        });

        // Sort directories first, then alphabetically
        parsedEntries.sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.path.localeCompare(b.path);
        });

        if (!cancelled) {
          setEntries(parsedEntries);
          setIsLoading(false);
        }
      } catch (zipLoadError) {
        if (!cancelled) {
          setError(zipLoadError instanceof Error ? zipLoadError.message : 'Failed to parse ZIP archive.');
          setIsLoading(false);
        }
      }
    };

    void loadZip();

    return () => {
      cancelled = true;
    };
  }, [file]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const query = searchQuery.toLowerCase();
    return entries.filter((e) => e.path.toLowerCase().includes(query));
  }, [entries, searchQuery]);

  const stats = useMemo(() => {
    const fileCount = entries.filter((e) => !e.isDir).length;
    const dirCount = entries.filter((e) => e.isDir).length;
    const totalBytes = entries.reduce((acc, e) => acc + (e.size || 0), 0);
    return { fileCount, dirCount, totalBytes };
  }, [entries]);

  const handleDownloadEntry = async (entryInfo: ZipEntryInfo) => {
    try {
      const blob = await entryInfo.entry.async('blob');
      const url = URL.createObjectURL(blob);
      triggerDownload(url, entryInfo.name);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Ignore download errors
    }
  };

  const handleViewTextEntry = async (entryInfo: ZipEntryInfo) => {
    if (entryInfo.isDir) return;
    if (entryInfo.size && entryInfo.size > 5 * 1024 * 1024) {
      setPreviewItem({
        path: entryInfo.path,
        name: entryInfo.name,
        content: t('zipTextPreviewTooLarge'),
      });
      return;
    }
    try {
      const text = await entryInfo.entry.async('text');
      setPreviewItem({ path: entryInfo.path, name: entryInfo.name, content: text });
      setPreviewMode('preview');
    } catch {
      // Binary or cannot read as text
    }
  };

  const handleConvertToContext = async () => {
    if (isConvertingContext) return;
    setIsConvertingContext(true);
    setContextError(null);

    try {
      let rawBlob: Blob | null = null;
      if (file.rawFile instanceof Blob) {
        rawBlob = file.rawFile;
      } else if (file.dataUrl) {
        const response = await fetch(file.dataUrl);
        rawBlob = await response.blob();
      }

      if (!rawBlob) {
        throw new Error('No zip data available to convert.');
      }

      const zipFile = rawBlob instanceof File ? rawBlob : new File([rawBlob], file.name, { type: 'application/zip' });
      const { generateZipContext } = await import('@/utils/import-context/loaders');
      const contextFile = await generateZipContext(zipFile);

      if (onConvertToContext) {
        await onConvertToContext(contextFile);
      } else {
        const url = URL.createObjectURL(contextFile);
        triggerDownload(url, contextFile.name);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (conversionError) {
      setContextError(
        conversionError instanceof Error && conversionError.message ? conversionError.message : t('zipProcessFailed'),
      );
    } finally {
      setIsConvertingContext(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-[var(--theme-text-secondary)] gap-3 bg-transparent">
        <GoogleSpinner size={36} />
        <p className="text-sm font-medium">正在解包压缩文件...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-[var(--theme-text-danger)] gap-3 bg-transparent">
        <AlertCircle size={44} />
        <p className="text-sm font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--theme-bg-primary)] select-text">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/50 backdrop-blur-xs flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-[var(--theme-text-secondary)]">
          <Archive size={16} className="text-[var(--theme-text-accent)] shrink-0" />
          <span className="font-medium text-[var(--theme-text-primary)]">
            {stats.fileCount} 个文件 · {stats.dirCount} 个文件夹
          </span>
          <span className="text-[var(--theme-text-tertiary)] font-mono text-[11px] hidden sm:inline">
            (解压后约 {formatFileSize(stats.totalBytes) || '0 B'})
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleConvertToContext()}
            disabled={isConvertingContext}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--theme-bg-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] cursor-pointer"
            title={t('zipConvertToContext')}
          >
            {isConvertingContext ? (
              <>
                <GoogleSpinner size={13} />
                <span>{t('zipConvertingToContext')}</span>
              </>
            ) : (
              <>
                <Sparkles size={13} />
                <span>{t('zipConvertToContext')}</span>
              </>
            )}
          </button>

          <div className="relative flex items-center">
            <Search size={14} className="absolute left-2.5 text-[var(--theme-text-tertiary)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索压缩包文件..."
              className="pl-8 pr-7 py-1.5 text-xs rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-border-focus)] w-36 sm:w-52 transition-all"
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
        </div>
      </div>

      {contextError && (
        <div className="flex items-center justify-between px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-[var(--theme-text-danger)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{contextError}</span>
          </div>
          <button
            type="button"
            onClick={() => setContextError(null)}
            className="p-1 hover:text-[var(--theme-text-primary)]"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-grow min-h-0 flex overflow-hidden relative">
        <div
          className={`overflow-auto custom-scrollbar flex-1 ${
            previewItem
              ? 'hidden md:block md:w-80 lg:w-96 md:flex-none border-r border-[var(--theme-border-secondary)]'
              : 'w-full'
          }`}
        >
          <div className="divide-y divide-[var(--theme-border-secondary)]/30">
            {filteredEntries.map((item) => {
              const isSelected = previewItem?.path === item.path;
              return (
                <div
                  key={item.path}
                  className={`flex items-center justify-between px-4 py-2 transition-colors group cursor-pointer text-xs ${
                    isSelected
                      ? 'bg-[var(--theme-bg-accent)]/15 text-[var(--theme-text-primary)] font-medium'
                      : 'hover:bg-[var(--theme-bg-secondary)]/60 text-[var(--theme-text-secondary)]'
                  }`}
                  onClick={() => !item.isDir && handleViewTextEntry(item)}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                    {getFileIcon(item.name, item.isDir)}
                    <span
                      className={`truncate font-mono ${
                        item.isDir
                          ? 'font-semibold text-[var(--theme-text-primary)]'
                          : isSelected
                            ? 'text-[var(--theme-text-primary)] font-semibold'
                            : 'group-hover:text-[var(--theme-text-primary)]'
                      }`}
                      title={item.path}
                    >
                      {item.path}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-[var(--theme-text-tertiary)] font-mono text-[11px]">
                    {item.size !== undefined && <span>{formatFileSize(item.size) || '0 B'}</span>}
                    <span>{item.date.toLocaleDateString()}</span>
                    {!item.isDir && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDownloadEntry(item);
                        }}
                        className="p-1 rounded hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors opacity-0 group-hover:opacity-100"
                        title="下载此文件"
                      >
                        <Download size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {previewItem && (
          <div className="flex-1 min-w-0 h-full flex flex-col bg-[var(--theme-bg-primary)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--theme-bg-secondary)]/50 border-b border-[var(--theme-border-secondary)] text-xs flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0 mr-3">
                {getFileIcon(previewItem.name, false)}
                <span
                  className="font-mono font-semibold truncate text-[var(--theme-text-primary)]"
                  title={previewItem.path}
                >
                  {previewItem.path}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isMarkdownFile({ name: previewItem.name }) && (
                  <div className="flex items-center rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('preview')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                        previewMode === 'preview'
                          ? 'bg-[var(--theme-bg-accent)] text-white shadow-2xs font-medium'
                          : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                      }`}
                    >
                      <Eye size={12} />
                      <span>预览</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('source')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                        previewMode === 'source'
                          ? 'bg-[var(--theme-bg-accent)] text-white shadow-2xs font-medium'
                          : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                      }`}
                    >
                      <Code2 size={12} />
                      <span>源码</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)] transition-colors"
                  title="关闭预览"
                >
                  <X size={14} />
                  <span className="hidden sm:inline">关闭预览</span>
                </button>
              </div>
            </div>

            <div className="flex-grow min-h-0 overflow-auto custom-scrollbar">
              {isMarkdownFile({ name: previewItem.name }) && previewMode === 'preview' ? (
                <div className="p-6 sm:p-8 max-w-4xl mx-auto">
                  <div className="markdown-body modern-markdown-reader min-h-[50vh] bg-transparent">
                    <LazyMarkdownRenderer
                      content={previewItem.content}
                      isLoading={false}
                      themeId={currentThemeId}
                      fallbackMode="raw"
                      allowHtml={true}
                      onImageClick={() => {}}
                      onOpenHtmlPreview={() => {}}
                      onOpenSidePanel={() => {}}
                      expandCodeBlocksByDefault={true}
                      isMermaidRenderingEnabled={true}
                      isGraphvizRenderingEnabled={true}
                      interactiveMode="disabled"
                    />
                  </div>
                </div>
              ) : (
                <pre className="p-5 text-xs font-mono text-[var(--theme-text-primary)] whitespace-pre-wrap select-text leading-relaxed">
                  {previewItem.content}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
