import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Presentation, Music, Video, Image as ImageIcon, FileCode, Table, Play } from 'lucide-react';
import type { LibraryItem } from '@/types';
import { useVisibleThumbnailGate } from '@/hooks/ui/useVisibleThumbnailGate';
import { isImageFileType, isVideoFileType, isAudioFileType, getLibraryFileType } from '@/utils/library/libraryFiles';
import { isTextFile, isMarkdownFile } from '@/utils/file/fileTypeClassification';
import { getFileDisplayMeta } from '@/utils/file/fileDisplayStyles';
import { fileToBlobUrl, cleanupFilePreviewUrl } from '@/utils/file/filePreviewUrls';
import { dbService } from '@/services/db/dbService';
import { readPdfThumbnailCache, getPdfThumbnailCacheKey } from '@/components/chat/input/files/pdfThumbnailCache';
import { extractYoutubeVideoId } from '@/utils/file/youtubeUrl';
import {
  generateDeterministicWaveform as generateWaveform,
  decodeAudioWaveform as decodeWaveform,
  readAudioWaveformCache as readWaveformCache,
  writeAudioWaveformCache as writeWaveformCache,
} from '@/utils/media/audioWaveform';

const LazyPdfFileThumbnail = lazy(() =>
  import('@/components/chat/input/files/PdfFileThumbnail').then((module) => ({
    default: module.PdfFileThumbnail,
  })),
);

interface LibraryItemThumbnailProps {
  item: LibraryItem;
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

// Bounded LRU cache for extracted text snippet lines
const TEXT_SNIPPET_CACHE_LIMIT = 256;
const textSnippetCache = new Map<string, string[]>();

const readSnippetCache = (id: string): string[] | undefined => {
  const cached = textSnippetCache.get(id);
  if (!cached) return undefined;
  textSnippetCache.delete(id);
  textSnippetCache.set(id, cached);
  return cached;
};

const writeSnippetCache = (id: string, lines: string[]) => {
  textSnippetCache.delete(id);
  textSnippetCache.set(id, lines);
  while (textSnippetCache.size > TEXT_SNIPPET_CACHE_LIMIT) {
    const oldestKey = textSnippetCache.keys().next().value;
    if (oldestKey === undefined) break;
    textSnippetCache.delete(oldestKey);
  }
};

// Bounded LRU cache for created thumbnail blob URLs across view-mode toggles
const THUMBNAIL_BLOB_CACHE_LIMIT = 64;
const thumbnailBlobUrlCache = new Map<string, string>();

const readThumbnailBlobCache = (id: string): string | undefined => {
  const cached = thumbnailBlobUrlCache.get(id);
  if (!cached) return undefined;
  thumbnailBlobUrlCache.delete(id);
  thumbnailBlobUrlCache.set(id, cached);
  return cached;
};

const writeThumbnailBlobCache = (id: string, url: string) => {
  thumbnailBlobUrlCache.delete(id);
  thumbnailBlobUrlCache.set(id, url);
  while (thumbnailBlobUrlCache.size > THUMBNAIL_BLOB_CACHE_LIMIT) {
    const oldestKey = thumbnailBlobUrlCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldestUrl = thumbnailBlobUrlCache.get(oldestKey);
    thumbnailBlobUrlCache.delete(oldestKey);
    if (oldestUrl) {
      cleanupFilePreviewUrl({ dataUrl: oldestUrl });
    }
  }
};

// Bounded LRU cache for extracted spreadsheet grid cells
const SPREADSHEET_GRID_CACHE_LIMIT = 128;
const spreadsheetGridCache = new Map<string, string[][]>();

const readSpreadsheetCache = (id: string): string[][] | undefined => {
  const cached = spreadsheetGridCache.get(id);
  if (!cached) return undefined;
  spreadsheetGridCache.delete(id);
  spreadsheetGridCache.set(id, cached);
  return cached;
};

const writeSpreadsheetCache = (id: string, rows: string[][]) => {
  spreadsheetGridCache.delete(id);
  spreadsheetGridCache.set(id, rows);
  while (spreadsheetGridCache.size > SPREADSHEET_GRID_CACHE_LIMIT) {
    const oldestKey = spreadsheetGridCache.keys().next().value;
    if (oldestKey === undefined) break;
    spreadsheetGridCache.delete(oldestKey);
  }
};

const parseDelimitedText = (text: string, maxRows = 5, maxCols = 4): string[][] => {
  const lines = text
    .slice(0, 4096)
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, maxRows);
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  return lines.map((line) => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells.slice(0, maxCols);
  });
};

const parseExcelBlob = async (blob: Blob, maxRows = 5, maxCols = 4): Promise<string[][]> => {
  if (blob.size > 8 * 1024 * 1024) return [];
  try {
    const XLSX = await import('xlsx');
    const buffer = await blob.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', sheetRows: maxRows });
    if (!wb.SheetNames || wb.SheetNames.length === 0) return [];
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    const rawRows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
    return rawRows
      .slice(0, maxRows)
      .map((row) =>
        (Array.isArray(row) ? row : [])
          .slice(0, maxCols)
          .map((cell) => (cell !== null && cell !== undefined ? String(cell) : '')),
      );
  } catch {
    return [];
  }
};

const isTextSnippetCandidate = (item: LibraryItem): boolean => {
  if (isImageFileType(item.type, item.name)) return false;
  if (isVideoFileType(item.type, item.name)) return false;
  if (isAudioFileType(item.type, item.name)) return false;
  const kind = getLibraryFileType(item.type, item.name);
  if (kind === 'pdf' || kind === 'spreadsheet' || kind === 'presentation') return false;

  return isTextFile({ name: item.name, type: item.type }) || isMarkdownFile({ name: item.name, type: item.type });
};

const extractSnippetLines = (content: string): string[] => {
  return content
    .slice(0, 2048)
    .split(/\r?\n/)
    .slice(0, 6)
    .map((l) => (l.length > 80 ? l.slice(0, 80) + '…' : l));
};

const CODE_KEYWORDS = new Set([
  'import',
  'export',
  'from',
  'default',
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'class',
  'extends',
  'interface',
  'type',
  'async',
  'await',
  'def',
  'self',
  'public',
  'private',
  'static',
  'new',
  'try',
  'catch',
  'throw',
  'package',
  'use',
  'fn',
  'mut',
  'struct',
  'true',
  'false',
  'null',
  'undefined',
  'nil',
  'None',
  'True',
  'False',
  'select',
  'where',
  'insert',
  'update',
  'delete',
]);

const renderHighlightedCodeLine = (text: string, ext: string) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return <span className="inline-block">&nbsp;</span>;
  }
  if ((ext === 'MD' || ext === 'MARKDOWN') && trimmed.startsWith('#')) {
    return <span className="text-[#89b4fa] font-bold">{text}</span>;
  }
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
    return <span className="text-[#6c7086] italic">{text}</span>;
  }
  if (ext === 'JSON' && trimmed.startsWith('"')) {
    const colonIdx = text.indexOf(':');
    if (colonIdx !== -1) {
      const key = text.slice(0, colonIdx);
      const rest = text.slice(colonIdx);
      return (
        <>
          <span className="text-[#89b4fa]">{key}</span>
          <span className="text-[#cdd6f4]">{rest}</span>
        </>
      );
    }
  }

  const tokens = text
    .split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|\b[a-zA-Z_$][a-zA-Z0-9_$]*\b|[^\w\s"'`]+|\s+)/g)
    .filter(Boolean);
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith('`')) {
          return (
            <span key={i} className="text-[#a6e3a1]">
              {tok}
            </span>
          );
        }
        if (CODE_KEYWORDS.has(tok)) {
          return (
            <span key={i} className="text-[#cba6f7] font-medium">
              {tok}
            </span>
          );
        }
        if (/^\d+(\.\d+)?$/.test(tok)) {
          return (
            <span key={i} className="text-[#fab387]">
              {tok}
            </span>
          );
        }
        if (tok === '=' || tok === '=>' || tok === '==' || tok === '===' || tok === ':' || tok === '+' || tok === '-') {
          return (
            <span key={i} className="text-[#89dceb]">
              {tok}
            </span>
          );
        }
        return <span key={i}>{tok}</span>;
      })}
    </>
  );
};

const LibraryItemThumbnailComponent: React.FC<LibraryItemThumbnailProps> = ({ item, size = 'sm', className = '' }) => {
  const isImage = isImageFileType(item.type, item.name);
  const isVideo = isVideoFileType(item.type, item.name);
  const isAudio = isAudioFileType(item.type, item.name);
  const fileType = getLibraryFileType(item.type, item.name);
  const isPdf = fileType === 'pdf';
  const isSpreadsheet = fileType === 'spreadsheet';
  const isSvg = item.name.toLowerCase().endsWith('.svg') || item.type === 'image/svg+xml';
  const isTextCandidate = isTextSnippetCandidate(item);
  const canPreview = isImage || isVideo || isPdf;

  const pdfWidth = size === 'sm' ? 92 : size === 'md' ? 128 : 280;
  const pdfCacheKey = useMemo(() => (isPdf ? getPdfThumbnailCacheKey(item, pdfWidth) : ''), [isPdf, item, pdfWidth]);
  const [cachedPdfImage, setCachedPdfImage] = useState(() =>
    pdfCacheKey ? readPdfThumbnailCache(pdfCacheKey) : undefined,
  );

  useEffect(() => {
    if (pdfCacheKey) {
      setCachedPdfImage(readPdfThumbnailCache(pdfCacheKey));
    }
  }, [pdfCacheKey]);

  const hasCachedPdf = !!cachedPdfImage;
  const cachedBlob = readThumbnailBlobCache(item.id);
  const initialBlobUrl = item.dataUrl
    ? isSvg && item.dataUrl.startsWith('data:') && !item.dataUrl.startsWith('data:image/svg+xml')
      ? item.dataUrl.replace(/^data:[^;]+;/, 'data:image/svg+xml;')
      : item.dataUrl
    : (cachedBlob ?? null);

  const [blobUrl, setBlobUrl] = useState<string | null>(initialBlobUrl);
  const [hasError, setHasError] = useState(false);
  const [videoPoster, setVideoPoster] = useState<string | null>(
    () => readThumbnailBlobCache(`poster:${item.id}`) ?? null,
  );
  const recoveryAttemptedRef = useRef(false);

  const youtubeVideoId = useMemo(() => {
    return (
      extractYoutubeVideoId(item.fileUri) ||
      extractYoutubeVideoId(item.name) ||
      (item.dataUrl ? extractYoutubeVideoId(item.dataUrl) : null)
    );
  }, [item.fileUri, item.name, item.dataUrl]);
  const [youtubeError, setYoutubeError] = useState(false);

  const handleImageError = useCallback(async () => {
    if (!recoveryAttemptedRef.current) {
      recoveryAttemptedRef.current = true;
      try {
        const blob = await dbService.fetchLibraryFileBlob(item);
        if (blob) {
          let finalBlob = blob;
          if (isSvg && finalBlob.type !== 'image/svg+xml') {
            finalBlob = new Blob([finalBlob], { type: 'image/svg+xml' });
          }
          const createdUrl = fileToBlobUrl(finalBlob);
          writeThumbnailBlobCache(item.id, createdUrl);
          setBlobUrl(createdUrl);
          setHasError(false);
          return;
        }
      } catch {
        // ignore
      }
    }
    setHasError(true);
  }, [item, isSvg]);

  const handleVideoError = useCallback(async () => {
    if (!recoveryAttemptedRef.current) {
      recoveryAttemptedRef.current = true;
      try {
        const blob = await dbService.fetchLibraryFileBlob(item);
        if (blob) {
          const createdUrl = fileToBlobUrl(blob);
          writeThumbnailBlobCache(item.id, createdUrl);
          setBlobUrl(createdUrl);
          setHasError(false);
          return;
        }
      } catch {
        // ignore
      }
    }
    setHasError(true);
  }, [item]);

  const [textLines, setTextLines] = useState<string[]>(() => {
    const cached = readSnippetCache(item.id);
    if (cached) return cached;
    if (item.textContent) {
      const lines = extractSnippetLines(item.textContent);
      writeSnippetCache(item.id, lines);
      return lines;
    }
    return [];
  });

  const [waveformBars, setWaveformBars] = useState<number[]>(() => {
    if (!isAudio) return [];
    const cached = readWaveformCache(item.id);
    if (cached) return cached;
    const initial = generateWaveform(`${item.id}:${item.name}:${item.size}`);
    writeWaveformCache(item.id, initial);
    return initial;
  });

  const [spreadsheetRows, setSpreadsheetRows] = useState<string[][]>(() => {
    if (!isSpreadsheet) return [];
    const cached = readSpreadsheetCache(item.id);
    if (cached) return cached;
    if (item.textContent) {
      const parsed = parseDelimitedText(item.textContent, 5, 4);
      if (parsed.length > 0) {
        writeSpreadsheetCache(item.id, parsed);
        return parsed;
      }
    }
    return [];
  });

  const hasImmediateSnippet = textLines.length > 0;
  const hasImmediateBlob = !!blobUrl;
  const hasImmediateSpreadsheet = spreadsheetRows.length > 0;
  const hasImmediateWaveform = waveformBars.length > 0;

  // Viewport gating: only gate items that require async I/O
  const needsGate =
    (isPdf && !hasCachedPdf) ||
    (isImage && !hasImmediateBlob) ||
    (isVideo && !hasImmediateBlob && !youtubeVideoId) ||
    (isTextCandidate && !hasImmediateSnippet) ||
    (isSpreadsheet && !hasImmediateSpreadsheet) ||
    (isAudio && !hasImmediateWaveform);

  const { containerRef, isVisible } = useVisibleThumbnailGate(needsGate);

  // Text snippet loader: only runs when in viewport
  useEffect(() => {
    if (!isTextCandidate || !isVisible) return;
    const cached = readSnippetCache(item.id);
    if (cached) {
      setTextLines(cached);
      return;
    }
    if (item.textContent) {
      const lines = extractSnippetLines(item.textContent);
      writeSnippetCache(item.id, lines);
      setTextLines(lines);
      return;
    }

    let active = true;
    const loadText = async () => {
      try {
        let blob = item.rawFile;
        if (!blob) {
          blob = await dbService.fetchLibraryFileBlob(item);
        }
        if (active && blob) {
          const text = await blob.slice(0, 2048).text();
          const lines = extractSnippetLines(text);
          writeSnippetCache(item.id, lines);
          setTextLines(lines);
        }
      } catch {
        // ignore
      }
    };

    void loadText();
    return () => {
      active = false;
    };
  }, [item, isTextCandidate, isVisible]);

  // Media blob loader: only runs when in viewport
  useEffect(() => {
    if (!canPreview || !isVisible) return;
    if (isPdf && (cachedPdfImage || !isVisible)) return;
    if (item.dataUrl) {
      let finalUrl = item.dataUrl;
      if (isSvg && finalUrl.startsWith('data:') && !finalUrl.startsWith('data:image/svg+xml')) {
        finalUrl = finalUrl.replace(/^data:[^;]+;/, 'data:image/svg+xml;');
      }
      setBlobUrl(finalUrl);
      return;
    }

    const cached = readThumbnailBlobCache(item.id);
    if (cached) {
      setBlobUrl(cached);
      return;
    }

    let active = true;
    const loadBlob = async () => {
      try {
        let blob = item.rawFile;
        if (!blob) {
          blob = await dbService.fetchLibraryFileBlob(item);
        }
        if (active && blob) {
          if (isSvg && blob.type !== 'image/svg+xml') {
            blob = new Blob([blob], { type: 'image/svg+xml' });
          }
          const createdUrl = fileToBlobUrl(blob);
          writeThumbnailBlobCache(item.id, createdUrl);
          setBlobUrl(createdUrl);
        }
      } catch {
        if (active) setHasError(true);
      }
    };

    void loadBlob();
    return () => {
      active = false;
    };
  }, [item, canPreview, isPdf, isVisible, cachedPdfImage, isSvg]);

  // Audio waveform loader: attempts real decoding via Web Audio API when in viewport
  useEffect(() => {
    if (!isAudio || !isVisible) return;
    const cached = readWaveformCache(item.id);
    if (cached && cached.length > 0) {
      setWaveformBars(cached);
    }

    let active = true;
    const loadWaveform = async () => {
      try {
        let blob = item.rawFile;
        if (!blob && item.dataUrl?.startsWith('blob:')) {
          try {
            const res = await fetch(item.dataUrl);
            blob = await res.blob();
          } catch {
            // dead blob URL fallback
          }
        }
        if (!blob) {
          blob = await dbService.fetchLibraryFileBlob(item);
        }
        if (active && blob) {
          const peaks = await decodeWaveform(blob, 28);
          if (active && peaks && peaks.length > 0) {
            writeWaveformCache(item.id, peaks);
            setWaveformBars(peaks);
          }
        }
      } catch {
        // keep deterministic waveform
      }
    };

    void loadWaveform();
    return () => {
      active = false;
    };
  }, [item, isAudio, isVisible]);

  // Spreadsheet grid loader: parses CSV or Excel into mini matrix when in viewport
  useEffect(() => {
    if (!isSpreadsheet || !isVisible) return;
    const cached = readSpreadsheetCache(item.id);
    if (cached && cached.length > 0) {
      setSpreadsheetRows(cached);
      return;
    }
    if (item.textContent) {
      const parsed = parseDelimitedText(item.textContent, 5, 4);
      if (parsed.length > 0) {
        writeSpreadsheetCache(item.id, parsed);
        setSpreadsheetRows(parsed);
        return;
      }
    }

    let active = true;
    const loadSpreadsheet = async () => {
      try {
        let blob = item.rawFile;
        if (!blob && item.dataUrl?.startsWith('blob:')) {
          try {
            const res = await fetch(item.dataUrl);
            blob = await res.blob();
          } catch {
            // dead blob URL fallback
          }
        }
        if (!blob) {
          blob = await dbService.fetchLibraryFileBlob(item);
        }
        if (!active || !blob) return;

        const lowerName = item.name.toLowerCase();
        let rows: string[][] = [];
        if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || item.type.includes('csv')) {
          const text = await blob.slice(0, 4096).text();
          rows = parseDelimitedText(text, 5, 4);
        } else {
          rows = await parseExcelBlob(blob, 5, 4);
        }

        if (active && rows.length > 0) {
          writeSpreadsheetCache(item.id, rows);
          setSpreadsheetRows(rows);
        }
      } catch {
        // keep fallback
      }
    };

    void loadSpreadsheet();
    return () => {
      active = false;
    };
  }, [item, isSpreadsheet, isVisible]);

  const ext = item.name.includes('.') ? item.name.slice(item.name.lastIndexOf('.') + 1).toUpperCase() : '';

  const sizeContainerClasses =
    size === 'sm'
      ? 'w-10 h-10 rounded-lg text-xs'
      : size === 'md'
        ? 'w-16 h-16 rounded-xl text-sm'
        : size === 'lg'
          ? 'w-full h-40 rounded-t-2xl text-base'
          : 'w-full h-full text-base';

  if (isImage && blobUrl && !hasError) {
    const imgSizeClasses =
      size === 'sm'
        ? 'w-10 h-10 rounded-lg'
        : size === 'md'
          ? 'w-16 h-16 rounded-xl'
          : size === 'lg'
            ? 'w-full h-40 rounded-t-2xl'
            : 'w-full h-full';

    const containerClassName = className.replace(/\bobject-(contain|cover|fill|none|scale-down)\b/g, '').trim();

    if (isSvg && size !== 'sm') {
      return (
        <div
          className={`relative ${imgSizeClasses} overflow-hidden border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-tertiary)] flex-shrink-0 flex items-center justify-center p-2.5 ${containerClassName}`}
        >
          <img
            src={blobUrl}
            alt={item.name}
            onError={handleImageError}
            className="w-full h-full object-contain pointer-events-none"
            loading="lazy"
          />
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-emerald-600/80 backdrop-blur-xs flex items-center gap-1 pointer-events-none text-white text-[10px] font-bold tracking-wider shadow-xs">
            SVG
          </div>
        </div>
      );
    }

    return (
      <img
        src={blobUrl}
        alt={item.name}
        onError={handleImageError}
        className={`${imgSizeClasses} object-cover border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-tertiary)] flex-shrink-0 ${className}`}
        loading="lazy"
      />
    );
  }

  if (youtubeVideoId && !youtubeError) {
    const ytSizeClasses =
      size === 'sm'
        ? 'w-10 h-10 rounded-lg'
        : size === 'md'
          ? 'w-16 h-16 rounded-xl'
          : size === 'lg'
            ? 'w-full h-40 rounded-t-2xl'
            : 'w-full h-full';

    const containerClassName = className.replace(/\bobject-(contain|cover|fill|none|scale-down)\b/g, '').trim();
    const thumbnailUrl =
      size === 'sm'
        ? `https://img.youtube.com/vi/${youtubeVideoId}/mqdefault.jpg`
        : `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;

    return (
      <div
        ref={containerRef}
        data-thumbnail-kind="youtube"
        className={`relative ${ytSizeClasses} overflow-hidden bg-black flex-shrink-0 flex items-center justify-center border border-[var(--theme-border-secondary)] ${containerClassName}`}
      >
        <img
          src={thumbnailUrl}
          alt={item.name}
          onError={() => setYoutubeError(true)}
          className={`w-full h-full object-cover pointer-events-none ${className}`}
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
          <div
            className={`flex items-center justify-center rounded-full bg-red-600 text-white shadow-md transition-transform group-hover:scale-110 duration-200 ${
              size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-6 h-6' : 'w-10 h-10'
            }`}
          >
            <Play size={size === 'sm' ? 8 : size === 'md' ? 12 : 20} fill="currentColor" className="ml-0.5" />
          </div>
        </div>
        {size !== 'sm' && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-red-600/85 backdrop-blur-xs flex items-center gap-1 pointer-events-none text-white text-[10px] font-bold tracking-wider shadow-xs">
            YOUTUBE
          </div>
        )}
      </div>
    );
  }

  if (isVideo && blobUrl && !hasError) {
    const videoSizeClasses =
      size === 'sm'
        ? 'w-10 h-10 rounded-lg'
        : size === 'md'
          ? 'w-16 h-16 rounded-xl'
          : size === 'lg'
            ? 'w-full h-40 rounded-t-2xl'
            : 'w-full h-full';

    const containerClassName = className.replace(/\bobject-(contain|cover|fill|none|scale-down)\b/g, '').trim();

    if (videoPoster) {
      return (
        <div
          ref={containerRef}
          className={`relative ${videoSizeClasses} overflow-hidden bg-black/90 flex-shrink-0 flex items-center justify-center border border-[var(--theme-border-secondary)] ${containerClassName}`}
        >
          <img
            src={videoPoster}
            alt={item.name}
            className={`w-full h-full object-cover pointer-events-none ${className}`}
            loading="lazy"
          />
          <div
            className={`absolute ${
              size === 'sm' ? 'bottom-0.5 left-0.5 p-0.5' : 'bottom-2 left-2 px-1.5 py-0.5'
            } rounded bg-black/60 backdrop-blur-xs flex items-center gap-1 pointer-events-none text-white shadow-xs`}
          >
            <Video size={size === 'sm' ? 9 : 12} strokeWidth={2} />
          </div>
        </div>
      );
    }

    if (size === 'sm') {
      return (
        <div
          ref={containerRef}
          className={`relative ${videoSizeClasses} overflow-hidden bg-black/80 flex-shrink-0 flex items-center justify-center border border-[var(--theme-border-secondary)] ${containerClassName}`}
        >
          <Video size={16} className="text-white/80" />
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className={`relative ${videoSizeClasses} overflow-hidden bg-black/90 flex-shrink-0 flex items-center justify-center border border-[var(--theme-border-secondary)] ${containerClassName}`}
      >
        <video
          src={blobUrl.includes('#') ? blobUrl : `${blobUrl}#t=0.1`}
          onError={handleVideoError}
          onLoadedData={(e) => {
            const video = e.currentTarget;
            try {
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                const canvas = document.createElement('canvas');
                canvas.width = Math.min(video.videoWidth, 320);
                canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                  writeThumbnailBlobCache(`poster:${item.id}`, dataUrl);
                  setVideoPoster(dataUrl);
                }
              }
            } catch {
              // ignore
            }
          }}
          onLoadedMetadata={(e) => {
            try {
              const dur = e.currentTarget.duration;
              e.currentTarget.currentTime = dur && dur > 0 ? Math.min(0.1, dur) : 0.1;
            } catch {
              // ignore
            }
          }}
          className={`w-full h-full object-cover pointer-events-none ${className}`}
          muted
          playsInline
          preload="metadata"
          aria-label={item.name}
        />
        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs flex items-center gap-1 pointer-events-none text-white shadow-xs">
          <Video size={12} strokeWidth={2} />
        </div>
      </div>
    );
  }

  if (isPdf && (cachedPdfImage || (blobUrl && isVisible && !hasError))) {
    const pdfSizeClasses =
      size === 'sm'
        ? 'w-10 h-10 rounded-lg'
        : size === 'md'
          ? 'w-16 h-16 rounded-xl'
          : size === 'lg'
            ? 'w-full h-40 rounded-t-2xl'
            : 'w-full h-full';

    const containerClassName = className.replace(/\bobject-(contain|cover|fill|none|scale-down)\b/g, '').trim();
    const objectFitClass = className.match(/\bobject-(contain|cover|fill|none|scale-down)\b/)?.[0] ?? 'object-cover';

    const innerFallback = (
      <div className="w-full h-full flex flex-col items-center justify-center bg-red-500/10 text-red-500 font-semibold">
        <span className="text-[10px] font-bold tracking-wider leading-none">PDF</span>
      </div>
    );

    return (
      <div
        className={`relative ${pdfSizeClasses} overflow-hidden bg-white dark:bg-[var(--theme-bg-secondary)] flex-shrink-0 flex items-center justify-center border border-[var(--theme-border-secondary)] ${containerClassName}`}
      >
        {cachedPdfImage ? (
          <img src={cachedPdfImage} alt={item.name} className={`w-full h-full ${objectFitClass}`} />
        ) : (
          <Suspense fallback={innerFallback}>
            <LazyPdfFileThumbnail
              file={{ ...item, dataUrl: blobUrl ?? undefined }}
              fallback={innerFallback}
              width={pdfWidth}
              className={className}
            />
          </Suspense>
        )}
        {size !== 'sm' && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-red-600/80 backdrop-blur-xs flex items-center gap-1 pointer-events-none text-white text-[10px] font-bold tracking-wider shadow-xs">
            PDF
          </div>
        )}
      </div>
    );
  }

  if (isTextCandidate && textLines.length > 0) {
    const textSnippetSizeClasses =
      size === 'sm'
        ? 'w-10 h-10 rounded-lg'
        : size === 'md'
          ? 'w-16 h-16 rounded-xl'
          : size === 'lg'
            ? 'w-full h-40 rounded-t-2xl'
            : 'w-full h-full';

    const containerClassName = className.replace(/\bobject-(contain|cover|fill|none|scale-down)\b/g, '').trim();
    const displayExt = ext || (item.name.startsWith('.') ? item.name.slice(1).toUpperCase() : 'TXT');

    if (size === 'full' || size === 'lg') {
      return (
        <div
          className={`relative ${textSnippetSizeClasses} overflow-hidden bg-[#181825] text-[#cdd6f4] flex-shrink-0 flex flex-col border border-[var(--theme-border-secondary)] font-mono select-none ${containerClassName}`}
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#11111b] border-b border-white/5 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <FileCode size={12} className="text-white/40 shrink-0" />
              <span className="text-[10px] text-white/70 font-sans font-medium truncate max-w-[150px]">
                {item.name}
              </span>
            </div>
            <span className="font-semibold tracking-wider text-[9px] text-white/50 uppercase shrink-0">
              {displayExt}
            </span>
          </div>

          <div className="p-2.5 sm:p-3 flex-1 overflow-hidden flex flex-col justify-start gap-1 font-mono text-[10px] leading-[1.55]">
            {textLines.map((line, idx) => (
              <div key={idx} className="flex items-start gap-2 min-w-0">
                <span className="text-white/20 select-none text-[9px] w-3 text-right shrink-0 pt-0.5">{idx + 1}</span>
                <span className="truncate flex-1 text-white/85 font-mono">
                  {renderHighlightedCodeLine(line, displayExt)}
                </span>
              </div>
            ))}
          </div>

          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs flex items-center gap-1 pointer-events-none text-white/90 text-[10px] font-bold tracking-wider shadow-xs uppercase">
            {displayExt}
          </div>
        </div>
      );
    }

    if (size === 'md') {
      return (
        <div
          className={`relative ${textSnippetSizeClasses} overflow-hidden bg-[#181825] text-[#cdd6f4] flex-shrink-0 flex flex-col justify-between p-2 border border-[var(--theme-border-secondary)] font-mono select-none ${containerClassName}`}
        >
          <div className="flex flex-col gap-0.5 overflow-hidden text-[8px] leading-[1.3] text-white/70">
            {textLines.slice(0, 3).map((line, idx) => (
              <div key={idx} className="truncate">
                {line.trim() || ' '}
              </div>
            ))}
          </div>
          <span className="text-[9px] font-bold text-[#89dceb] tracking-wider uppercase">{displayExt.slice(0, 4)}</span>
        </div>
      );
    }

    if (size === 'sm') {
      return (
        <div className="w-10 h-10 rounded-lg flex flex-col items-center justify-center bg-[#181825] text-[#89dceb] border border-[var(--theme-border-secondary)] font-semibold flex-shrink-0 font-mono shadow-xs">
          {displayExt && displayExt.length <= 4 ? (
            <span className="text-[10px] font-bold tracking-wider leading-none text-[#89dceb] uppercase font-mono">
              {displayExt}
            </span>
          ) : (
            <FileCode size={18} strokeWidth={2} className="text-[#89b4fa]" />
          )}
        </div>
      );
    }
  }

  if (fileType === 'pdf') {
    return (
      <div
        ref={containerRef}
        className={`${sizeContainerClasses} flex flex-col items-center justify-center bg-red-500/10 text-red-500 border border-red-500/20 font-semibold flex-shrink-0 ${className}`}
      >
        <span className="text-[10px] font-bold tracking-wider leading-none">PDF</span>
      </div>
    );
  }

  if (isSpreadsheet) {
    const spreadsheetSizeClasses =
      size === 'sm'
        ? 'w-10 h-10 rounded-lg'
        : size === 'md'
          ? 'w-16 h-16 rounded-xl'
          : size === 'lg'
            ? 'w-full h-40 rounded-t-2xl'
            : 'w-full h-full';

    const containerClassName = className.replace(/\bobject-(contain|cover|fill|none|scale-down)\b/g, '').trim();
    const displayExt = ext || 'XLSX';

    const numCols = 4;
    const colLabels = ['A', 'B', 'C', 'D'];
    const rowsToDisplay =
      spreadsheetRows.length > 0
        ? spreadsheetRows.slice(0, 5)
        : [
            ['Item', 'Qty', 'Price', 'Status'],
            ['Alpha', '12', '$240', 'Active'],
            ['Beta', '4', '$85', 'Pending'],
            ['Gamma', '89', '$1,290', 'Done'],
          ];

    if (size === 'full' || size === 'lg') {
      return (
        <div
          ref={containerRef}
          className={`relative ${spreadsheetSizeClasses} overflow-hidden bg-[#071911] text-[#a7f3d0] flex-shrink-0 flex flex-col border border-[var(--theme-border-secondary)] font-mono select-none ${containerClassName}`}
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#04120c] border-b border-emerald-500/20 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Table size={12} className="text-emerald-400 shrink-0" />
              <span className="text-[10px] text-emerald-200/90 font-sans font-medium truncate max-w-[150px]">
                {item.name}
              </span>
            </div>
            <span className="font-semibold tracking-wider text-[9px] text-emerald-400/80 uppercase shrink-0">
              {displayExt}
            </span>
          </div>

          <div className="p-2 flex-1 overflow-hidden flex flex-col relative font-mono text-[9px]">
            <div className="grid grid-cols-5 gap-0.5 mb-0.5">
              <div className="text-center py-0.5 text-[8px] text-emerald-500/50 bg-emerald-950/70 rounded-xs font-bold">
                #
              </div>
              {colLabels.slice(0, numCols).map((col) => (
                <div
                  key={col}
                  className="text-center py-0.5 text-[8px] text-emerald-300 font-bold bg-emerald-950/70 rounded-xs uppercase"
                >
                  {col}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
              {rowsToDisplay.map((row, rIdx) => (
                <div key={rIdx} className="grid grid-cols-5 gap-0.5 items-center">
                  <div className="text-center py-0.5 text-[8px] text-emerald-500/40 bg-emerald-950/30 rounded-xs select-none">
                    {rIdx + 1}
                  </div>
                  {Array.from({ length: numCols }).map((_, cIdx) => {
                    const val = row[cIdx] !== undefined ? String(row[cIdx]) : '';
                    return (
                      <div
                        key={cIdx}
                        className={`truncate px-1 py-0.5 text-[8.5px] rounded-xs ${
                          rIdx === 0 && spreadsheetRows.length > 0
                            ? 'font-bold text-emerald-200 bg-emerald-900/40'
                            : 'text-emerald-100/80 bg-emerald-950/20'
                        }`}
                      >
                        {val || '\u00A0'}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#071911] to-transparent pointer-events-none" />
          </div>

          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-emerald-800/80 backdrop-blur-xs flex items-center gap-1 pointer-events-none text-white text-[10px] font-bold tracking-wider shadow-xs uppercase">
            {displayExt}
          </div>
        </div>
      );
    }

    if (size === 'md') {
      return (
        <div
          ref={containerRef}
          className={`relative ${spreadsheetSizeClasses} overflow-hidden bg-[#071911] text-[#a7f3d0] flex-shrink-0 flex flex-col justify-between p-2 border border-emerald-500/30 font-mono select-none ${containerClassName}`}
        >
          <div className="flex flex-col gap-1 overflow-hidden text-[7px] leading-tight">
            {rowsToDisplay.slice(0, 3).map((row, idx) => (
              <div key={idx} className="flex gap-1 truncate text-emerald-200/80">
                <span className="w-2.5 text-emerald-500/50">{idx + 1}</span>
                <span className="truncate">{row.filter(Boolean).slice(0, 2).join(' · ') || '...'}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20">
            <Table size={10} className="text-emerald-400" />
            <span className="text-[9px] font-bold text-emerald-400 tracking-wider uppercase">
              {displayExt.slice(0, 4)}
            </span>
          </div>
        </div>
      );
    }

    if (size === 'sm') {
      return (
        <div
          ref={containerRef}
          className="w-10 h-10 rounded-lg flex flex-col items-center justify-center bg-[#071911] text-emerald-400 border border-emerald-500/30 font-semibold flex-shrink-0 font-mono shadow-xs"
        >
          {displayExt && displayExt.length <= 4 ? (
            <span className="text-[10px] font-bold tracking-wider leading-none text-emerald-400 uppercase font-mono">
              {displayExt}
            </span>
          ) : (
            <FileSpreadsheet size={18} strokeWidth={2} className="text-emerald-400" />
          )}
        </div>
      );
    }
  }

  if (fileType === 'presentation') {
    return (
      <div
        ref={containerRef}
        className={`${sizeContainerClasses} flex flex-col items-center justify-center bg-amber-500/10 text-amber-600 border border-amber-500/20 font-semibold flex-shrink-0 ${className}`}
      >
        <Presentation size={size === 'sm' ? 18 : 26} strokeWidth={2} />
      </div>
    );
  }

  if (isVideo) {
    return (
      <div
        ref={containerRef}
        className={`${sizeContainerClasses} flex flex-col items-center justify-center bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 font-semibold flex-shrink-0 ${className}`}
      >
        <Video size={size === 'sm' ? 18 : 26} strokeWidth={2} />
      </div>
    );
  }

  if (isAudio) {
    const audioSizeClasses =
      size === 'sm'
        ? 'w-10 h-10 rounded-lg'
        : size === 'md'
          ? 'w-16 h-16 rounded-xl'
          : size === 'lg'
            ? 'w-full h-40 rounded-t-2xl'
            : 'w-full h-full';

    const containerClassName = className.replace(/\bobject-(contain|cover|fill|none|scale-down)\b/g, '').trim();
    const displayExt = ext || 'AUDIO';
    const bars = waveformBars.length > 0 ? waveformBars : generateWaveform(`${item.id}:${item.name}`);

    if (size === 'full' || size === 'lg') {
      return (
        <div
          ref={containerRef}
          className={`relative ${audioSizeClasses} overflow-hidden bg-neutral-50/90 dark:bg-neutral-900/80 text-[var(--theme-text-primary)] flex-shrink-0 flex flex-col justify-center items-center border border-[var(--theme-border-secondary)] select-none transition-colors duration-200 group/audio ${containerClassName}`}
        >
          <div className="absolute top-2.5 right-2.5 z-10">
            <span className="font-mono text-[9px] font-semibold tracking-wider px-2 py-0.5 rounded-md uppercase bg-neutral-200/70 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-400 border border-neutral-300/50 dark:border-neutral-700/50 shadow-xs pointer-events-none">
              {displayExt}
            </span>
          </div>

          <span className="sr-only">{item.name}</span>

          <div className="relative w-full h-full flex flex-col items-center justify-center px-6 py-4">
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-px bg-neutral-200/80 dark:bg-neutral-800 pointer-events-none" />

            <div className="flex items-center justify-center gap-[3px] h-20 w-full max-w-[260px] px-2 overflow-hidden z-10">
              {bars.slice(0, 36).map((height, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-neutral-400/80 dark:bg-neutral-500/80 group-hover/audio:bg-neutral-800 dark:group-hover/audio:bg-neutral-200 transition-all duration-200 shrink-0"
                  style={{
                    height: `${Math.max(12, Math.round(height * 100))}%`,
                    minHeight: '6px',
                  }}
                />
              ))}
            </div>

            <div className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-neutral-900/85 dark:bg-white/90 text-white dark:text-neutral-900 shadow-md flex items-center justify-center opacity-0 group-hover/audio:opacity-100 group-hover/audio:scale-100 scale-90 transition-all duration-200 pointer-events-none z-20 backdrop-blur-xs">
              <Play size={15} fill="currentColor" className="ml-0.5" />
            </div>
          </div>
        </div>
      );
    }

    if (size === 'md') {
      return (
        <div
          ref={containerRef}
          className={`relative ${audioSizeClasses} overflow-hidden bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 flex-shrink-0 flex flex-col justify-between p-2 border border-neutral-200 dark:border-neutral-800 select-none ${containerClassName}`}
        >
          <div className="flex items-center justify-center pt-0.5">
            <Music size={14} className="text-neutral-600 dark:text-neutral-400" />
          </div>
          <div className="flex items-center justify-center gap-[2px] h-5 w-full overflow-hidden">
            {bars.slice(0, 10).map((height, i) => (
              <span
                key={i}
                className="w-[2px] rounded-full bg-neutral-400 dark:bg-neutral-500"
                style={{ height: `${Math.max(20, Math.round(height * 100))}%` }}
              />
            ))}
          </div>
          <div className="flex justify-center">
            <span className="text-[8px] font-mono font-semibold text-neutral-500 dark:text-neutral-400 tracking-wider uppercase">
              {displayExt.slice(0, 4)}
            </span>
          </div>
        </div>
      );
    }

    if (size === 'sm') {
      return (
        <div
          ref={containerRef}
          className="w-10 h-10 rounded-lg flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800 shadow-xs flex-shrink-0"
        >
          <div className="flex items-end justify-center gap-[2px] h-4">
            <span className="w-[2.5px] h-2.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
            <span className="w-[2.5px] h-4 rounded-full bg-neutral-700 dark:bg-neutral-300" />
            <span className="w-[2.5px] h-3 rounded-full bg-neutral-500 dark:bg-neutral-400" />
            <span className="w-[2.5px] h-1.5 rounded-full bg-neutral-400/80 dark:bg-neutral-600" />
          </div>
        </div>
      );
    }
  }

  if (isImage) {
    return (
      <div
        ref={containerRef}
        className={`${sizeContainerClasses} flex flex-col items-center justify-center bg-blue-500/10 text-blue-500 border border-blue-500/20 font-semibold flex-shrink-0 ${className}`}
      >
        <ImageIcon size={size === 'sm' ? 18 : 26} strokeWidth={2} />
      </div>
    );
  }

  const { Icon: FallbackIcon, colorClass, bgClass } = getFileDisplayMeta({ name: item.name, type: item.type });
  const isYoutubeCategory = Boolean(youtubeVideoId) || item.type === 'video/youtube-link';

  return (
    <div
      ref={containerRef}
      className={`${sizeContainerClasses} flex flex-col items-center justify-center ${bgClass} ${colorClass} border border-current/20 font-semibold flex-shrink-0 ${className}`}
    >
      {!isYoutubeCategory && ext && ext.length <= 4 ? (
        <span className="text-[10px] font-bold tracking-wider leading-none uppercase">{ext}</span>
      ) : (
        <FallbackIcon size={size === 'sm' ? 18 : 26} strokeWidth={2} />
      )}
    </div>
  );
};

export const LibraryItemThumbnail = React.memo<LibraryItemThumbnailProps>(
  LibraryItemThumbnailComponent,
  (prev, next) =>
    prev.size === next.size &&
    prev.className === next.className &&
    prev.item.id === next.item.id &&
    prev.item.name === next.item.name &&
    prev.item.type === next.item.type &&
    prev.item.size === next.item.size &&
    prev.item.dataUrl === next.item.dataUrl &&
    prev.item.fileUri === next.item.fileUri &&
    prev.item.rawFile === next.item.rawFile &&
    prev.item.sessionId === next.item.sessionId &&
    prev.item.textContent === next.item.textContent,
);
