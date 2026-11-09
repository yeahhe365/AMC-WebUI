import crypto from 'node:crypto';

/**
 * Cookie-based session for the deployment access password.
 *
 * A browser cannot attach headers to a WebSocket handshake, so a Live API
 * connection over `/api/live` carries no `x-access-token` and is rejected as
 * soon as ACCESS_PASSWORD is set. In Docker the `web` container's WS bridge
 * re-emits the handshake and can inject the header itself, but a static
 * frontend served by a reverse proxy in front of the API has no such bridge —
 * that deployment needs a channel the browser supplies automatically, which for
 * a WS upgrade means a cookie.
 *
 * The cookie does not carry the password: it carries an HMAC of it under a
 * fixed label, so reading the cookie does not reveal the secret and the value
 * is not replayable against any other service.
 */
export const ACCESS_COOKIE_NAME = 'amc_access';

const ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;

const COOKIE_LABEL = 'amc-webui-access-cookie-v1';

/** Derives the cookie value for a password. Returns null without a password. */
const deriveAccessCookieValue = (accessPassword: string | undefined): string | null => {
  if (!accessPassword) {
    return null;
  }
  return crypto.createHmac('sha256', accessPassword).update(COOKIE_LABEL).digest('hex');
};

/**
 * Compares a presented cookie value against the one the current password
 * derives, in constant time.
 */
export const timingSafeCookieEqual = (provided: string | undefined, accessPassword: string | undefined): boolean => {
  const expected = deriveAccessCookieValue(accessPassword);
  if (!provided || !expected) {
    return false;
  }
  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
};

export interface AccessCookieOptions {
  /** The request arrived over TLS (or a proxy reported https). */
  secure: boolean;
  /**
   * The frontend is on another site, so the cookie has to be sent on a
   * cross-site WS upgrade. Browsers only allow that with `SameSite=None`, which
   * they in turn only accept together with `Secure`.
   */
  crossSite: boolean;
}

const sameSiteAttribute = ({ secure, crossSite }: AccessCookieOptions): string =>
  crossSite && secure ? 'SameSite=None' : 'SameSite=Lax';

export const buildAccessCookieHeader = (
  accessPassword: string | undefined,
  options: AccessCookieOptions,
): string | null => {
  const value = deriveAccessCookieValue(accessPassword);
  if (!value) {
    return null;
  }
  const attributes = [
    `${ACCESS_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    sameSiteAttribute(options),
    `Max-Age=${ACCESS_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (options.secure) {
    attributes.push('Secure');
  }
  return attributes.join('; ');
};

export const buildAccessCookieClearHeader = (options: AccessCookieOptions): string => {
  const attributes = [`${ACCESS_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', sameSiteAttribute(options), 'Max-Age=0'];
  if (options.secure) {
    attributes.push('Secure');
  }
  return attributes.join('; ');
};

/** Reads one cookie value out of a raw `Cookie` header. */
export const readCookieValue = (cookieHeader: string | undefined, name: string): string | undefined => {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return undefined;
};
