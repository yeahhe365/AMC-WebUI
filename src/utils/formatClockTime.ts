const SECONDS_PER_HOUR = 3600;

/**
 * Formats a duration as m:ss, switching to h:mm:ss once it reaches an hour so
 * long recordings (the recorder allows up to one hour) never render as "61:05".
 */
export const formatClockTime = (seconds: number): string => {
  if (!seconds || Number.isNaN(seconds) || !Number.isFinite(seconds)) return '0:00';

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / 60);
  const remainingSeconds = totalSeconds % 60;
  const paddedSeconds = remainingSeconds.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
};
