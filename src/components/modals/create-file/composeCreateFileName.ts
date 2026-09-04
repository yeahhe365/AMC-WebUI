import { CREATE_FILE_EXTENSION_OPTIONS } from './createFileExtensionOptions';

const KNOWN_FILENAME_EXTENSIONS = [...CREATE_FILE_EXTENSION_OPTIONS, '.markdown'];

const stripKnownExtension = (filename: string): string => {
  const lowerFilename = filename.toLowerCase();
  const matchedExtension = KNOWN_FILENAME_EXTENSIONS.find((extension) =>
    lowerFilename.endsWith(extension.toLowerCase()),
  );

  return matchedExtension ? filename.slice(0, filename.length - matchedExtension.length) : filename;
};

export const composeCreateFileName = (
  filenameBase: string,
  derivedFilename: string | null,
  extension: string,
  fallbackStem = `file-${Date.now()}`,
): string => {
  const rawStem = filenameBase.trim() || derivedFilename?.trim() || fallbackStem;
  const stem = stripKnownExtension(rawStem).trim() || fallbackStem;

  return `${stem}${extension}`;
};
