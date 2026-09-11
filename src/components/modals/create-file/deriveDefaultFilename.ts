/**
 * Formats a Date object into a filesystem-safe, human-readable timestamp filename stem:
 * YYYY-MM-DD_HH-mm-ss (e.g., 2026-09-10_20-15-30)
 */
export const formatTimestampFilename = (date: Date = new Date()): string => {
  const targetDate = isNaN(date.getTime()) ? new Date() : date;
  const pad = (num: number) => String(num).padStart(2, '0');
  const year = targetDate.getFullYear();
  const month = pad(targetDate.getMonth() + 1);
  const day = pad(targetDate.getDate());
  const hours = pad(targetDate.getHours());
  const minutes = pad(targetDate.getMinutes());
  const seconds = pad(targetDate.getSeconds());

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
};

/**
 * Standard default filename generator. Content-based title guessing is disabled
 * in favor of consistent, conflict-free timestamp naming.
 */
export const deriveDefaultFilename = (dateOrContent?: Date | string): string => {
  if (dateOrContent instanceof Date) {
    return formatTimestampFilename(dateOrContent);
  }
  return formatTimestampFilename();
};
