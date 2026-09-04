import {
  EXTENSION_TO_MIME,
  SUPPORTED_IMAGE_MIME_TYPES,
  SUPPORTED_PDF_MIME_TYPES,
  SUPPORTED_AUDIO_MIME_TYPES,
  SUPPORTED_VIDEO_MIME_TYPES,
  SUPPORTED_UPLOAD_MIME_TYPES,
} from '@/constants/fileTypeSupport';
import {
  type AppSettings,
  type ChatProviderId,
  type FilesApiConfig,
  type UploadedFile,
  GEMINI_PROVIDER_ID,
} from '@/types';
import { CODE_EXECUTION_TEXT_FILE_LIMIT_BYTES, isServerCodeExecutionMode } from '@/utils/codeExecution';
import { isTextFile } from '@/utils/file/fileTypeClassification';
import { getTranslator } from '@/i18n/translations';
import { interpolate } from '@/i18n/interpolate';

type Translator = ReturnType<typeof getTranslator>;

const INLINE_MAX_REQUEST_PAYLOAD_BYTES = 100 * 1024 * 1024;
const INLINE_MAX_PDF_PAYLOAD_BYTES = 50 * 1024 * 1024;
const INLINE_PART_JSON_OVERHEAD_BYTES = 512;
const GENERIC_TEXT_MIME_TYPE = 'text/plain';
const GENERIC_BINARY_MIME_TYPE = 'application/octet-stream';

export const DIRECTORY_PLACEHOLDER_MIME_TYPE = 'application/x-directory';

const getFilenameExtension = (filename: string): string => {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex === -1 ? '' : filename.slice(lastDotIndex).toLowerCase();
};

const getFileSignature = (file: Pick<File, 'name' | 'size'>) => `${file.name.toLowerCase()}::${file.size}`;

type ProcessingPlaceholderFileInput = Pick<UploadedFile, 'id' | 'name' | 'type' | 'size'> &
  Partial<Omit<UploadedFile, 'id' | 'name' | 'type' | 'size'>>;

export const createProcessingPlaceholderFile = ({
  id,
  name,
  type,
  size,
  ...overrides
}: ProcessingPlaceholderFileInput): UploadedFile => ({
  id,
  name,
  type,
  size,
  isProcessing: true,
  uploadState: 'pending',
  ...overrides,
});

export const formatSpeed = (bytesPerSecond: number): string => {
  if (!isFinite(bytesPerSecond) || bytesPerSecond < 0) return '';
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
};

export const getEffectiveMimeType = (file: File): string => {
  const effectiveMimeType = file.type;
  const mappedMimeType = EXTENSION_TO_MIME[getFilenameExtension(file.name)];
  const isGenericBrowserTextMimeType =
    !effectiveMimeType ||
    effectiveMimeType === GENERIC_TEXT_MIME_TYPE ||
    effectiveMimeType === GENERIC_BINARY_MIME_TYPE;
  const shouldPreferMappedTextMime = isTextFile(file) && !!mappedMimeType && isGenericBrowserTextMimeType;
  const shouldUseExtensionMimeFallback = !effectiveMimeType && mappedMimeType;

  if (shouldPreferMappedTextMime) {
    return mappedMimeType;
  }

  if (effectiveMimeType && SUPPORTED_UPLOAD_MIME_TYPES.includes(effectiveMimeType)) {
    return effectiveMimeType;
  }

  if (isTextFile(file)) {
    return GENERIC_TEXT_MIME_TYPE;
  }

  if (shouldUseExtensionMimeFallback) {
    return mappedMimeType;
  }

  return effectiveMimeType || GENERIC_BINARY_MIME_TYPE;
};

const estimateBase64PayloadBytes = (rawBytes: number): number => {
  return Math.ceil(rawBytes / 3) * 4 + INLINE_PART_JSON_OVERHEAD_BYTES;
};

const estimateTextPayloadBytes = (rawBytes: number): number => {
  return rawBytes + INLINE_PART_JSON_OVERHEAD_BYTES;
};

const getEstimatedInlinePayloadBytes = (file: File, appSettings: AppSettings): number => {
  const isServerCodeExecutionEnabled = isServerCodeExecutionMode(appSettings);
  const textLike = isTextFile(file);

  if (textLike && !isServerCodeExecutionEnabled) {
    return estimateTextPayloadBytes(file.size);
  }

  return estimateBase64PayloadBytes(file.size);
};

export const getUploadLifecycleForGeminiState = (
  state: string | null | undefined,
): Pick<UploadedFile, 'uploadState' | 'isProcessing'> => {
  if (state === 'ACTIVE') {
    return { uploadState: 'active', isProcessing: false };
  }

  if (state === 'FAILED') {
    return { uploadState: 'failed', isProcessing: false };
  }

  // Gemini can omit state immediately after upload/get; keep polling until it settles.
  return { uploadState: 'processing_api', isProcessing: true };
};

// A session routes to a third-party provider when its providerId is set to one.
// ProviderIds are the derived routing key; gemini-native (or absent) is Gemini.
const isThirdPartyRoute = (providerId?: ChatProviderId): boolean =>
  providerId !== undefined && providerId !== GEMINI_PROVIDER_ID;

export const shouldUseFileApi = (file: File, appSettings: AppSettings, providerId?: ChatProviderId): boolean => {
  const effectiveMimeType = getEffectiveMimeType(file);
  if (!SUPPORTED_UPLOAD_MIME_TYPES.includes(effectiveMimeType)) return false;

  // Third-party providers cannot consume Gemini Files API references; always inline.
  if (isThirdPartyRoute(providerId)) return false;

  const isServerCodeExecutionEnabled = isServerCodeExecutionMode(appSettings);
  const isTextLike = isTextFile(file);

  const resolveFileApiConfigKey = (mimeType: string): keyof FilesApiConfig => {
    if (SUPPORTED_IMAGE_MIME_TYPES.includes(mimeType)) return 'images';
    if (SUPPORTED_PDF_MIME_TYPES.includes(mimeType)) return 'pdfs';
    if (SUPPORTED_AUDIO_MIME_TYPES.includes(mimeType)) return 'audio';
    if (SUPPORTED_VIDEO_MIME_TYPES.includes(mimeType)) return 'video';
    return 'text';
  };

  const userPrefersFileApi = appSettings.filesApiConfig[resolveFileApiConfigKey(effectiveMimeType)];

  const inlineLimitBytes = SUPPORTED_PDF_MIME_TYPES.includes(effectiveMimeType)
    ? INLINE_MAX_PDF_PAYLOAD_BYTES
    : isServerCodeExecutionEnabled && isTextLike
      ? CODE_EXECUTION_TEXT_FILE_LIMIT_BYTES
      : INLINE_MAX_REQUEST_PAYLOAD_BYTES;

  return userPrefersFileApi || getEstimatedInlinePayloadBytes(file, appSettings) > inlineLimitBytes;
};

export const getFilesRequiringFileApi = (
  files: File[],
  appSettings: AppSettings,
  providerId?: ChatProviderId,
): Set<File> => {
  const filesRequiringApi = new Set<File>();

  // Third-party providers cannot consume Gemini Files API references; always inline.
  if (isThirdPartyRoute(providerId)) return filesRequiringApi;

  const inlineCandidates: File[] = [];
  let inlinePayloadBytes = 0;

  for (const file of files) {
    const effectiveMimeType = getEffectiveMimeType(file);
    if (!SUPPORTED_UPLOAD_MIME_TYPES.includes(effectiveMimeType)) continue;

    if (shouldUseFileApi(file, appSettings, providerId)) {
      filesRequiringApi.add(file);
      continue;
    }

    inlineCandidates.push(file);
    inlinePayloadBytes += getEstimatedInlinePayloadBytes(file, appSettings);
  }

  if (inlinePayloadBytes > INLINE_MAX_REQUEST_PAYLOAD_BYTES) {
    inlineCandidates.forEach((file) => filesRequiringApi.add(file));
  }

  return filesRequiringApi;
};

export const checkBatchNeedsApiKey = (
  files: File[],
  appSettings: AppSettings,
  providerId?: ChatProviderId,
): boolean => {
  return getFilesRequiringFileApi(files, appSettings, providerId).size > 0;
};

interface FileUploadPreflightResult {
  filesToUpload: File[];
  notice: string | null;
}

export const buildFileUploadPreflight = (
  files: File[],
  _appSettings: AppSettings,
  existingFiles: Array<Pick<UploadedFile, 'name' | 'size'>> = [],
  t: Translator = getTranslator('en'),
): FileUploadPreflightResult => {
  const seenSignatures = new Set(existingFiles.map(getFileSignature));
  const filesToUpload: File[] = [];
  const duplicateNames: string[] = [];
  const unsupportedNames: string[] = [];
  const emptyNames: string[] = [];

  for (const file of files) {
    if (file.size === 0) {
      emptyNames.push(file.name);
      continue;
    }

    const signature = getFileSignature(file);
    if (seenSignatures.has(signature)) {
      duplicateNames.push(file.name);
      continue;
    }

    seenSignatures.add(signature);
    filesToUpload.push(file);

    const effectiveMimeType = getEffectiveMimeType(file);
    if (!SUPPORTED_UPLOAD_MIME_TYPES.includes(effectiveMimeType)) {
      unsupportedNames.push(file.name);
    }
  }

  const noticeParts: string[] = [];
  if (emptyNames.length > 0) {
    noticeParts.push(interpolate(t('uploadSkippedEmpty'), { filenames: emptyNames.join(', ') }));
  }
  if (duplicateNames.length > 0) {
    noticeParts.push(interpolate(t('uploadSkippedDuplicates'), { filenames: duplicateNames.join(', ') }));
  }

  if (unsupportedNames.length > 0) {
    noticeParts.push(interpolate(t('uploadUnsupportedTypes'), { filenames: unsupportedNames.join(', ') }));
  }

  return {
    filesToUpload,
    notice: noticeParts.length > 0 ? noticeParts.join(' ') : null,
  };
};
