import type { SavedChatSession, UploadedFile, LibraryItem, LibraryFilterState, LibraryFileTypeFilter } from '@/types';
import { getFileKindFlags } from '@/utils/file/fileTypeClassification';
import { fileToBlobUrl } from '@/utils/file/filePreviewUrls';
import { EXTENSION_TO_MIME, MIME_TO_EXTENSION_MAP } from '@/constants/fileTypeSupport';
import { generateUniqueId } from '@/utils/chat/ids';

export const getLibraryFileType = (type: string, name: string): LibraryFileTypeFilter => {
  const flags = getFileKindFlags({ type, name });
  if (flags.isImage) return 'image';
  if (flags.isAudio) return 'audio';
  if (flags.isVideo || flags.isYoutube) return 'video';
  if (flags.isPdf) return 'pdf';
  if (flags.category === 'spreadsheet') return 'spreadsheet';
  if (flags.category === 'presentation') return 'presentation';
  return 'document';
};

export const isImageFileType = (type: string, name: string): boolean => {
  return getFileKindFlags({ type, name }).isImage;
};

export const isVideoFileType = (type: string, name: string): boolean => {
  const flags = getFileKindFlags({ type, name });
  return flags.isVideo || flags.isYoutube;
};

export const isAudioFileType = (type: string, name: string): boolean => {
  return getFileKindFlags({ type, name }).isAudio;
};

export const isDocumentFileType = (type: string, name: string): boolean => {
  return !isImageFileType(type, name) && !isAudioFileType(type, name) && !isVideoFileType(type, name);
};

const resolveLibraryDateLocale = (language: string): string => {
  const prefix = language.split('-')[0].toLowerCase();
  const map: Record<string, string> = {
    zh: 'zh-CN',
    ja: 'ja-JP',
    ko: 'ko-KR',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
  };
  return map[prefix] ?? 'en-US';
};

export const formatLibraryDate = (timestamp: number, language: string = 'zh'): string => {
  if (!timestamp || isNaN(timestamp)) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const locale = resolveLibraryDateLocale(language);

  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();

  if (isToday) {
    const formatted = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'day');
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    const formatted = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day');
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  // Within past 7 days: Day of week
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
  }

  const isCurrentYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(
    locale,
    isCurrentYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' },
  ).format(date);
};

export const extractLibraryItemsFromSessions = (sessions: SavedChatSession[]): LibraryItem[] => {
  const itemMap = new Map<string, LibraryItem>();

  for (const session of sessions) {
    if (!session.messages) continue;

    for (const message of session.messages) {
      if (!message.files || message.files.length === 0) continue;

      const messageTimestamp =
        message.timestamp instanceof Date
          ? message.timestamp.getTime()
          : typeof message.timestamp === 'number'
            ? message.timestamp
            : session.timestamp;

      for (const file of message.files) {
        if (!file.id || !file.name) continue;

        // If not already in map, or this instance is newer
        const existing = itemMap.get(file.id);
        if (!existing || (messageTimestamp && messageTimestamp > existing.timestamp)) {
          itemMap.set(file.id, {
            id: file.id,
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size || (file.rawFile instanceof Blob ? file.rawFile.size : 0),
            timestamp: messageTimestamp || session.timestamp || Date.now(),
            sessionId: session.id,
            sessionTitle: session.title,
            messageId: message.id,
            rawFile: file.rawFile,
            dataUrl: file.dataUrl,
            textContent: file.textContent,
            source: message.role === 'model' ? 'generated' : 'uploaded',
            isStandalone: false,
            fileUri: file.fileUri,
            fileApiName: file.fileApiName,
            fileApiExpirationTime: file.fileApiExpirationTime,
            fileApiKeyFingerprint: file.fileApiKeyFingerprint,
            transferStrategy: file.transferStrategy,
            uploadState: file.uploadState,
          });
        }
      }
    }
  }

  return Array.from(itemMap.values());
};

// Build precomputed MIME-to-extensions lookup
const MIME_TO_ALL_EXTENSIONS: Map<string, Set<string>> = new Map();

for (const [ext, mime] of Object.entries(EXTENSION_TO_MIME)) {
  const normMime = mime.toLowerCase();
  const cleanExt = ext.replace(/^\./, '').toLowerCase();
  let set = MIME_TO_ALL_EXTENSIONS.get(normMime);
  if (!set) {
    set = new Set();
    MIME_TO_ALL_EXTENSIONS.set(normMime, set);
  }
  set.add(cleanExt);
}

for (const [mime, ext] of Object.entries(MIME_TO_EXTENSION_MAP)) {
  const normMime = mime.toLowerCase();
  const cleanExt = ext.replace(/^\./, '').toLowerCase();
  let set = MIME_TO_ALL_EXTENSIONS.get(normMime);
  if (!set) {
    set = new Set();
    MIME_TO_ALL_EXTENSIONS.set(normMime, set);
  }
  set.add(cleanExt);
}

const buildBidirectionalExtensionAliases = (raw: Record<string, string[]>): Record<string, string[]> => {
  const result: Record<string, Set<string>> = {};
  for (const [key, aliases] of Object.entries(raw)) {
    const normKey = key.toLowerCase();
    if (!result[normKey]) result[normKey] = new Set();
    for (const alias of aliases) {
      const normAlias = alias.toLowerCase();
      result[normKey].add(normAlias);
      if (!result[normAlias]) result[normAlias] = new Set();
      result[normAlias].add(normKey);
    }
  }
  const finalized: Record<string, string[]> = {};
  for (const [key, set] of Object.entries(result)) {
    finalized[key] = Array.from(set);
  }
  return finalized;
};

// Common extension aliases / family mappings (bidirectional)
const EXTENSION_ALIASES: Record<string, string[]> = buildBidirectionalExtensionAliases({
  jpg: ['jpeg'],
  tif: ['tiff'],
  yml: ['yaml'],
  htm: ['html'],
  md: ['markdown'],
  doc: ['docx'],
  xls: ['xlsx'],
  ppt: ['pptx'],
  js: ['jsx', 'mjs', 'cjs'],
  ts: ['tsx', 'mts', 'cts'],
});

/**
 * Extracts all relevant extensions associated with a library item (from its filename and MIME type).
 * Returns extensions in lowercase, without a leading dot.
 */
export const getItemExtensions = (name: string, type?: string): Set<string> => {
  const exts = new Set<string>();

  // 1. Extract extension from filename
  const nameLower = (name || '').trim().toLowerCase();
  const lastDot = nameLower.lastIndexOf('.');
  if (lastDot > 0 && lastDot < nameLower.length - 1) {
    const ext = nameLower.slice(lastDot + 1);
    if (/^[a-z0-9]{1,16}$/.test(ext)) {
      exts.add(ext);

      // Check compound extension (e.g., tar.gz)
      const secondLastDot = nameLower.lastIndexOf('.', lastDot - 1);
      if (secondLastDot > 0) {
        const compoundExt = nameLower.slice(secondLastDot + 1);
        if (/^[a-z0-9]+\.[a-z0-9]+$/.test(compoundExt)) {
          exts.add(compoundExt);
        }
      }
    }
  }

  // 2. Extract extensions from MIME type
  if (type) {
    const normMime = type.trim().toLowerCase().split(';')[0];
    const mapped = MIME_TO_ALL_EXTENSIONS.get(normMime);
    if (mapped) {
      mapped.forEach((e) => exts.add(e));
    }

    const slashIdx = normMime.indexOf('/');
    if (slashIdx !== -1) {
      const sub = normMime
        .slice(slashIdx + 1)
        .split('+')[0]
        .replace(/^x-/, '');
      if (/^[a-z0-9]{1,16}$/.test(sub)) {
        exts.add(sub);
      }
    }
  }

  // 3. Add aliases
  for (const ext of Array.from(exts)) {
    const aliases = EXTENSION_ALIASES[ext];
    if (aliases) {
      for (const alias of aliases) {
        exts.add(alias);
      }
    }
  }

  return exts;
};

/**
 * Checks if a library item matches a single search token.
 * Supports:
 * - Direct substring match on item.name or item.sessionTitle
 * - Explicit extension filter ("ext:pdf", "extension:pdf", "ext:.pdf")
 * - Dot-prefixed extension match (".pdf", ".png", ".tar.gz", ".p")
 * - Wildcard patterns ("*.pdf", "*pdf")
 * - Bare extension match ("pdf", "docx", "xlsx", etc.) against filename extensions or MIME types
 */
export const matchesLibrarySearchToken = (item: LibraryItem, token: string, itemExts: Set<string>): boolean => {
  const nameLower = (item.name || '').toLowerCase();
  const sessionTitleLower = (item.sessionTitle || '').toLowerCase();

  // Normalize wildcards: e.g. *.pdf -> .pdf, *pdf -> pdf
  let normalizedToken = token;
  if (normalizedToken.startsWith('*.')) {
    normalizedToken = normalizedToken.slice(1);
  } else if (normalizedToken.startsWith('*') && normalizedToken.length > 1) {
    normalizedToken = normalizedToken.slice(1);
  }

  // 1. Explicit extension filter: "ext:pdf", "extension:pdf", "ext:.pdf"
  if (normalizedToken.startsWith('ext:') || normalizedToken.startsWith('extension:')) {
    const targetExt = normalizedToken
      .replace(/^(ext|extension):/, '')
      .replace(/^\./, '')
      .toLowerCase();
    if (!targetExt) return true;
    for (const ext of itemExts) {
      if (ext === targetExt || ext.startsWith(targetExt)) return true;
    }
    return false;
  }

  // 2. Dot-prefixed query: ".pdf", ".png", ".tar.gz", ".p"
  if (normalizedToken.startsWith('.')) {
    const cleanToken = normalizedToken.slice(1);
    if (!cleanToken) return itemExts.size > 0;

    // Check if filename ends with or contains the dot string
    if (nameLower.endsWith(normalizedToken) || nameLower.includes(normalizedToken)) return true;
    if (sessionTitleLower.includes(normalizedToken)) return true;

    // Check extension matching (exact or prefix match, e.g. .pd -> .pdf)
    for (const ext of itemExts) {
      if (ext === cleanToken || ext.startsWith(cleanToken)) return true;
    }
    return false;
  }

  // 3. Normal token: match filename or sessionTitle substring
  if (nameLower.includes(normalizedToken) || sessionTitleLower.includes(normalizedToken)) {
    return true;
  }

  // 4. Extension / file format match
  if (itemExts.has(normalizedToken)) {
    return true;
  }

  return false;
};

export const filterAndSortLibraryItems = (items: LibraryItem[], filters: LibraryFilterState): LibraryItem[] => {
  let filtered = items;

  // Category filter
  if (filters.category === 'image') {
    filtered = filtered.filter((item) => isImageFileType(item.type, item.name));
  } else if (filters.category === 'document') {
    filtered = filtered.filter((item) => isDocumentFileType(item.type, item.name));
  } else if (filters.category === 'audio') {
    filtered = filtered.filter((item) => isAudioFileType(item.type, item.name));
  } else if (filters.category === 'video') {
    filtered = filtered.filter((item) => isVideoFileType(item.type, item.name));
  }

  // Source filter
  if (filters.source !== 'all') {
    filtered = filtered.filter((item) => item.source === filters.source);
  }

  // File type filter
  if (filters.fileType !== 'all') {
    filtered = filtered.filter((item) => getLibraryFileType(item.type, item.name) === filters.fileType);
  }

  // Search query filter (supports filename, session title, file extension, and multi-token queries)
  const rawSearch = filters.searchQuery.trim().toLowerCase();
  if (rawSearch) {
    const tokens = rawSearch.split(/\s+/).filter(Boolean);
    filtered = filtered.filter((item) => {
      const itemExts = getItemExtensions(item.name, item.type);
      return tokens.every((token) => matchesLibrarySearchToken(item, token, itemExts));
    });
  }

  // Sort
  const sorted = [...filtered];
  switch (filters.sort) {
    case 'date_asc':
      sorted.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      break;
    case 'name_asc':
      sorted.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }),
      );
      break;
    case 'name_desc':
      sorted.sort((a, b) =>
        (b.name || '').localeCompare(a.name || '', undefined, { numeric: true, sensitivity: 'base' }),
      );
      break;
    case 'size_desc':
      sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
      break;
    case 'size_asc':
      sorted.sort((a, b) => (a.size || 0) - (b.size || 0));
      break;
    case 'date_desc':
    default:
      sorted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      break;
  }

  return sorted;
};

export const libraryItemToUploadedFile = (item: LibraryItem): UploadedFile => {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    size: item.size,
    rawFile: item.rawFile,
    dataUrl: item.dataUrl,
    textContent: item.textContent,
    fileUri: item.fileUri,
    fileApiName: item.fileApiName,
    fileApiExpirationTime: item.fileApiExpirationTime,
    fileApiKeyFingerprint: item.fileApiKeyFingerprint,
    transferStrategy: item.transferStrategy,
    uploadState: item.uploadState,
  };
};

export interface ResolveLibraryItemOptions {
  generateNewId?: boolean;
}

export const resolveLibraryItemToUploadedFile = async (
  item: LibraryItem,
  fetchBlob?: (item: LibraryItem) => Promise<Blob | null | undefined>,
  options?: ResolveLibraryItemOptions,
): Promise<UploadedFile> => {
  let blob: Blob | undefined = item.rawFile;
  if (!blob && fetchBlob) {
    const fetched = await fetchBlob(item);
    if (fetched) {
      blob = fetched;
    }
  }
  if (!blob && item.textContent) {
    blob = new Blob([item.textContent], { type: item.type || 'text/plain' });
  }

  let dataUrl = item.dataUrl;
  // If generateNewId is requested (e.g. starting a new chat or importing into chat),
  // generate a fresh independent blob URL so it is never invalidated when other chats are cleaned up
  if (options?.generateNewId || (dataUrl?.startsWith('blob:') && !item.rawFile)) {
    dataUrl = undefined;
  }
  // Generate a valid blob URL for any resolved blob (PDF, images, audio, video, documents)
  if (!dataUrl && blob) {
    dataUrl = fileToBlobUrl(blob);
  } else if (!dataUrl && item.dataUrl && !item.dataUrl.startsWith('blob:')) {
    dataUrl = item.dataUrl;
  }

  const rawFile =
    blob instanceof File ? blob : blob ? new File([blob], item.name, { type: item.type || blob.type }) : undefined;

  const baseUploaded = libraryItemToUploadedFile(item);

  return {
    ...baseUploaded,
    id: options?.generateNewId ? generateUniqueId() : baseUploaded.id,
    rawFile,
    dataUrl,
    uploadState: baseUploaded.uploadState || 'active',
    isProcessing: false,
    progress: 100,
  };
};
