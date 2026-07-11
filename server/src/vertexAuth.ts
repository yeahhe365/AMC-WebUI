import { GoogleAuth } from 'google-auth-library';

const TOKEN_REFRESH_LEEWAY_MS = 5 * 60 * 1000;
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

export interface VertexAccessTokenProvider {
  getAccessToken(): Promise<string>;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

interface GoogleAuthLike {
  getAccessToken(): Promise<string | null | undefined | { token?: string | null; res?: unknown }>;
  getClient(): Promise<{
    credentials?: { expiry_date?: number | null };
  }>;
}

interface CreateVertexAuthOptions {
  auth?: GoogleAuthLike;
  now?: () => number;
}

export function createVertexAuth(options: CreateVertexAuthOptions = {}): VertexAccessTokenProvider {
  const auth = options.auth ?? (new GoogleAuth({ scopes: DEFAULT_SCOPES }) as unknown as GoogleAuthLike);
  const now = options.now ?? (() => Date.now());

  let cached: CachedToken | null = null;
  let inflight: Promise<CachedToken> | null = null;

  const fetchFreshToken = async (): Promise<CachedToken> => {
    const tokenResult = await auth.getAccessToken();
    const token = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token;
    if (!token) {
      throw new Error('Vertex auth returned an empty access token.');
    }

    const client = await auth.getClient();
    const expiryFromCredentials = client.credentials?.expiry_date;
    const expiresAtMs =
      typeof expiryFromCredentials === 'number' && expiryFromCredentials > 0
        ? expiryFromCredentials
        : now() + 55 * 60 * 1000;

    return { token, expiresAtMs };
  };

  return {
    async getAccessToken(): Promise<string> {
      if (cached && cached.expiresAtMs - now() > TOKEN_REFRESH_LEEWAY_MS) {
        return cached.token;
      }

      if (!inflight) {
        inflight = fetchFreshToken()
          .then((next) => {
            cached = next;
            return next;
          })
          .finally(() => {
            inflight = null;
          });
      }

      const result = await inflight;
      return result.token;
    },
  };
}
