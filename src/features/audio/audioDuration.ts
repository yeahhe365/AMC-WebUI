import { probeMediaDuration } from '@/utils/media/mediaDuration';

/**
 * Best-effort audio duration probe via a detached <audio> element.
 * Returns null when the duration cannot be determined (unsupported codec,
 * missing metadata, non-browser environment) so callers can skip guards
 * instead of blocking the pipeline.
 */
export const getAudioDurationSeconds = (file: File | Blob): Promise<number | null> => probeMediaDuration('audio', file);
