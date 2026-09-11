import { formatTimestamp } from '@/utils/media-nav/timestamp';

/**
 * Formats a duration as m:ss, switching to h:mm:ss once it reaches an hour so
 * long recordings (the recorder allows up to one hour) never render as "61:05".
 */
export const formatClockTime = (seconds: number): string => formatTimestamp(seconds, { padMinutes: false });
