import { getErrorMessage } from '@/utils/errorMessage';

/**
 * Substitutes `{name}` placeholders in a translation template. Only bare word
 * placeholders are replaced, so non-i18n braces (e.g. inline CSS snippets)
 * survive untouched. Unknown placeholders are left as-is.
 */
export const interpolate = (template: string, params: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );

/** Formats an error-translation key with the extracted error message. */
export const formatI18nErrorMessage = <K extends string>(t: (key: K) => string, key: K, error: unknown): string =>
  interpolate(t(key), { message: getErrorMessage(error) });
