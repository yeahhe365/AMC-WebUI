const RECORDING_FILE_NAME_REGEX = /^recording-\d{4}-\d{2}-\d{2}-(\d{2})(\d{2})(\d{2})(\.[^.]+)$/;

/**
 * Formats recording file names from `recording-YYYY-MM-DD-HHMMSS.ext` to `rec-HH:MM:SS.ext`.
 * Returns other file names unchanged.
 */
export const formatDisplayFileName = (fileName: string): string => {
  const recordingMatch = fileName.match(RECORDING_FILE_NAME_REGEX);
  if (recordingMatch) {
    return `rec-${recordingMatch[1]}:${recordingMatch[2]}:${recordingMatch[3]}${recordingMatch[4]}`;
  }
  return fileName;
};
