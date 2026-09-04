import {
  SUPPORTED_ARCHIVE_MIME_TYPES,
  SUPPORTED_AUDIO_MIME_TYPES,
  SUPPORTED_DOC_MIME_TYPES,
  SUPPORTED_IMAGE_MIME_TYPES,
  SUPPORTED_PDF_MIME_TYPES,
  SUPPORTED_PRESENTATION_MIME_TYPES,
  SUPPORTED_SPREADSHEET_MIME_TYPES,
  SUPPORTED_TEXT_MIME_TYPES,
  SUPPORTED_VIDEO_MIME_TYPES,
  TEXT_BASED_EXTENSIONS,
} from '@/constants/fileTypeSupport';

export type FileCategory =
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'youtube'
  | 'text'
  | 'spreadsheet'
  | 'doc'
  | 'presentation'
  | 'archive'
  | 'error';

interface FileKindInput {
  name?: string;
  type?: string;
  error?: string | null;
}

type FileTypeInput = Pick<FileKindInput, 'name' | 'type'>;

interface FileKindFlags {
  category: FileCategory;
  isImage: boolean;
  isAudio: boolean;
  isVideo: boolean;
  isYoutube: boolean;
  isPdf: boolean;
  isInlineData: boolean;
  isTextFallback: boolean;
}

const normalizeMimeType = (mimeType?: string): string => (mimeType || '').trim().toLowerCase();

const normalizeFileName = (name?: string): string => (name || '').trim().toLowerCase();

const FILE_EXTENSION_PATTERN = /^\.[a-z0-9]{1,16}$/;

const getFileExtension = (filename?: string): string => {
  const name = normalizeFileName(filename);
  const lastDotIndex = name.lastIndexOf('.');
  if (lastDotIndex <= 0) return '';

  const extension = name.slice(lastDotIndex);
  // Version numbers in titles (e.g. "Gemini 3.8 Flash 专项核验") contain dots
  // but are not suffixes. Only compact alphanumeric tails count as extensions.
  return FILE_EXTENSION_PATTERN.test(extension) ? extension : '';
};

const isYoutubeMimeType = (mimeType?: string): boolean => normalizeMimeType(mimeType) === 'video/youtube-link';

export const isImageMimeType = (mimeType?: string): boolean => {
  const normalized = normalizeMimeType(mimeType);
  return normalized.startsWith('image/') || SUPPORTED_IMAGE_MIME_TYPES.includes(normalized);
};

export const isAudioMimeType = (mimeType?: string): boolean => {
  const normalized = normalizeMimeType(mimeType);
  return normalized.startsWith('audio/') || SUPPORTED_AUDIO_MIME_TYPES.includes(normalized);
};

const isSupportedInlineAudioMimeType = (mimeType?: string): boolean =>
  SUPPORTED_AUDIO_MIME_TYPES.includes(normalizeMimeType(mimeType));

export const isVideoMimeType = (mimeType?: string): boolean => {
  const normalized = normalizeMimeType(mimeType);
  return (
    !isYoutubeMimeType(normalized) &&
    (normalized.startsWith('video/') || SUPPORTED_VIDEO_MIME_TYPES.includes(normalized))
  );
};

export const isPdfMimeType = (mimeType?: string): boolean =>
  SUPPORTED_PDF_MIME_TYPES.includes(normalizeMimeType(mimeType));

const isPdfFile = (file: FileKindInput): boolean =>
  isPdfMimeType(file.type) || normalizeFileName(file.name).endsWith('.pdf');

const isKnownNonTextMimeType = (mimeType?: string): boolean => {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) return false;
  return (
    isImageMimeType(normalized) ||
    isAudioMimeType(normalized) ||
    isVideoMimeType(normalized) ||
    isPdfMimeType(normalized) ||
    SUPPORTED_DOC_MIME_TYPES.includes(normalized) ||
    SUPPORTED_PRESENTATION_MIME_TYPES.includes(normalized) ||
    SUPPORTED_ARCHIVE_MIME_TYPES.includes(normalized) ||
    (SUPPORTED_SPREADSHEET_MIME_TYPES.includes(normalized) && normalized !== 'text/csv')
  );
};

export const isTextFile = (file: FileTypeInput): boolean => {
  const fileExtension = getFileExtension(file.name);
  const mimeType = normalizeMimeType(file.type);
  if (SUPPORTED_TEXT_MIME_TYPES.includes(mimeType) || TEXT_BASED_EXTENSIONS.includes(fileExtension)) {
    return true;
  }
  // Browsers often omit a MIME type (or send octet-stream) for names like
  // Dockerfile / LICENSE / Makefile. Treat those as text unless the OS already
  // labelled a real media/document type.
  return !fileExtension && !isKnownNonTextMimeType(mimeType);
};

export const isMarkdownFile = (file: FileTypeInput): boolean => {
  const fileExtension = getFileExtension(file.name);
  return normalizeMimeType(file.type) === 'text/markdown' || fileExtension === '.md' || fileExtension === '.markdown';
};

const isInlineDataMimeType = (mimeType?: string): boolean =>
  isImageMimeType(mimeType) ||
  isSupportedInlineAudioMimeType(mimeType) ||
  isVideoMimeType(mimeType) ||
  isPdfMimeType(mimeType);

export const getFileTypeCategory = (mimeType: string, error?: string): FileCategory => {
  const normalized = normalizeMimeType(mimeType);

  if (error) return 'error';
  if (isYoutubeMimeType(normalized)) return 'youtube';
  if (isAudioMimeType(normalized)) return 'audio';
  if (isVideoMimeType(normalized)) return 'video';
  if (isPdfMimeType(normalized)) return 'pdf';
  if (isImageMimeType(normalized)) return 'image';
  if (
    SUPPORTED_SPREADSHEET_MIME_TYPES.includes(normalized) ||
    normalized === 'text/csv' ||
    normalized === 'application/vnd.ms-excel'
  )
    return 'spreadsheet';

  if (SUPPORTED_DOC_MIME_TYPES.includes(normalized)) return 'doc';
  if (SUPPORTED_PRESENTATION_MIME_TYPES.includes(normalized)) return 'presentation';
  if (SUPPORTED_ARCHIVE_MIME_TYPES.includes(normalized)) return 'archive';

  return 'text';
};

export const getFileKindFlags = (file: FileKindInput): FileKindFlags => {
  const category = getFileTypeCategory(file.type || '', file.error || undefined);
  const isPdf = category === 'pdf' || isPdfFile(file);
  const isYoutube = category === 'youtube';
  const isVideo = category === 'video';
  const isAudio = category === 'audio';
  const isImage = category === 'image';

  return {
    category,
    isImage,
    isAudio,
    isVideo,
    isYoutube,
    isPdf,
    isInlineData: isInlineDataMimeType(file.type),
    isTextFallback: !isImage && !isPdf && !isVideo && !isYoutube && !isAudio,
  };
};
