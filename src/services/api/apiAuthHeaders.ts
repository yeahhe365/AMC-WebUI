import { useSettingsStore } from '@/stores/settingsStore';

export const getServerAccessPassword = (): string | null => {
  try {
    return useSettingsStore.getState().appSettings.serverAccessPassword?.trim() || null;
  } catch {
    return null;
  }
};

/**
 * 部署访问口令对应的请求头。
 *
 * 只使用 `x-access-token` 这一个专用通道,刻意**不再**附带 `authorization: Bearer <口令>`:
 * 第三方服务商线路(OpenAI 兼容)把 `authorization` 当作自己的 API Key 通道,而
 * `requestFactory` 里这几个头是展开在 provider 认证头之后的,一旦这里也写
 * `authorization`,部署口令就会覆盖掉用户真实的 provider key,被当成 API Key 发往
 * 上游厂商(既是"开了口令就全挂",也是口令泄露)。服务端 `isAuthorized` 同时接受
 * `authorization: Bearer` 与 `x-access-token`,所以去掉前者不影响鉴权。
 */
export const getServerAuthHeaders = (passwordOverride?: string | null): Record<string, string> => {
  const token = passwordOverride !== undefined ? passwordOverride?.trim() || null : getServerAccessPassword();
  if (!token) {
    return {};
  }
  return {
    'x-access-token': token,
  };
};

export const verifyServerAccessPassword = async (
  password: string,
  customBaseUrl?: string,
): Promise<{ ok: boolean; message?: string }> => {
  const trimmed = password.trim();
  if (!trimmed) {
    return { ok: false, message: 'Password cannot be empty' };
  }
  const base = customBaseUrl?.replace(/\/+$/, '') || '';
  const url = `${base}/api/auth/verify`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getServerAuthHeaders(trimmed),
    });
    if (response.status === 200) {
      return { ok: true };
    }
    if (response.status === 401) {
      return { ok: false, message: 'Invalid access password' };
    }
    return { ok: false, message: `Server returned status ${response.status}` };
  } catch (verifyError) {
    const connectionErrorMessage = verifyError instanceof Error ? verifyError.message : String(verifyError);
    return { ok: false, message: `Connection failed: ${connectionErrorMessage}` };
  }
};

export const checkServerAuthRequired = async (
  customBaseUrl?: string,
): Promise<{ authRequired: boolean; ok: boolean }> => {
  const base = customBaseUrl?.replace(/\/+$/, '') || '';
  const url = `${base}/health`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { authRequired: false, ok: false };
    }
    const data = (await response.json()) as { authRequired?: boolean };
    return { authRequired: Boolean(data.authRequired), ok: true };
  } catch {
    return { authRequired: false, ok: false };
  }
};
