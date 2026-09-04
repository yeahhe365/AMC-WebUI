import { logService } from '@/services/logService';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload } from '@/utils/export/core';
import { normalizeConvertedMarkdown } from '@/utils/normalizeConvertedMarkdown';
import {
  createInlineImagePlaceholder,
  extractInlineImagePlaceholders,
  resolveInlineImagePlaceholders,
} from '@/utils/inlineImagePlaceholders';
import { isImageMimeType } from '@/utils/file/fileTypeClassification';
import { CREATE_TEXT_FILE_EDITOR_LAST_EXTENSION_KEY } from '@/constants/storageKeys';
import { useI18n } from '@/contexts/I18nContext';
import { CREATE_FILE_EXTENSION_OPTIONS } from './createFileExtensionOptions';
import { composeCreateFileName } from './composeCreateFileName';
import { deriveDefaultFilename } from './deriveDefaultFilename';
import { getClipboardPastePlan } from './createFileClipboard';

interface UseCreateFileEditorProps {
  initialContent: string;
  initialFilename: string;
  onConfirm: (content: string | Blob, filename: string) => void;
  themeId: string;
  isPasteRichTextAsMarkdownEnabled: boolean;
}

const EDITOR_CONTENT_DEBOUNCE_MS = 300;
const EDITOR_FOCUS_DELAY_MS = 100;

const readStoredCreateFileExtension = (): string | null => {
  try {
    if (typeof window === 'undefined') return null;
    const storedExtension = window.localStorage.getItem(CREATE_TEXT_FILE_EDITOR_LAST_EXTENSION_KEY);
    if (storedExtension && CREATE_FILE_EXTENSION_OPTIONS.includes(storedExtension)) {
      return storedExtension;
    }
  } catch {
    return null;
  }

  return null;
};

const writeStoredCreateFileExtension = (nextExtension: string) => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CREATE_TEXT_FILE_EDITOR_LAST_EXTENSION_KEY, nextExtension);
  } catch {
    // Ignore quota / private-mode failures; the in-memory selection still applies.
  }
};

export const useCreateFileEditor = ({
  initialContent,
  initialFilename,
  onConfirm,
  themeId,
  isPasteRichTextAsMarkdownEnabled,
}: UseCreateFileEditorProps) => {
  const { t } = useI18n();
  const initialInlineImagesRef = useRef(extractInlineImagePlaceholders(initialContent));
  const imagePlaceholdersRef = useRef(initialInlineImagesRef.current.placeholders);
  const nextImageIndexRef = useRef(initialInlineImagesRef.current.nextIndex);

  const [textContent, setTextContent] = useState(initialInlineImagesRef.current.editorContent);
  const [debouncedEditorContent, setDebouncedEditorContent] = useState(initialInlineImagesRef.current.editorContent);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const initialFilenameBase = !initialFilename
    ? ''
    : initialFilename.lastIndexOf('.') === -1
      ? initialFilename
      : initialFilename.substring(0, initialFilename.lastIndexOf('.'));

  const [filenameBase, setFilenameBase] = useState(initialFilenameBase);

  const initialExtension = useMemo(() => {
    if (!initialFilename) {
      return readStoredCreateFileExtension() || '.md';
    }
    const lastDotIndex = initialFilename.lastIndexOf('.');
    if (lastDotIndex === -1) return '.md';
    return initialFilename.substring(lastDotIndex);
  }, [initialFilename]);

  const [extension, setExtension] = useState(initialExtension);

  const handleSetExtension = useCallback((nextExtension: string) => {
    setExtension(nextExtension);
    writeStoredCreateFileExtension(nextExtension);
  }, []);

  const isEditing = initialFilename !== '';
  const isPdf = extension === '.pdf';
  const supportsRichPreview = ['.md', '.markdown', '.pdf'].includes(extension);

  const derivedFilename = useMemo(() => deriveDefaultFilename(textContent), [textContent]);

  const isDirty =
    textContent !== initialInlineImagesRef.current.editorContent ||
    filenameBase !== initialFilenameBase ||
    extension !== initialExtension;

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedEditorContent(textContent), EDITOR_CONTENT_DEBOUNCE_MS);
    return () => clearTimeout(handler);
  }, [textContent]);

  const debouncedContent = useMemo(
    () =>
      resolveInlineImagePlaceholders(normalizeConvertedMarkdown(debouncedEditorContent), imagePlaceholdersRef.current),
    [debouncedEditorContent],
  );

  const generatePdfBlob = async (filename: string): Promise<Blob> =>
    (await import('@/utils/export/markdownPdf')).createMarkdownPdfBlob(
      resolveInlineImagePlaceholders(normalizeConvertedMarkdown(textContent), imagePlaceholdersRef.current),
      {
        filename,
        themeId,
      },
    );

  const saveLockRef = useRef(false);

  const handleSave = async () => {
    if (saveLockRef.current || isExportingPdf) return;
    if (!textContent.trim()) return;

    saveLockRef.current = true;
    const finalName = composeCreateFileName(filenameBase, derivedFilename, extension);

    if (isPdf) {
      setIsExportingPdf(true);
      setPdfError(null);
      try {
        const pdfBlob = await generatePdfBlob(finalName);
        onConfirm(pdfBlob, finalName);
      } catch (error) {
        logService.error('PDF generation error:', error);
        setPdfError(t('createTextPdfError'));
        saveLockRef.current = false;
      } finally {
        setIsExportingPdf(false);
      }
    } else {
      onConfirm(
        resolveInlineImagePlaceholders(normalizeConvertedMarkdown(textContent), imagePlaceholdersRef.current),
        finalName,
      );
    }
  };

  const handleDownloadPdf = async () => {
    if (saveLockRef.current || isExportingPdf) return;
    if (!textContent.trim()) return;

    saveLockRef.current = true;
    setIsExportingPdf(true);
    setPdfError(null);
    const finalName = composeCreateFileName(filenameBase, derivedFilename, '.pdf', 'document');

    try {
      const pdfBlob = await generatePdfBlob(finalName);
      triggerDownload(createManagedObjectUrl(pdfBlob), finalName);
    } catch (error) {
      logService.error('PDF Export failed:', error);
      setPdfError(t('createTextPdfError'));
    } finally {
      saveLockRef.current = false;
      setIsExportingPdf(false);
    }
  };

  const insertImageFile = useCallback((file: File, startPos: number, endPos: number = startPos) => {
    const placeholder = createInlineImagePlaceholder(nextImageIndexRef.current++);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        imagePlaceholdersRef.current.set(placeholder, dataUrl);
        const imageName = file.name || `image-${Date.now()}.png`;
        const markdownImage = `\n![${imageName}](${placeholder})\n`;

        setTextContent((prev) => {
          const safeStart = Math.min(startPos, prev.length);
          const safeEnd = Math.min(endPos, prev.length);
          return prev.substring(0, safeStart) + markdownImage + prev.substring(safeEnd);
        });

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const newCursorPos = startPos + markdownImage.length;
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
        }, 50);
      }
    };
    reader.onerror = () => {
      logService.error('Failed to read pasted image.');
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      const plan = getClipboardPastePlan(event.clipboardData, isPasteRichTextAsMarkdownEnabled);
      const start = textarea ? textarea.selectionStart : textContent.length;
      const end = textarea ? textarea.selectionEnd : textContent.length;

      if (plan.kind === 'image') {
        event.preventDefault();
        insertImageFile(plan.file, start, end);
        return;
      }

      if (plan.kind !== 'html') return;

      event.preventDefault();
      const { html, plain } = plan;

      void (async () => {
        const { convertHtmlToMarkdown } = await import('@/utils/htmlToMarkdown');
        const markdown = convertHtmlToMarkdown(html);
        const insertion = markdown.trim() ? markdown : plain;
        if (!insertion || !textarea) return;

        const extracted = extractInlineImagePlaceholders(insertion, nextImageIndexRef.current);
        extracted.placeholders.forEach((dataUrl, placeholder) => {
          imagePlaceholdersRef.current.set(placeholder, dataUrl);
        });
        nextImageIndexRef.current = extracted.nextIndex;

        setTextContent((previousContent) => {
          const safeStart = Math.min(start, previousContent.length);
          const safeEnd = Math.min(end, previousContent.length);
          return previousContent.substring(0, safeStart) + extracted.editorContent + previousContent.substring(safeEnd);
        });
        setTimeout(() => {
          textarea.focus();
          const cursor = start + extracted.editorContent.length;
          textarea.setSelectionRange(cursor, cursor);
        }, 0);
      })();
    },
    [isPasteRichTextAsMarkdownEnabled, insertImageFile, textContent],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      const items = event.dataTransfer.items;
      let file: File | null = null;

      if (items) {
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
          const item = items[itemIndex];
          if (item.kind === 'file' && isImageMimeType(item.type)) {
            file = item.getAsFile();
            break;
          }
        }
      } else if (event.dataTransfer.files) {
        for (let fileIndex = 0; fileIndex < event.dataTransfer.files.length; fileIndex++) {
          const candidateFile = event.dataTransfer.files[fileIndex];
          if (isImageMimeType(candidateFile.type)) {
            file = candidateFile;
            break;
          }
        }
      }

      if (file) {
        const cursorPosition = textareaRef.current ? textareaRef.current.selectionStart : textContent.length;
        insertImageFile(file, cursorPosition);
      }
    },
    [insertImageFile, textContent],
  );

  useEffect(() => {
    const shouldFocus = !isPreviewMode || window.innerWidth >= 1024;
    if (shouldFocus) {
      const timer = setTimeout(() => {
        if (textareaRef.current && textareaRef.current.offsetParent !== null) {
          textareaRef.current.focus();
          if (isEditing) {
            const textLength = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(textLength, textLength);
          }
        }
      }, EDITOR_FOCUS_DELAY_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isEditing, isPreviewMode]);

  useEffect(() => {
    const shouldDisableUnsupportedPreview = !supportsRichPreview && isPreviewMode;
    if (shouldDisableUnsupportedPreview) {
      setIsPreviewMode(false);
    }
  }, [supportsRichPreview, isPreviewMode]);

  return {
    textContent,
    setTextContent,
    debouncedContent,
    filenameBase,
    setFilenameBase,
    extension,
    setExtension: handleSetExtension,
    isPreviewMode,
    setIsPreviewMode,
    isExportingPdf,
    pdfError,
    derivedFilename,
    isDirty,
    textareaRef,
    isEditing,
    isPdf,
    supportsRichPreview,
    handleSave,
    handleDownloadPdf,
    handlePaste,
    handleDrop,
  };
};
