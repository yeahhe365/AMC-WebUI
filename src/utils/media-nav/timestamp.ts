/** Parse "mm:ss" / "hh:mm:ss" / raw seconds into seconds. Returns null when unparsable. */
export const parseTimestamp = (raw: string | number | undefined | null): number | null => {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : null;

  const value = raw.trim();
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const num = Number.parseFloat(value);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : null;
  }

  if (!/^\d{1,4}(?::\d{1,2}){1,2}(?:\.\d+)?$/.test(value)) return null;
  const parts = value.split(':').map((segment) => Number.parseFloat(segment));
  if (parts.some((segment) => Number.isNaN(segment))) return null;

  const [seconds, minutes = 0, hours = 0] = [...parts].reverse();
  if (seconds >= 60) return null;
  if (parts.length > 2 && minutes >= 60) return null;

  const total = hours * 3600 + minutes * 60 + seconds;
  return Math.floor(total);
};

export interface FormatTimestampOptions {
  /**
   * Whether to zero-pad minutes when duration is under an hour (e.g. "03:25" vs "3:25").
   * Defaults to true for standard timestamp formatting ("00:00", "03:25").
   * Set to false for clock/player time displays ("0:00", "3:25").
   */
  padMinutes?: boolean;
}

/** Format seconds as "mm:ss" / "m:ss" (below an hour) or "h:mm:ss". */
export const formatTimestamp = (totalSeconds: number | null | undefined, options?: FormatTimestampOptions): string => {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return options?.padMinutes === false ? '0:00' : '00:00';
  }
  const safeSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  const minutesFormatted = options?.padMinutes === false && hours === 0 ? String(minutes) : pad(minutes);

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutesFormatted}:${pad(seconds)}`;
};
