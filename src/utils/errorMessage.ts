export const getErrorMessage = (error: unknown, fallbackMessage?: string): string => {
  if (error instanceof Error) {
    return error.message || fallbackMessage || '';
  }
  if (error === undefined || error === null) {
    return fallbackMessage ?? '';
  }
  const str = String(error);
  return str || (fallbackMessage ?? '');
};

export const toError = (error: unknown, fallbackMessage?: string): Error => {
  if (error instanceof Error) return error;
  const str = error === undefined || error === null ? '' : String(error);
  return new Error(str || fallbackMessage || 'Unknown error');
};

/**
 * Reads an error message from an HTTP response body. Tries `{ error: { message } }`
 * (Anthropic / OpenAI-compatible shape), then `{ error: string }` (MCP shape),
 * falling back to the raw body, then to a status-only summary. Used by every
 * provider API client + the MCP client — keep the fallback ladder intact.
 */
export const readResponseErrorMessage = async (response: Response, fallbackLabel: string): Promise<string> => {
  const text = await response.text();
  if (!text) {
    return `${fallbackLabel} failed with status ${response.status}`;
  }
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    const error = parsed.error;
    if (typeof error === 'string') return error || text;
    if (error && typeof error.message === 'string') return error.message;
    return text;
  } catch {
    return text;
  }
};
