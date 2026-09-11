/**
 * Computes a deterministic 32-bit polynomial rolling hash of a string,
 * returning a compact unsigned base-36 representation.
 */
export const hashString = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};
