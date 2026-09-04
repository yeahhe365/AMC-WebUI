import { logService } from '@/services/logService';
import { type DragEvent, useCallback, useEffect, useState } from 'react';
import { type UploadedFile } from '@/types';
import { generateUniqueId } from '@/utils/chat/ids';
import { useI18n } from '@/contexts/I18nContext';
import { createProcessingPlaceholderFile, DIRECTORY_PLACEHOLDER_MIME_TYPE } from '@/utils/file-upload/fileUploadPolicy';
import { createEmptyDroppedItemsSnapshot, snapshotDroppedItems } from '@/utils/import-context/droppedItemsSnapshot';

interface UseFileDragDropProps {
  onFilesDropped: (files: FileList | File[]) => Promise<void>;
  onAddTempFile: (file: UploadedFile) => void;
  onRemoveTempFile: (id: string) => void;
}

export const useFileDragDrop = ({ onFilesDropped, onAddTempFile, onRemoveTempFile }: UseFileDragDropProps) => {
  const { t } = useI18n();
  const [isAppDraggingOver, setIsAppDraggingOver] = useState<boolean>(false);
  const [isProcessingDrop, setIsProcessingDrop] = useState<boolean>(false);

  // App 根容器统一处理 drop，window 监听仅作为兜底防止浏览器导航。
  // 内部拖拽（文本选区等）不带 'Files' 类型，不受影响。
  useEffect(() => {
    const cancelFileDropNavigation = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault();
      }
    };

    window.addEventListener('dragover', cancelFileDropNavigation);
    window.addEventListener('drop', cancelFileDropNavigation);
    return () => {
      window.removeEventListener('dragover', cancelFileDropNavigation);
      window.removeEventListener('drop', cancelFileDropNavigation);
    };
  }, []);

  const handleAppDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsAppDraggingOver(true);
    }
  }, []);

  const handleAppDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.types.includes('Files')) {
        e.dataTransfer.dropEffect = 'copy';
        if (!isAppDraggingOver) {
          setIsAppDraggingOver(true);
        }
      } else {
        e.dataTransfer.dropEffect = 'none';
      }
    },
    [isAppDraggingOver],
  );

  const handleAppDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only reset if leaving the main container, not entering a child
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsAppDraggingOver(false);
  }, []);

  const handleAppDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsAppDraggingOver(false);
      setIsProcessingDrop(true);

      try {
        const items = e.dataTransfer.items;
        const droppedSnapshot = items ? snapshotDroppedItems(items) : createEmptyDroppedItemsSnapshot();
        const hasSnapshotData =
          droppedSnapshot.entries.length > 0 ||
          droppedSnapshot.handlePromises.length > 0 ||
          droppedSnapshot.files.length > 0;
        if (!hasSnapshotData && e.dataTransfer.files?.length) {
          await onFilesDropped(e.dataTransfer.files);
          return;
        }

        const handles = await Promise.all(droppedSnapshot.handlePromises);
        const droppedHandles = handles.filter((handle): handle is FileSystemHandle => handle !== null);
        const hasDirectory =
          droppedSnapshot.entries.some((entry) => entry.isDirectory) ||
          droppedHandles.some((handle) => handle.kind === 'directory');

        if (hasDirectory) {
          const tempId = generateUniqueId();
          onAddTempFile(
            createProcessingPlaceholderFile({
              id: tempId,
              name: t('fileProcessingDropped'),
              type: DIRECTORY_PLACEHOLDER_MIME_TYPE,
              size: 0,
            }),
          );

          const [{ processDroppedItemsSnapshot }, { buildImportContextFile }] = await Promise.all([
            import('@/utils/import-context/droppedItems'),
            import('@/utils/import-context/importContextBuilder'),
          ]);
          const dropped = await processDroppedItemsSnapshot({
            entries: droppedSnapshot.entries,
            handles: droppedHandles,
            handlePromises: [],
            files: droppedSnapshot.files,
          });

          if (dropped.files.length > 0 || dropped.emptyDirectoryPaths.length > 0) {
            const contextFile = await buildImportContextFile(dropped.files, {
              emptyDirectoryPaths: dropped.emptyDirectoryPaths,
            });
            await onFilesDropped([contextFile]);
          }

          onRemoveTempFile(tempId);
        } else {
          const dropped = await import('@/utils/import-context/droppedItems').then(({ processDroppedItemsSnapshot }) =>
            processDroppedItemsSnapshot({
              entries: droppedSnapshot.entries,
              handles: droppedHandles,
              handlePromises: [],
              files: droppedSnapshot.files,
            }),
          );

          if (dropped.files.length) {
            await onFilesDropped(dropped.files);
          }
        }
      } catch (error) {
        logService.error('Error processing dropped files:', error);
      } finally {
        setIsProcessingDrop(false);
      }
    },
    [onFilesDropped, onAddTempFile, onRemoveTempFile, t],
  );

  return {
    isAppDraggingOver,
    isProcessingDrop,
    handleAppDragEnter,
    handleAppDragOver,
    handleAppDragLeave,
    handleAppDrop,
  };
};
