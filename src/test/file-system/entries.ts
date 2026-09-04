export const createFileSystemFileEntry = (fullPath: string, file: File): FileSystemFileEntry =>
  ({
    isFile: true,
    isDirectory: false,
    name: file.name,
    fullPath,
    file(successCallback: (value: File) => void) {
      successCallback(file);
    },
  }) as unknown as FileSystemFileEntry;

export const createFileSystemDirectoryEntry = (
  name: string,
  fullPath: string,
  children: FileSystemEntry[],
): FileSystemDirectoryEntry =>
  ({
    isFile: false,
    isDirectory: true,
    name,
    fullPath,
    createReader() {
      let consumed = false;
      return {
        readEntries(successCallback: (entries: FileSystemEntry[]) => void) {
          if (consumed) {
            successCallback([]);
            return;
          }

          consumed = true;
          successCallback(children);
        },
      } as FileSystemDirectoryReader;
    },
  }) as unknown as FileSystemDirectoryEntry;

export const createFileSystemFileHandle = (name: string, content: string): FileSystemFileHandle =>
  ({
    kind: 'file',
    name,
    getFile: () => Promise.resolve(new File([content], name, { type: 'text/plain' })),
  }) as unknown as FileSystemFileHandle;

export const createFileSystemDirectoryHandle = (
  name: string,
  entries: Array<FileSystemDirectoryHandle | FileSystemFileHandle>,
): FileSystemDirectoryHandle =>
  ({
    kind: 'directory',
    name,
    async *values() {
      for (const entry of entries) {
        yield entry;
      }
    },
  }) as unknown as FileSystemDirectoryHandle;
