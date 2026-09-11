import { useCallback, type MutableRefObject, type RefObject } from 'react';
import { deferToNextTick } from '@/utils/deferToNextTick';
import type { AppSettings, UploadedFile, SetSelectedFiles } from '@/types';
import { processChatInputClipboardData, shouldHandleChatInputClipboardData } from '@/utils/chat-input/clipboardData';
import { useI18n } from '@/contexts/I18nContext';
import { MIME_TO_EXTENSION_MAP, SUPPORTED_IMAGE_MIME_TYPES } from '@/constants/fileTypeSupport';
import { isYoutubeUrl, normalizeYoutubeUrl } from '@/utils/file/youtubeUrl';
const DEFAULT_CLIPBOARD_IMAGE_EXTENSION = '.image';
const IMAGE_FILE_NAME_TEXT_REGEX = /^(?:file:\/\/\/)?[^\r\n]+\.(?:png|jpe?g|webp|gif|heic|heif|avif|bmp|tiff?)$/i;
const LOCAL_CLIPBOARD_IMAGE_ENDPOINT = '/api/local-clipboard-image';

const getClipboardImageFileName = (mimeType: string, index: number) => {
  const extension = MIME_TO_EXTENSION_MAP[mimeType] ?? DEFAULT_CLIPBOARD_IMAGE_EXTENSION;
  const suffix = index === 0 ? '' : `-${index + 1}`;

  return `clipboard-image${suffix}${extension}`;
};

const readClipboardImageFiles = async (clipboard: Clipboard): Promise<File[]> => {
  if (!clipboard.read) {
    return [];
  }

  const items = await clipboard.read();
  const files: File[] = [];

  for (const item of items) {
    const imageType = item.types.find((type) => SUPPORTED_IMAGE_MIME_TYPES.includes(type));
    if (!imageType) {
      continue;
    }

    const blob = await item.getType(imageType);
    files.push(
      new File([blob], getClipboardImageFileName(imageType, files.length), {
        type: blob.type || imageType,
      }),
    );
  }

  return files;
};

const isImageFileNameClipboardText = (text: string) => IMAGE_FILE_NAME_TEXT_REGEX.test(text.trim());

const decodeClipboardFileName = (value: string | null) => {
  if (!value) {
    return 'clipboard-image.png';
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const readLocalClipboardImageFile = async (): Promise<File | null> => {
  if (typeof fetch === 'undefined') {
    return null;
  }

  try {
    const response = await fetch(LOCAL_CLIPBOARD_IMAGE_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type')?.split(';')[0].trim() || 'image/png';
    if (!SUPPORTED_IMAGE_MIME_TYPES.includes(contentType)) {
      return null;
    }

    const blob = await response.blob();
    const fileName = decodeClipboardFileName(response.headers.get('x-clipboard-file-name'));
    return new File([blob], fileName, { type: blob.type || contentType });
  } catch {
    return null;
  }
};

interface UseChatInputClipboardParams {
  appSettings: AppSettings;
  isAddingById: boolean;
  showCreateTextFileEditor: boolean;
  showRecorder: boolean;
  showLibraryPicker?: boolean;
  justInitiatedFileOpRef: MutableRefObject<boolean>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  setUrlInput: (value: string) => void;
  setShowAddByUrlInput: (isOpen: boolean) => void;
  setSelectedFiles: SetSelectedFiles;
  setAppFileError: (error: string | null) => void;
  onProcessFiles: (files: File[]) => Promise<void>;
  insertText: (text: string) => void;
}

export const useChatInputClipboard = ({
  appSettings,
  isAddingById,
  showCreateTextFileEditor,
  showRecorder,
  showLibraryPicker = false,
  justInitiatedFileOpRef,
  textareaRef,
  setInputText,
  setUrlInput,
  setShowAddByUrlInput,
  setSelectedFiles,
  setAppFileError,
  onProcessFiles,
  insertText,
}: UseChatInputClipboardParams) => {
  const { t } = useI18n();
  const handleAddUrl = useCallback(
    async (url: string) => {
      const canonicalUrl = normalizeYoutubeUrl(url);
      if (!canonicalUrl) {
        setAppFileError(t('addByUrlInvalid'));
        return;
      }

      justInitiatedFileOpRef.current = true;
      const newUrlFile: UploadedFile = {
        id: `url-${Date.now()}`,
        name: canonicalUrl.length > 30 ? `${canonicalUrl.substring(0, 27)}...` : canonicalUrl,
        type: 'video/youtube-link',
        size: 0,
        fileUri: canonicalUrl,
        transferStrategy: 'remote-file-id',
        uploadState: 'active',
        isProcessing: false,
      };

      setSelectedFiles((prev) => [...prev, newUrlFile]);
      setUrlInput('');
      setShowAddByUrlInput(false);
      textareaRef.current?.focus();
    },
    [justInitiatedFileOpRef, setAppFileError, setSelectedFiles, setShowAddByUrlInput, setUrlInput, t, textareaRef],
  );

  const handlePasteAction = useCallback(
    async (clipboardData: DataTransfer | null, options: { forceTextInsertion?: boolean } = {}): Promise<boolean> => {
      const inputModalOpen = showCreateTextFileEditor || showRecorder || showLibraryPicker;

      if (isAddingById || inputModalOpen) {
        return false;
      }

      const result = await processChatInputClipboardData(clipboardData, {
        isPasteRichTextAsMarkdownEnabled: appSettings.isPasteRichTextAsMarkdownEnabled ?? true,
        isPasteAsTextFileEnabled: appSettings.isPasteAsTextFileEnabled ?? true,
      });

      if (result.type === 'empty') {
        return false;
      }

      if (result.type === 'files' || result.type === 'large-text-file') {
        justInitiatedFileOpRef.current = true;
        await onProcessFiles(result.files);
        textareaRef.current?.focus();
        return true;
      }

      if (result.type === 'markdown') {
        insertText(result.content);
        return true;
      }

      if (result.type === 'text') {
        const pastedText = result.content;

        if (isYoutubeUrl(pastedText.trim())) {
          await handleAddUrl(pastedText.trim());
          return true;
        }

        if (options.forceTextInsertion) {
          insertText(pastedText);
          return true;
        }
      }

      return false;
    },
    [
      appSettings.isPasteAsTextFileEnabled,
      appSettings.isPasteRichTextAsMarkdownEnabled,
      handleAddUrl,
      insertText,
      isAddingById,
      justInitiatedFileOpRef,
      onProcessFiles,
      showCreateTextFileEditor,
      showLibraryPicker,
      showRecorder,
      textareaRef,
    ],
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const canHandlePaste = !isAddingById && !showCreateTextFileEditor && !showRecorder && !showLibraryPicker;
      const clipboardOptions = {
        isPasteRichTextAsMarkdownEnabled: appSettings.isPasteRichTextAsMarkdownEnabled ?? true,
        isPasteAsTextFileEnabled: appSettings.isPasteAsTextFileEnabled ?? true,
      };
      const pastedText = event.clipboardData.getData('text/plain');
      const shouldAppHandleClipboardData =
        shouldHandleChatInputClipboardData(event.clipboardData, clipboardOptions) || isYoutubeUrl(pastedText.trim());
      const shouldHandle = canHandlePaste && shouldAppHandleClipboardData;

      if (shouldHandle) {
        event.preventDefault();
        event.stopPropagation();
      }

      await handlePasteAction(event.clipboardData, { forceTextInsertion: shouldHandle });
    },
    [
      appSettings.isPasteAsTextFileEnabled,
      appSettings.isPasteRichTextAsMarkdownEnabled,
      handlePasteAction,
      isAddingById,
      showCreateTextFileEditor,
      showLibraryPicker,
      showRecorder,
    ],
  );

  const handlePasteFromClipboard = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    const clipboard = navigator.clipboard;
    let didHandle = false;
    const tryLocalClipboardImage = async () => {
      const localClipboardImage = await readLocalClipboardImageFile();
      if (!localClipboardImage) {
        return false;
      }

      justInitiatedFileOpRef.current = true;
      await onProcessFiles([localClipboardImage]);
      return true;
    };

    try {
      const imageFiles = await readClipboardImageFiles(clipboard);
      if (imageFiles.length > 0) {
        justInitiatedFileOpRef.current = true;
        await onProcessFiles(imageFiles);
        didHandle = true;
      }
    } catch {
      // Fall back to text-only paste when image clipboard access is unavailable or denied.
    }

    if (!didHandle) {
      try {
        const clipboardText = clipboard.readText ? await clipboard.readText() : '';
        if (clipboardText && isImageFileNameClipboardText(clipboardText)) {
          didHandle = await tryLocalClipboardImage();
        } else if (clipboardText) {
          didHandle = true;
          setInputText((prev) => prev + clipboardText);
        } else {
          didHandle = await tryLocalClipboardImage();
        }
      } catch {
        if (!didHandle) {
          didHandle = await tryLocalClipboardImage();
        }
      }
    }

    if (didHandle) {
      textareaRef.current?.focus();
      setTimeout(() => {
        const textarea = textareaRef.current;
        textarea?.focus();
        textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
      }, 0);
    }
  }, [justInitiatedFileOpRef, onProcessFiles, setInputText, textareaRef]);

  const handleClearInput = useCallback(() => {
    setInputText('');
    deferToNextTick(() => textareaRef.current?.focus());
  }, [setInputText, textareaRef]);

  return {
    handleAddUrl,
    handlePasteAction,
    handlePaste,
    handlePasteFromClipboard,
    handleClearInput,
  };
};
