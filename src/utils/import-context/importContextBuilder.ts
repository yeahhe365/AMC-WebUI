import JSZip from 'jszip';

import { fileToString } from '@/utils/file/fileEncoding';
import { extractDocxText, isDocxFile } from '@/utils/docxPreview';
import { attachRelativePath, getFilePath } from './filePath';
import { buildRootGitignoreMatchers, isIgnoredByGitignore, type IgnoreMatcher } from './ignoreMatcher';
import { generateRepomixPlainOutput } from './repomixPlainOutput';
import { scanSensitiveContent } from './securityScan';
import { IGNORED_DIRS, IGNORED_EXTENSIONS } from './defaultIgnorePatterns';
import { IMPORT_CONTEXT_LANGUAGE_MAP } from './languageMap';
import { compareFilePaths, sortTreeNodes } from './treeSorting';
import { countLines, estimateTokens } from './textStats';
import {
  DEFAULT_ZIP_CONCURRENCY,
  DEFAULT_ZIP_SAFETY_LIMITS,
  runWithConcurrency,
  sanitizeZipEntryPath,
  validateZipStructure,
  type ZipSafetyLimits,
} from './zipSafety';
import type { AnalysisSummary, FileContent, FileNode, ProcessedFiles, SecurityFinding } from './importContextTypes';

export interface ImportContextBuildOptions {
  includeEmptyDirectories?: boolean;
  emptyDirectoryPaths?: string[];
  zipSafetyLimits?: ZipSafetyLimits;
}

export interface PathFileInput {
  file: File;
  path: string;
}

interface ReadTextFileResult {
  content: string;
  lineCount: number;
}

interface ZipExtractionResult {
  files: File[];
  emptyDirectoryPaths: string[];
}

function getLanguage(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  return IMPORT_CONTEXT_LANGUAGE_MAP[extension] || 'plaintext';
}

function shouldExpandZipFile(file: File): boolean {
  const relativePath = file.webkitRelativePath;
  return !relativePath || relativePath === file.name;
}

function buildUnicodeTree(treeData: FileNode[], rootName: string): string {
  let structure = `${rootName}\n`;

  const generateLines = (nodes: FileNode[], prefix: string) => {
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      structure += `${prefix}${connector}${node.name}\n`;

      if (node.isDirectory && node.children.length > 0) {
        const nextPrefix = prefix + (isLast ? '    ' : '│   ');
        generateLines(node.children, nextPrefix);
      }
    });
  };

  generateLines(treeData, '');
  return structure;
}

function summarizeAnalysis(fileContents: FileContent[]): {
  analysisSummary: AnalysisSummary;
  securityFindings: SecurityFinding[];
} {
  const activeFiles = fileContents.filter((file) => !file.excluded);
  const securityFindings = activeFiles.flatMap((file) => file.securityFindings ?? []);

  return {
    analysisSummary: {
      totalEstimatedTokens: activeFiles.reduce((sum, file) => sum + file.stats.estimatedTokens, 0),
      securityFindingCount: securityFindings.length,
      scannedFileCount: activeFiles.length,
    },
    securityFindings,
  };
}

async function readTextFileWithMetrics(file: File): Promise<ReadTextFileResult> {
  const content = await fileToString(file);
  return {
    content,
    lineCount: countLines(content),
  };
}

async function readImportFileWithMetrics(file: File): Promise<ReadTextFileResult> {
  if (isDocxFile(file)) {
    const { text } = await extractDocxText(file);
    return {
      content: text,
      lineCount: countLines(text),
    };
  }

  return readTextFileWithMetrics(file);
}

function ensurePathNodes(
  path: string,
  nodeMap: Map<string, FileNode>,
  roots: FileNode[],
  terminalIsDirectory: boolean,
): FileNode | undefined {
  const parts = path.split('/').filter(Boolean);
  let parentNode: FileNode | undefined;
  let currentNode: FileNode | undefined;

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const currentPath = parts.slice(0, index + 1).join('/');

    if (nodeMap.has(currentPath)) {
      currentNode = nodeMap.get(currentPath);
      parentNode = currentNode;
      continue;
    }

    const isTerminal = index === parts.length - 1;
    const newNode: FileNode = {
      name: part,
      path: currentPath,
      isDirectory: !isTerminal || terminalIsDirectory,
      children: [],
    };
    nodeMap.set(currentPath, newNode);

    if (parentNode) {
      parentNode.children.push(newNode);
    } else {
      roots.push(newNode);
    }

    currentNode = newNode;
    parentNode = newNode;
  }

  return currentNode;
}

function ensureDirectoryPath(path: string, nodeMap: Map<string, FileNode>, roots: FileNode[]): void {
  ensurePathNodes(path, nodeMap, roots, true);
}

async function filterDirectoryPaths(
  directoryPaths: string[],
  rootGitignoreMatchers: IgnoreMatcher[],
): Promise<string[]> {
  const results = await Promise.all(
    directoryPaths.map(async (path) => {
      const defaultIgnored = path.split('/').some((part) => IGNORED_DIRS.has(part));
      const gitignored = isIgnoredByGitignore(path, rootGitignoreMatchers, true);

      return !defaultIgnored && !gitignored ? path : null;
    }),
  );

  return results.filter((path): path is string => path !== null);
}

async function processZipFile(
  zipFile: File,
  limits: ZipSafetyLimits = DEFAULT_ZIP_SAFETY_LIMITS,
): Promise<ZipExtractionResult> {
  const zip = await JSZip.loadAsync(zipFile);
  const validation = validateZipStructure(zip, limits);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const files: File[] = [];
  const zipRoot = zipFile.name.replace(/\.zip$/i, '');
  const directoryCandidates = new Set<string>();
  const maxTotalBytes = limits.maxTotalUncompressedBytes ?? DEFAULT_ZIP_SAFETY_LIMITS.maxTotalUncompressedBytes;
  let totalExtractedBytes = 0;

  const validEntries: { entry: JSZip.JSZipObject; safePath: string }[] = [];

  for (const entry of Object.values(zip.files)) {
    const safePath = sanitizeZipEntryPath(entry.name);
    if (!safePath) {
      continue;
    }

    if (entry.dir) {
      directoryCandidates.add(`${zipRoot}/${safePath}`);
      continue;
    }

    const pathSegments = safePath.split('/');
    if (pathSegments.some((part) => IGNORED_DIRS.has(part))) {
      continue;
    }

    validEntries.push({ entry, safePath });
  }

  await runWithConcurrency(validEntries, DEFAULT_ZIP_CONCURRENCY, async ({ entry, safePath }) => {
    const blob = await entry.async('blob');
    totalExtractedBytes += blob.size;

    if (totalExtractedBytes > maxTotalBytes) {
      throw new Error(
        `ZIP extraction exceeded uncompressed size limit of ${Math.round(maxTotalBytes / 1024 / 1024)}MB.`,
      );
    }

    const fileName = safePath.split('/').pop() || safePath;
    const file = new File([blob], fileName, {
      type: blob.type,
      lastModified: entry.date.getTime(),
    });

    files.push(attachRelativePath(file, `${zipRoot}/${safePath}`));
  });

  const filePathSet = new Set(files.map((file) => getFilePath(file)));
  const emptyDirectoryPaths = [...directoryCandidates].filter((dirPath) => {
    const prefix = `${dirPath}/`;
    return ![...filePathSet].some((filePath) => filePath.startsWith(prefix));
  });

  return { files, emptyDirectoryPaths };
}

async function processImportFiles(
  files: File[],
  options: Required<ImportContextBuildOptions>,
): Promise<ProcessedFiles> {
  const fileContents: FileContent[] = [];
  const nodeMap = new Map<string, FileNode>();
  const roots: FileNode[] = [];
  const allNonZipFiles: File[] = [];
  const zipEmptyDirectoryPaths: string[] = [];

  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip') && shouldExpandZipFile(file)) {
      const unzipped = await processZipFile(file, options.zipSafetyLimits);
      allNonZipFiles.push(...unzipped.files);
      zipEmptyDirectoryPaths.push(...unzipped.emptyDirectoryPaths);
    } else {
      allNonZipFiles.push(file);
    }
  }

  const rootGitignoreMatchers = await buildRootGitignoreMatchers(allNonZipFiles, getFilePath);

  const validFilesWithDecision = await Promise.all(
    allNonZipFiles.map(async (file) => {
      const path = getFilePath(file);
      const defaultIgnored = path.split('/').some((part) => IGNORED_DIRS.has(part));
      const gitignored = isIgnoredByGitignore(path, rootGitignoreMatchers);

      return path && !defaultIgnored && !gitignored ? file : null;
    }),
  );

  const validFiles = validFilesWithDecision.filter((file): file is File => file !== null);

  for (const file of validFiles) {
    const path = getFilePath(file);
    const fileNode = ensurePathNodes(path, nodeMap, roots, false);
    if (!fileNode) {
      continue;
    }

    const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!isDocxFile(file) && IGNORED_EXTENSIONS.has(extension)) {
      fileNode.status = 'skipped';
      fileNode.chars = file.size;
      continue;
    }

    try {
      const { content, lineCount } = await readImportFileWithMetrics(file);
      fileContents.push({
        path,
        content,
        originalContent: content,
        language: getLanguage(file.name),
        stats: {
          lines: lineCount,
          chars: content.length,
          estimatedTokens: estimateTokens(content),
        },
        securityFindings: scanSensitiveContent(path, content),
      });
      fileNode.status = 'processed';
      fileNode.lines = lineCount;
      fileNode.chars = content.length;
    } catch {
      fileNode.status = 'error';
    }
  }

  fileContents.sort((a, b) => compareFilePaths(a.path, b.path));

  let rootNameForDisplay = 'Project';
  if (roots.length === 1 && roots[0].isDirectory) {
    rootNameForDisplay = roots[0].name;
  }

  const mergedEmptyDirectoryPaths = Array.from(
    new Set([...(options.emptyDirectoryPaths ?? []), ...zipEmptyDirectoryPaths]),
  );
  const filteredEmptyDirectoryPaths = options.includeEmptyDirectories
    ? await filterDirectoryPaths(mergedEmptyDirectoryPaths, rootGitignoreMatchers)
    : [];

  for (const emptyDirPath of filteredEmptyDirectoryPaths) {
    ensureDirectoryPath(emptyDirPath, nodeMap, roots);
  }

  sortTreeNodes(roots);

  const structureString = buildUnicodeTree(roots, rootNameForDisplay);
  const { analysisSummary, securityFindings } = summarizeAnalysis(fileContents);

  return {
    treeData: roots,
    fileContents,
    structureString,
    rootName: rootNameForDisplay,
    emptyDirectoryPaths: filteredEmptyDirectoryPaths,
    removedPaths: [],
    analysisSummary,
    securityFindings,
    exportMetadata: {
      usesDefaultIgnorePatterns: true,
      usesGitignorePatterns: rootGitignoreMatchers.length > 0,
      sortsByGitChangeCount: false,
    },
  };
}

function normalizeExportPaths(data: ProcessedFiles): ProcessedFiles {
  const stripRootPrefix = (path: string) => {
    const prefix = `${data.rootName}/`;
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
  };

  return {
    ...data,
    fileContents: data.fileContents.map((file) => ({
      ...file,
      path: stripRootPrefix(file.path),
    })),
    emptyDirectoryPaths: (data.emptyDirectoryPaths ?? []).map(stripRootPrefix),
  };
}

function toInputFileArray(inputs: File[] | FileList | PathFileInput[]): File[] {
  const items = Array.isArray(inputs) ? inputs : Array.from(inputs);

  return items.map((item) => {
    if ('file' in item && 'path' in item) {
      const { file, path } = item;
      return attachRelativePath(file, path);
    }

    return item as File;
  });
}

export async function buildImportContextFile(
  inputs: File[] | FileList | PathFileInput[],
  options: ImportContextBuildOptions = {},
): Promise<File> {
  const normalizedOptions: Required<ImportContextBuildOptions> = {
    includeEmptyDirectories: options.includeEmptyDirectories ?? false,
    emptyDirectoryPaths: options.emptyDirectoryPaths ?? [],
    zipSafetyLimits: options.zipSafetyLimits ?? DEFAULT_ZIP_SAFETY_LIMITS,
  };
  const files = toInputFileArray(inputs);
  const processed = await processImportFiles(files, normalizedOptions);
  const normalizedData = normalizeExportPaths(processed);
  const output = generateRepomixPlainOutput(normalizedData, {
    includeFileSummary: true,
    includeDirectoryStructure: true,
    includeFiles: true,
  });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return new File([output], `${processed.rootName}-context-${timestamp}.txt`, { type: 'text/plain' });
}

export async function generateZipContext(zipFile: File, options: ImportContextBuildOptions = {}): Promise<File> {
  return buildImportContextFile([zipFile], options);
}
