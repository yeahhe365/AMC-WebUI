export interface VideoDisplayRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Computes the exact rendered content rectangle of a video inside its container
 * following the standard CSS `object-fit: contain` algorithm.
 *
 * Eliminates pillarbox and letterbox offsets so that normalized coordinates
 * (0-1000) land pixel-perfectly on the actual visible video content.
 */
export const computeContainedVideoRect = (
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): VideoDisplayRect => {
  if (!containerWidth || !containerHeight || !videoWidth || !videoHeight) {
    return {
      top: 0,
      left: 0,
      width: Math.max(0, containerWidth || 0),
      height: Math.max(0, containerHeight || 0),
    };
  }

  const containerRatio = containerWidth / containerHeight;
  const videoRatio = videoWidth / videoHeight;

  if (videoRatio > containerRatio) {
    // Video is wider than container: constrained by container width, letterbox bars on top & bottom
    const width = containerWidth;
    const height = containerWidth / videoRatio;
    const top = (containerHeight - height) / 2;
    return { top, left: 0, width, height };
  }

  // Video is taller or equal ratio to container: constrained by container height, pillarbox bars on left & right
  const height = containerHeight;
  const width = containerHeight * videoRatio;
  const left = (containerWidth - width) / 2;
  return { top: 0, left, width, height };
};
