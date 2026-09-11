import { isYoutubeUrl } from './file/youtubeUrl';

export const MAX_URL_CONTEXT_COUNT = 20;
export const MAX_URL_CONTENT_SIZE_MB = 34;

export type UrlWarningType = 'localhost' | 'youtube' | 'invalid_protocol' | 'invalid_format';

export interface ParsedUrlItem {
  raw: string;
  normalizedUrl: string | null;
  isValid: boolean;
  isLocalOrPrivate: boolean;
  isYoutube: boolean;
  domain: string;
  warningType?: UrlWarningType;
}

const TUNNEL_DOMAIN_SUFFIXES = [
  '.ngrok.io',
  '.ngrok-free.app',
  '.ngrok.app',
  '.pinggy.link',
  '.loca.lt',
  '.localxpose.io',
];

/**
 * Determines whether a given URL points to localhost, private intranet IP,
 * link-local address, or known tunneling service (which Gemini URL Context cannot access).
 */
export const isLocalOrPrivateUrl = (input: string | URL): boolean => {
  let hostname = '';
  try {
    const urlObj = typeof input === 'string' ? new URL(input) : input;
    hostname = urlObj.hostname.toLowerCase();
  } catch {
    return false;
  }

  // Remove surrounding brackets from IPv6 hostnames
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  // Localhost names
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return true;
  }

  // IPv4 loopback & special
  if (hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.startsWith('127.')) {
    return true;
  }

  // IPv4 RFC 1918 Private Ranges & RFC 3927 Link-Local
  // 10.0.0.0/8
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }
  // 172.16.0.0/12
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }
  // 192.168.0.0/16
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }
  // 169.254.0.0/16 (link-local)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  // IPv6 loopback, link-local, or unique local
  if (
    hostname === '::1' ||
    hostname === '0:0:0:0:0:0:0:1' ||
    hostname.startsWith('fe80:') ||
    hostname.startsWith('fc00:') ||
    hostname.startsWith('fd00:')
  ) {
    return true;
  }

  // Tunneling services
  if (TUNNEL_DOMAIN_SUFFIXES.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix))) {
    return true;
  }

  return false;
};

/**
 * Checks whether the URL protocol is supported (http or https).
 */
export const isSupportedProtocol = (input: string | URL): boolean => {
  try {
    const urlObj = typeof input === 'string' ? new URL(input) : input;
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Formats a URL for clean, informative display: domain.com/path (omitting www. and trailing slash).
 */
export const formatUrlDisplay = (url: string): string => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${host}${path}${parsed.search}`;
  } catch {
    return url;
  }
};

/**
 * Normalizes user input string: trims whitespace and adds https:// if protocol is omitted.
 */
export const normalizeUrlCandidate = (candidate: string): string => {
  const trimmed = candidate.trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

/**
 * Validates a single URL candidate string according to Gemini URL Context requirements.
 */
export const validateUrlItem = (raw: string): ParsedUrlItem => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      raw,
      normalizedUrl: null,
      isValid: false,
      isLocalOrPrivate: false,
      isYoutube: false,
      domain: '',
      warningType: 'invalid_format',
    };
  }

  const normalized = normalizeUrlCandidate(trimmed);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    return {
      raw,
      normalizedUrl: null,
      isValid: false,
      isLocalOrPrivate: false,
      isYoutube: false,
      domain: '',
      warningType: 'invalid_format',
    };
  }

  if (!isSupportedProtocol(parsedUrl)) {
    return {
      raw,
      normalizedUrl: parsedUrl.href,
      isValid: false,
      isLocalOrPrivate: false,
      isYoutube: false,
      domain: parsedUrl.hostname,
      warningType: 'invalid_protocol',
    };
  }

  const isLocal = isLocalOrPrivateUrl(parsedUrl);
  const isYt = isYoutubeUrl(parsedUrl.href);
  const domain = parsedUrl.hostname.replace(/^www\./, '');

  let warningType: UrlWarningType | undefined;
  if (isLocal) {
    warningType = 'localhost';
  } else if (isYt) {
    warningType = 'youtube';
  }

  const isValid = !isLocal && !isYt;

  return {
    raw,
    normalizedUrl: parsedUrl.href,
    isValid,
    isLocalOrPrivate: isLocal,
    isYoutube: isYt,
    domain,
    warningType,
  };
};

/**
 * Parses multiline, comma-delimited, or space-separated URLs, validating and deduplicating them.
 */
export const parseAndValidateUrlList = (
  rawText: string,
): {
  items: ParsedUrlItem[];
  validUrls: string[];
  hasLimitWarning: boolean;
  totalCount: number;
} => {
  if (!rawText.trim()) {
    return { items: [], validUrls: [], hasLimitWarning: false, totalCount: 0 };
  }

  // Split on newlines, commas, or semicolons
  const candidates = rawText
    .split(/[\n,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const seenNormalized = new Set<string>();
  const items: ParsedUrlItem[] = [];
  const validUrls: string[] = [];

  for (const candidate of candidates) {
    const item = validateUrlItem(candidate);
    const key = (item.normalizedUrl || candidate).toLowerCase();

    if (seenNormalized.has(key)) {
      continue;
    }
    seenNormalized.add(key);
    items.push(item);

    if (item.isValid && item.normalizedUrl) {
      validUrls.push(item.normalizedUrl);
    }
  }

  return {
    items,
    validUrls,
    hasLimitWarning: validUrls.length > MAX_URL_CONTEXT_COUNT,
    totalCount: items.length,
  };
};
