/** Upper bound for reading metadata so a stalled decoder cannot hang the send pipeline. */
const DURATION_PROBE_TIMEOUT_MS = 3_000;

/**
 * Best-effort audio duration probe via a detached <audio> element.
 * Returns null when the duration cannot be determined (unsupported codec,
 * missing metadata, non-browser environment) so callers can skip guards
 * instead of blocking the pipeline.
 */
export const getAudioDurationSeconds = async (file: File | Blob): Promise<number | null> => {
  if (typeof window === 'undefined' || typeof URL?.createObjectURL !== 'function' || typeof Audio === 'undefined') {
    return null;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<number | null>((resolve) => {
      const audio = new Audio();
      let settled = false;

      const settle = (value: number | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        audio.removeAttribute('src');
        resolve(value);
      };

      const timeoutId = window.setTimeout(() => settle(null), DURATION_PROBE_TIMEOUT_MS);

      audio.preload = 'metadata';
      audio.addEventListener('loadedmetadata', () => {
        settle(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
      });
      audio.addEventListener('error', () => settle(null));
      audio.src = objectUrl;
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
