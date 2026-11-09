import type { IncomingMessage, ServerResponse } from 'node:http';

export function getCorsHeaders(request: IncomingMessage, allowedOrigins: string[]): Record<string, string> {
  if (!allowedOrigins.length) {
    return {};
  }

  const origin = request.headers.origin;
  if (!origin) {
    return {};
  }

  const isAllowed = allowedOrigins.includes('*') || allowedOrigins.includes(origin);
  if (!isAllowed) {
    return {};
  }

  // A cross-origin frontend that authenticates with the access cookie needs
  // `access-control-allow-credentials`, which browsers reject alongside a `*`
  // origin — so the caller's origin is echoed even when the allowlist is `*`.
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  };
}

export function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
  allowedOrigins: string[],
  extraHeaders: string[] = [],
): void {
  if (response.headersSent || response.destroyed) {
    response.destroy();
    return;
  }

  const corsHeaders = getCorsHeaders(request, allowedOrigins);
  const headers: Record<string, string | string[]> = {
    ...corsHeaders,
    'content-type': 'application/json; charset=utf-8',
  };
  // Set-Cookie repeats rather than joins, so it is appended as an array.
  if (extraHeaders.length > 0) {
    headers['set-cookie'] = extraHeaders;
  }
  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(body));
}
