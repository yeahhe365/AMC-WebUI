/**
 * Safely parses a JSON string, returning a fallback value if parsing fails
 * or if the input is null, undefined, or empty.
 *
 * @param raw The raw JSON string to parse.
 * @param fallback The fallback value to return on failure or empty input.
 * @returns Parsed JSON or fallback.
 */
export const safeJsonParse = <T>(raw: string | null | undefined, fallback: T): T => {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }

  try {
    const result = JSON.parse(raw);
    return result ?? fallback;
  } catch {
    return fallback;
  }
};
