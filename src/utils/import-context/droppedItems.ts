import { attachRelativePath, normalizeRelativePath } from './filePath';
import { readDirectoryHandle } from './directoryHandleReader';
import { IGNORED_DIRS } from './defaultIgnorePatterns';
import { type DroppedItemsSnapshot } from './droppedItemsSnapshot';

interface DroppedItemsResult {
  files: File[];
  emptyDirectoryPaths: string[];
}

interface ProcessDroppedItemsOptions {
  skipDefaultIgnoredDirectories?: boolean;
}

export { snapshotDroppedItems } from './droppedItemsSnapshot';

export async function processDroppedItemsSnapshot(
  snapshot: DroppedItemsSnapshot & { handles?: FileSystemHandle[] },
  signal?: AbortSignal,
  options: ProcessDroppedItemsOptions = {},
): Promise<DroppedItemsResult> {
  const allFiles = [...snapshot.files];
  const emptyDirectoryPaths: string[] = [];

  const readEntries = async (entry: FileSystemEntry): Promise<DroppedItemsResult> => {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (entry.isFile) {
      return new Promise((resolve, reject) => {
        (entry as FileSystemFileEntry).file(
          (file) => {
            resolve({
              files: [attachRelativePath(file, entry.fullPath, { preserveExisting: true })],
              emptyDirectoryPaths: [],
            });
          },
          (error) => reject(error),
        );
      });
    }

    if (entry.isDirectory) {
      if (options.skipDefaultIgnoredDirectories !== false && IGNORED_DIRS.has(entry.name)) {
        return { files: [], emptyDirectoryPaths: [] };
      }

      const dirReader = (entry as FileSystemDirectoryEntry).createReader();
      const directoryFiles: File[] = [];
      const directoryEmptyPaths: string[] = [];

      return new Promise((resolve, reject) => {
        const readBatch = () => {
          dirReader.readEntries(
            async (batch) => {
              if (signal?.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
              }

              if (batch.length === 0) {
                if (directoryFiles.length === 0) {
                  directoryEmptyPaths.push(normalizeRelativePath(entry.fullPath));
                }
                resolve({ files: directoryFiles, emptyDirectoryPaths: directoryEmptyPaths });
                return;
              }

              try {
                const batchResults = await Promise.all(batch.map(readEntries));
                directoryFiles.push(...batchResults.flatMap((result) => result.files));
                directoryEmptyPaths.push(...batchResults.flatMap((result) => result.emptyDirectoryPaths));
                readBatch();
              } catch (error) {
                reject(error);
              }
            },
            (error) => reject(error),
          );
        };

        readBatch();
      });
    }

    return { files: [], emptyDirectoryPaths: [] };
  };

  const readHandle = async (handle: FileSystemHandle): Promise<DroppedItemsResult> => {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (handle.kind === 'directory') {
      if (options.skipDefaultIgnoredDirectories !== false && IGNORED_DIRS.has(handle.name)) {
        return { files: [], emptyDirectoryPaths: [] };
      }

      return readDirectoryHandle(handle as FileSystemDirectoryHandle, options);
    }

    const file = await (handle as FileSystemFileHandle).getFile();
    return {
      files: [attachRelativePath(file, handle.name)],
      emptyDirectoryPaths: [],
    };
  };

  const filesFromEntries = await Promise.all(snapshot.entries.map(readEntries));
  allFiles.push(...filesFromEntries.flatMap((result) => result.files));
  emptyDirectoryPaths.push(...filesFromEntries.flatMap((result) => result.emptyDirectoryPaths));

  const handlesFromPromises = snapshot.handlePromises
    ? (await Promise.all(snapshot.handlePromises)).filter((handle): handle is FileSystemHandle => handle !== null)
    : [];
  const fileSystemHandles = [...(snapshot.handles ?? []), ...handlesFromPromises];
  const filesFromHandles = await Promise.all(fileSystemHandles.map(readHandle));
  allFiles.push(...filesFromHandles.flatMap((result) => result.files));
  emptyDirectoryPaths.push(...filesFromHandles.flatMap((result) => result.emptyDirectoryPaths));

  return {
    files: allFiles,
    emptyDirectoryPaths,
  };
}
