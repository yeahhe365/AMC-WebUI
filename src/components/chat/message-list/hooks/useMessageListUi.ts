import { useState, useMemo, useCallback } from 'react';
import { type UploadedFile, type ChatMessage, type VideoMetadata, type MediaResolution } from '@/types';
import { useFileModalState } from '@/hooks/ui/useFileModalState';
import {
  createHtmlPreviewRequest,
  type HtmlPreviewOpenOptions,
  type HtmlPreviewRequest,
} from '@/utils/html-preview/previewPrivilege';

interface UseMessageListUiProps {
  messages: ChatMessage[];
  onUpdateMessageFile: (
    messageId: string,
    fileId: string,
    updates: { videoMetadata?: VideoMetadata; mediaResolution?: MediaResolution },
  ) => void;
}

export const useMessageListUi = ({ messages, onUpdateMessageFile }: UseMessageListUiProps) => {
  const [isHtmlPreviewModalOpen, setIsHtmlPreviewModalOpen] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState<HtmlPreviewRequest | null>(null);

  const allFiles = useMemo(() => messages.flatMap((message) => message.files || []), [messages]);
  const {
    previewFile,
    closePreview,
    allImages,
    currentImageIndex,
    handlePrevImage,
    handleNextImage,
    configuringFile,
    setConfiguringFile,
    openPreview,
    openConfiguration,
  } = useFileModalState<{ file: UploadedFile; messageId: string }>(allFiles);

  const handleFileClick = useCallback(
    (file: UploadedFile) => {
      openPreview(file);
    },
    [openPreview],
  );

  const handleOpenHtmlPreview = useCallback((htmlContent: string, options?: HtmlPreviewOpenOptions) => {
    setHtmlPreview(createHtmlPreviewRequest(htmlContent, options));
    setIsHtmlPreviewModalOpen(true);
  }, []);

  const handleCloseHtmlPreview = useCallback(() => {
    setIsHtmlPreviewModalOpen(false);
    setHtmlPreview(null);
  }, []);

  const handleConfigureFile = useCallback(
    (file: UploadedFile, messageId: string) => {
      openConfiguration({ file, messageId });
    },
    [openConfiguration],
  );

  const handleSaveFileConfig = useCallback(
    (fileId: string, updates: { videoMetadata?: VideoMetadata; mediaResolution?: MediaResolution }) => {
      if (configuringFile) {
        onUpdateMessageFile(configuringFile.messageId, fileId, updates);
      }
    },
    [configuringFile, onUpdateMessageFile],
  );

  return {
    previewFile,
    isHtmlPreviewModalOpen,
    htmlPreview,
    configuringFile,
    setConfiguringFile,
    handleFileClick,
    closeFilePreviewModal: closePreview,
    allImages,
    currentImageIndex,
    handlePrevImage,
    handleNextImage,
    handleOpenHtmlPreview,
    handleCloseHtmlPreview,
    handleConfigureFile,
    handleSaveFileConfig,
  };
};
