import { logService } from '@/services/logService';
import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
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
  const dragCounterRef = useRef<number>(0);

  const isFileDrag = (event: globalThis.DragEvent | DragEvent<HTMLElement>): boolean => {
    const types = event.dataTransfer?.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      if (type === 'Files' || type.toLowerCase() === 'files') {
        return true;
      }
    }
    return false;
  };

  useEffect(() => {
    const onWindowDragEnter = (event: globalThis.DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragCounterRef.current += 1;
      setIsAppDraggingOver(true);
    };

    const onWindowDragOver = (event: globalThis.DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 1;
      }
      setIsAppDraggingOver(true);
    };

    const onWindowDragLeave = (event: globalThis.DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      const isOutOfWindow =
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight;
      if (dragCounterRef.current === 0 || isOutOfWindow) {
        dragCounterRef.current = 0;
        setIsAppDraggingOver(false);
      }
    };

    const onWindowDrop = (event: globalThis.DragEvent) => {
      if (isFileDrag(event)) {
        event.preventDefault();
      }
      dragCounterRef.current = 0;
      setIsAppDraggingOver(false);
    };

    const onWindowBlur = () => {
      dragCounterRef.current = 0;
      setIsAppDraggingOver(false);
    };

    window.addEventListener('dragenter', onWindowDragEnter);
    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('dragleave', onWindowDragLeave);
    window.addEventListener('drop', onWindowDrop);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      window.removeEventListener('dragenter', onWindowDragEnter);
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('dragleave', onWindowDragLeave);
      window.removeEventListener('drop', onWindowDrop);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  const handleAppDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsAppDraggingOver(true);
  }, []);

  const handleAppDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsAppDraggingOver(true);
  }, []);

  const handleAppDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsAppDraggingOver(false);
    }
  }, []);

  const handleAppDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
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
