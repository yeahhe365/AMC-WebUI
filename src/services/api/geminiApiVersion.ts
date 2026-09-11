import type { HttpOptions, Part } from '@google/genai';

export type GeminiClientHttpOptions = Pick<HttpOptions, 'apiVersion' | 'baseUrl' | 'headers' | 'timeout'>;

// Per-part media resolution is supported in the standard v1beta API version used
// by the @google/genai SDK by default. No v1alpha override is needed.
export const getHttpOptionsForContents = (
  _contents: Array<{ parts?: Part[] }>,
): GeminiClientHttpOptions | undefined => {
  return undefined;
};

// Merge an arbitrary set of extra HTTP headers (e.g. the stream-journal
// x-amc-job-id / x-amc-last-seq) into an existing httpOptions object without
// clobbering the apiVersion / baseUrl that media-resolution routing depends on.
export const withHttpOptionHeaders = (
  httpOptions: GeminiClientHttpOptions | undefined,
  headers?: Record<string, string>,
): GeminiClientHttpOptions | undefined => {
  if (!headers || Object.keys(headers).length === 0) {
    return httpOptions;
  }
  return {
    ...(httpOptions ?? {}),
    headers: { ...(httpOptions?.headers ?? {}), ...headers },
  };
};
