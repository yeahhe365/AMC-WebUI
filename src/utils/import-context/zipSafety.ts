import type JSZip from 'jszip';

export interface ZipSafetyLimits {
  maxEntries?: number;
  maxTotalUncompressedBytes?: number;
  maxSingleFileBytes?: number;
  maxCompressionRatio?: number;
}

export const DEFAULT_ZIP_SAFETY_LIMITS: Required<ZipSafetyLimits> = {
  maxEntries: 2500,
  maxTotalUncompressedBytes: 150 * 1024 * 1024, // 150MB
  maxSingleFileBytes: 50 * 1024 * 1024, // 50MB
  maxCompressionRatio: 100,
};

export const DEFAULT_ZIP_CONCURRENCY = 16;

/**
 * Sanitizes a ZIP entry path to prevent Zip Slip directory traversal attacks.
 * Rejects absolute paths, Windows drive letters, null bytes, and traversal segments ('..').
 * Returns the normalized relative path or null if unsafe.
 */
export function sanitizeZipEntryPath(entryPath: string): string | null {
  if (!entryPath || typeof entryPath !== 'string') {
    return null;
  }

  // Normalize backslashes to forward slashes
  const normalized = entryPath.replace(/\\/g, '/');

  // Reject absolute paths and Windows drive letters (e.g. /etc/passwd, C:/windows)
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return null;
  }

  const rawSegments = normalized.split('/');
  const safeSegments: string[] = [];

  for (const segment of rawSegments) {
    if (segment === '' || segment === '.') {
      continue;
    }

    // Explicit path traversal attempt
    if (segment === '..') {
      return null;
    }

    // Reject null bytes or dangerous control characters
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(segment)) {
      return null;
    }

    safeSegments.push(segment);
  }

  return safeSegments.length > 0 ? safeSegments.join('/') : null;
}

export interface ZipStructureValidationResult {
  valid: boolean;
  reason?: string;
  entryCount: number;
  estimatedTotalBytes: number;
}

/**
 * Validates zip entries against zip bomb and size/count thresholds before bulk extraction.
 */
export function validateZipStructure(
  zip: JSZip,
  limits: ZipSafetyLimits = DEFAULT_ZIP_SAFETY_LIMITS,
): ZipStructureValidationResult {
  const maxEntries = limits.maxEntries ?? DEFAULT_ZIP_SAFETY_LIMITS.maxEntries;
  const maxTotalBytes = limits.maxTotalUncompressedBytes ?? DEFAULT_ZIP_SAFETY_LIMITS.maxTotalUncompressedBytes;
  const maxSingleFileBytes = limits.maxSingleFileBytes ?? DEFAULT_ZIP_SAFETY_LIMITS.maxSingleFileBytes;
  const maxRatio = limits.maxCompressionRatio ?? DEFAULT_ZIP_SAFETY_LIMITS.maxCompressionRatio;

  const entries = Object.values(zip.files);
  const entryCount = entries.length;

  if (entryCount > maxEntries) {
    return {
      valid: false,
      reason: `ZIP archive contains ${entryCount} entries, exceeding the maximum safe limit of ${maxEntries}.`,
      entryCount,
      estimatedTotalBytes: 0,
    };
  }

  let estimatedTotalBytes = 0;

  for (const entry of entries) {
    const zipData =
      '_data' in entry
        ? (entry as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data
        : undefined;
    const uncompressedSize = zipData?.uncompressedSize;
    const compressedSize = zipData?.compressedSize;

    if (typeof uncompressedSize === 'number' && Number.isFinite(uncompressedSize)) {
      if (uncompressedSize > maxSingleFileBytes) {
        return {
          valid: false,
          reason: `ZIP entry "${entry.name}" exceeds single file size limit (${Math.round(uncompressedSize / 1024 / 1024)}MB > ${Math.round(maxSingleFileBytes / 1024 / 1024)}MB).`,
          entryCount,
          estimatedTotalBytes,
        };
      }

      estimatedTotalBytes += uncompressedSize;
      if (estimatedTotalBytes > maxTotalBytes) {
        return {
          valid: false,
          reason: `ZIP archive total uncompressed size exceeds limit of ${Math.round(maxTotalBytes / 1024 / 1024)}MB.`,
          entryCount,
          estimatedTotalBytes,
        };
      }

      if (
        typeof compressedSize === 'number' &&
        compressedSize > 0 &&
        uncompressedSize > 10 * 1024 * 1024 &&
        uncompressedSize / compressedSize > maxRatio
      ) {
        return {
          valid: false,
          reason: `ZIP entry "${entry.name}" has an anomalously high compression ratio (${Math.round(uncompressedSize / compressedSize)}x), indicating a potential zip bomb.`,
          entryCount,
          estimatedTotalBytes,
        };
      }
    }
  }

  return {
    valid: true,
    entryCount,
    estimatedTotalBytes,
  };
}

/**
 * Runs async operations with controlled concurrency to prevent browser out-of-memory crashes.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await task(items[currentIndex], currentIndex);
    }
  };

  const pool = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(pool);
  return results;
}
