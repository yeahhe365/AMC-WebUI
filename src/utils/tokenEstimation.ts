import { MediaResolution } from '@/types';
import { isGemini3Model } from './model/modelCapabilities';
import { isVideoMimeType } from './file/fileTypeClassification';
import { probeMediaDuration } from '@/utils/media/mediaDuration';

// Token cost per video frame for Gemini 3 models, by media resolution.
// Source: https://ai.google.dev/gemini-api/docs/media-resolution
// ponytail: ultra_high is N/A for video (downgraded to high upstream in
// builder.ts#normalizePartMediaResolution), mirrored here as a safety net.
const VIDEO_TOKENS_PER_FRAME_GEMINI_3: Record<MediaResolution, number> = {
  [MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED]: 70,
  [MediaResolution.MEDIA_RESOLUTION_LOW]: 70,
  [MediaResolution.MEDIA_RESOLUTION_MEDIUM]: 70,
  [MediaResolution.MEDIA_RESOLUTION_HIGH]: 280,
  [MediaResolution.MEDIA_RESOLUTION_ULTRA_HIGH]: 280,
};

// Earlier Gemini models (2.5 / 2.0 / 1.5) document ~263 tokens/second at the
// default media resolution. Per-resolution figures aren't published for them,
// so this is a flat rate. ponytail: only documented figure; refine if Google
// publishes a per-level table for legacy models.
const VIDEO_TOKENS_PER_SECOND_LEGACY = 263;

const DEFAULT_VIDEO_FPS = 1;

/** "10s" / "10.5s" → 10 / 10.5. Returns null for anything else. */
export const parseOffsetSeconds = (offset?: string): number | null => {
  if (!offset) return null;
  const match = offset.trim().match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : null;
};

/** ultra_high is invalid for video (API returns N/A) — fall back to high. */
const normalizeResolutionForVideo = (resolution: MediaResolution): MediaResolution =>
  resolution === MediaResolution.MEDIA_RESOLUTION_ULTRA_HIGH ? MediaResolution.MEDIA_RESOLUTION_HIGH : resolution;

export const estimateVideoTokens = (
  durationSeconds: number,
  modelId: string,
  mediaResolution: MediaResolution,
  fps?: number,
): number => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const effectiveFps = fps && fps > 0 ? fps : DEFAULT_VIDEO_FPS;
  const resolution = normalizeResolutionForVideo(mediaResolution);

  if (isGemini3Model(modelId)) {
    const perFrame = VIDEO_TOKENS_PER_FRAME_GEMINI_3[resolution] ?? 70;
    return Math.ceil(durationSeconds * effectiveFps * perFrame);
  }

  return Math.ceil(durationSeconds * VIDEO_TOKENS_PER_SECOND_LEGACY);
};

interface VideoDurationSource {
  rawFile?: File | Blob;
  dataUrl?: string;
  videoMetadata?: { startOffset?: string; endOffset?: string; fps?: number };
}

/**
 * Resolves the analysable duration (seconds) of a video file, honouring the
 * start/end offsets when set. Returns null when no local blob is available
 * (e.g. YouTube links, already-uploaded fileUri-only records).
 */
const getVideoDurationSeconds = async (file: VideoDurationSource): Promise<number | null> => {
  const start = parseOffsetSeconds(file.videoMetadata?.startOffset);
  const end = parseOffsetSeconds(file.videoMetadata?.endOffset);
  if (start !== null && end !== null && end > start) return end - start;

  let blob: Blob | null = file.rawFile ?? null;
  if (!blob && file.dataUrl) {
    try {
      blob = await fetch(file.dataUrl).then((r) => r.blob());
    } catch {
      blob = null;
    }
  }
  if (!blob) return null;

  const fullDuration = await probeMediaDuration('video', blob);
  if (fullDuration === null) return null;
  if (start !== null) return Math.max(0, fullDuration - start);
  if (end !== null) return Math.min(fullDuration, end);
  return fullDuration;
};

interface VideoTokenEstimateInput extends VideoDurationSource {
  type: string;
  mediaResolution?: MediaResolution;
}

/**
 * Sums estimated video tokens across the given files. Non-video files and
 * files whose duration can't be read locally are skipped (contribute 0).
 * Returns 0 when there are no estimable videos.
 */
export const estimateVideoTokensForFiles = async (
  files: VideoTokenEstimateInput[],
  modelId: string,
  globalResolution: MediaResolution,
): Promise<number> => {
  const videoFiles = files.filter((f) => isVideoMimeType(f.type));
  if (videoFiles.length === 0) return 0;

  const estimates = await Promise.all(
    videoFiles.map(async (f) => {
      const duration = await getVideoDurationSeconds(f);
      if (duration === null) return 0;
      const resolution = normalizeResolutionForVideo(f.mediaResolution ?? globalResolution);
      return estimateVideoTokens(duration, modelId, resolution, f.videoMetadata?.fps);
    }),
  );

  return estimates.reduce((sum, n) => sum + n, 0);
};
