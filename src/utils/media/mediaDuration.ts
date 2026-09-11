/** Upper bound for reading metadata so a stalled decoder cannot hang the application. */
const DEFAULT_MEDIA_DURATION_PROBE_TIMEOUT_MS = 3_000;

export type ProbeMediaType = 'audio' | 'video';

/**
 * Best-effort media duration probe via a detached <audio> or <video> element.
 * Returns null when the duration cannot be determined (unsupported codec,
 * missing metadata, non-browser environment) so callers can skip guards
 * instead of blocking the pipeline.
 */
export const probeMediaDuration = async (
  type: ProbeMediaType,
  file: File | Blob,
  timeoutMs: number = DEFAULT_MEDIA_DURATION_PROBE_TIMEOUT_MS,
): Promise<number | null> => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return null;
  }

  if (type === 'audio' && typeof Audio === 'undefined') {
    return null;
  }

  let objectUrl: string;
  try {
    objectUrl = URL.createObjectURL(file);
  } catch {
    return null;
  }

  try {
    return await new Promise<number | null>((resolve) => {
      const element: HTMLMediaElement = type === 'audio' ? new Audio() : document.createElement('video');
      let settled = false;

      const settle = (value: number | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        try {
          element.removeAttribute('src');
        } catch {
          // Ignore removal error
        }
        resolve(value);
      };

      const timeoutId = window.setTimeout(() => settle(null), timeoutMs);

      element.preload = 'metadata';
      element.addEventListener('loadedmetadata', () => {
        settle(Number.isFinite(element.duration) && element.duration > 0 ? element.duration : null);
      });
      element.addEventListener('error', () => settle(null));
      element.src = objectUrl;
    });
  } catch {
    return null;
  } finally {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Ignore revocation error
    }
  }
};
