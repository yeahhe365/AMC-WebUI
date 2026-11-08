import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  getServerAccessPassword,
  getServerAuthHeaders,
  verifyServerAccessPassword,
  checkServerAuthRequired,
} from './apiAuthHeaders';

describe('apiAuthHeaders', () => {
  beforeEach(() => {
    useSettingsStore.setState((state) => ({
      appSettings: { ...state.appSettings, serverAccessPassword: null },
    }));
    vi.restoreAllMocks();
  });

  it('reads serverAccessPassword from settingsStore and builds headers', () => {
    expect(getServerAccessPassword()).toBeNull();
    expect(getServerAuthHeaders()).toEqual({});

    useSettingsStore.setState((state) => ({
      appSettings: { ...state.appSettings, serverAccessPassword: 'secret-token-123' },
    }));

    expect(getServerAccessPassword()).toBe('secret-token-123');
    // 只发专用头:authorization 是 provider 的 Key 通道,不能被部署口令占用(P0-1)。
    expect(getServerAuthHeaders()).toEqual({ 'x-access-token': 'secret-token-123' });
  });

  it('allows overriding password in getServerAuthHeaders', () => {
    expect(getServerAuthHeaders('custom-override')).toEqual({ 'x-access-token': 'custom-override' });
  });

  it('verifies server access password against /api/auth/verify', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers['x-access-token'] === 'correct-pass') {
        return new Response(JSON.stringify({ ok: true, authRequired: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });

    const emptyResult = await verifyServerAccessPassword('');
    expect(emptyResult.ok).toBe(false);

    const failResult = await verifyServerAccessPassword('wrong-pass');
    expect(failResult.ok).toBe(false);
    expect(failResult.message).toBe('Invalid access password');

    const okResult = await verifyServerAccessPassword('correct-pass');
    expect(okResult.ok).toBe(true);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/verify',
      expect.objectContaining({
        headers: { 'x-access-token': 'correct-pass' },
      }),
    );
  });

  it('checks if server requires auth via /health', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok', authRequired: true }), { status: 200 }),
    );

    const result = await checkServerAuthRequired();
    expect(result).toEqual({ authRequired: true, ok: true });
  });
});
