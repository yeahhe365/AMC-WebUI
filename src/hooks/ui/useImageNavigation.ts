import { useMemo, useCallback } from 'react';
import { type UploadedFile } from '@/types';
import { isImageMimeType } from '@/utils/file/fileTypeClassification';

export const useImageNavigation = (
  sourceFiles: UploadedFile[],
  currentFile: UploadedFile | null,
  setPreviewFile: (file: UploadedFile | null) => void,
) => {
  // Centralized logic to filter navigable images
  const images = useMemo(() => {
    if (!sourceFiles) return [];
    return sourceFiles.filter((f) => isImageMimeType(f.type) && !f.error);
  }, [sourceFiles]);

  const currentIndex = useMemo(() => {
    if (!currentFile) return -1;
    return images.findIndex((f) => f.id === currentFile.id);
  }, [images, currentFile]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setPreviewFile(images[currentIndex - 1]);
    }
  }, [currentIndex, images, setPreviewFile]);

  const handleNext = useCallback(() => {
    if (currentIndex !== -1 && currentIndex < images.length - 1) {
      setPreviewFile(images[currentIndex + 1]);
    }
  }, [currentIndex, images, setPreviewFile]);

  return {
    images,
    currentIndex,
    handlePrev,
    handleNext,
    hasPrev: currentIndex > 0,
    hasNext: currentIndex !== -1 && currentIndex < images.length - 1,
  };
};
