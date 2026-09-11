import { CREATE_FILE_EXTENSION_OPTIONS } from './createFileExtensionOptions';
import { formatTimestampFilename } from './deriveDefaultFilename';

const KNOWN_FILENAME_EXTENSIONS = [
  ...CREATE_FILE_EXTENSION_OPTIONS,
  '.markdown',
  '.htm',
  '.tsx',
  '.jsx',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.sh',
  '.bash',
  '.zsh',
  '.scss',
  '.less',
  '.java',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.tsv',
  '.log',
];

const stripKnownExtension = (filename: string, activeExtension?: string): string => {
  const lowerFilename = filename.toLowerCase();
  const candidateExtensions = activeExtension
    ? [activeExtension, ...KNOWN_FILENAME_EXTENSIONS]
    : KNOWN_FILENAME_EXTENSIONS;

  const matchedExtension = candidateExtensions.find((extension) => lowerFilename.endsWith(extension.toLowerCase()));

  return matchedExtension ? filename.slice(0, filename.length - matchedExtension.length) : filename;
};

const sanitizeStem = (rawStem: string): string => {
  const cleaned = rawStem
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\.+$/, '')
    .trim();

  if (/^[_\s.]+$/.test(cleaned)) {
    return '';
  }

  return cleaned;
};

export const composeCreateFileName = (
  filenameBase: string,
  derivedFilename?: string | null,
  extension: string = '.md',
  fallbackStem = formatTimestampFilename(),
): string => {
  const rawStem = filenameBase.trim() || derivedFilename?.trim() || fallbackStem;
  const strippedStem = stripKnownExtension(rawStem, extension);
  const stem = sanitizeStem(strippedStem) || fallbackStem;

  return `${stem}${extension}`;
};
