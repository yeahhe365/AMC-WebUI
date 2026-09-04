/** Parse "mm:ss" / "hh:mm:ss" / raw seconds into seconds. Returns null when unparsable. */
export const parseTimestamp = (raw: string | number | undefined | null): number | null => {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : null;

  const value = raw.trim();
  if (!/^\d{1,2}(:\d{1,2}){0,2}$/.test(value)) return null;
  const parts = value.split(':').map((segment) => Number.parseInt(segment, 10));
  if (parts.some((segment) => Number.isNaN(segment))) return null;

  const [seconds, minutes = 0, hours = 0] = [...parts].reverse();
  const total = hours * 3600 + minutes * 60 + seconds;
  return total;
};

/** Format seconds as "mm:ss" (below an hour) or "hh:mm:ss". */
export const formatTimestamp = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
};
