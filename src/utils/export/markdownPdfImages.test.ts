import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { fetchImageAsDataUrl } from './markdownPdfImages';

vi.mock('@/utils/file/fileEncoding', () => ({
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,AAA'),
}));

const setPassword = (password: string | null) =>
  useSettingsStore.setState((state) => ({ appSettings: { ...state.appSettings, serverAccessPassword: password } }));

const pngResponse = () =>
  new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });

describe('fetchImageAsDataUrl', () => {
  afterEach(() => {
    setPassword(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // P0-9:/api/image-proxy 受部署访问口令保护,不带口令会 401,导出 PDF 时远程图片就静默消失。
  it('sends the access password to the own image proxy', async () => {
    setPassword('deploy-pwd');
    const fetchMock = vi.fn(async () => pngResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchImageAsDataUrl('https://cdn.example.com/a.png');

    expect(result).toBe('data:image/png;base64,AAA');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(`/api/image-proxy?url=${encodeURIComponent('https://cdn.example.com/a.png')}`);
    expect(init.headers).toEqual({ 'x-access-token': 'deploy-pwd' });
  });

  it('never sends the password to the upstream image host on the direct fallback', async () => {
    setPassword('deploy-pwd');
    const fetchMock = vi.fn(async (input: string) =>
      input.startsWith('/api/') ? new Response('Unauthorized', { status: 401 }) : pngResponse(),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchImageAsDataUrl('https://cdn.example.com/a.png');

    expect(result).toBe('data:image/png;base64,AAA');
    const [secondUrl, secondInit] = fetchMock.mock.calls[1]! as unknown as [string, RequestInit];
    expect(secondUrl).toBe('https://cdn.example.com/a.png');
    expect(secondInit.headers).toBeUndefined();
  });

  it('passes data URLs through without any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchImageAsDataUrl('data:image/png;base64,BBB')).resolves.toBe('data:image/png;base64,BBB');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
