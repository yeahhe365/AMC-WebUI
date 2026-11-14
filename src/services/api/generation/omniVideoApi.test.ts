import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppSettings, createUploadedFile } from '@/test/data/factories';

const { createInteraction, getFile, configuredClient } = vi.hoisted(() => ({
  createInteraction: vi.fn(),
  getFile: vi.fn(),
  configuredClient: vi.fn(),
}));
vi.mock('@/services/api/apiClient', () => ({ getConfiguredApiClient: configuredClient }));

import { generateOmniVideo } from './omniVideoApi';

describe('generateOmniVideo', () => {
  const settings = createAppSettings();
  const signal = new AbortController().signal;

  beforeEach(() => {
    vi.clearAllMocks();
    configuredClient.mockResolvedValue({ interactions: { create: createInteraction }, files: { get: getFile } });
    createInteraction.mockResolvedValue({
      id: 'turn-1',
      status: 'completed',
      output_video: { type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the prompt with image bytes and the previous interaction without retrying generation', async () => {
    const image = createUploadedFile({
      name: 'image.png',
      type: 'image/png',
      rawFile: new Blob(['image'], { type: 'image/png' }),
    });
    const result = await generateOmniVideo({
      apiKey: 'key',
      appSettings: settings,
      text: 'Animate',
      files: [image],
      previousInteractionId: 'previous',
      signal,
    });
    expect(createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-omni-1.2-flash',
        previous_interaction_id: 'previous',
        response_format: { type: 'video', delivery: 'uri' },
        input: [
          { type: 'image', mime_type: 'image/png', data: 'aW1hZ2U=' },
          { type: 'text', text: 'Animate' },
        ],
      }),
      expect.objectContaining({ signal, retries: { strategy: 'none' } }),
    );
    expect(result.interactionId).toBe('turn-1');
    expect(result.video).toBeInstanceOf(Blob);
    expect(result.video?.size).toBe(5);
  });

  it('retrieves a URI video through the configured API instead of trusting an arbitrary host', async () => {
    createInteraction.mockResolvedValue({
      id: 'turn-2',
      status: 'completed',
      output_video: { type: 'video', uri: 'https://untrusted.example/v1beta/files/video-123:download?alt=media' },
    });
    getFile.mockResolvedValue({ state: 'ACTIVE' });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('video', { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const result = await generateOmniVideo({ apiKey: 'key', appSettings: settings, text: 'Ocean', files: [], signal });
    expect(getFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'files/video-123' }));
    expect(fetchMock.mock.calls[0][0]).toContain('/v1beta/files/video-123:download?alt=media');
    expect(fetchMock.mock.calls[0][0]).not.toContain('untrusted.example');
    expect(result.video?.size).toBe(5);
    expect(result.video?.type).toBe('video/mp4');
  });

  it('returns a text answer when the model responds without a video', async () => {
    createInteraction.mockResolvedValue({
      id: 'text-turn',
      status: 'completed',
      output_text: '你好！我是由 Google 训练的大型语言模型。',
    });

    const result = await generateOmniVideo({ apiKey: 'key', appSettings: settings, text: '你是谁', files: [], signal });

    expect(result).toMatchObject({ interactionId: 'text-turn', text: '你好！我是由 Google 训练的大型语言模型。' });
    expect(result.video).toBeUndefined();
  });

  it('preserves text returned alongside a generated video', async () => {
    createInteraction.mockResolvedValue({
      id: 'video-and-text-turn',
      status: 'completed',
      output_text: 'Here is your video.',
      output_video: { type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' },
    });

    const result = await generateOmniVideo({
      apiKey: 'key',
      appSettings: settings,
      text: 'Animate',
      files: [],
      signal,
    });

    expect(result.text).toBe('Here is your video.');
    expect(result.video?.size).toBe(5);
  });

  it('surfaces missing or failed video without retrying', async () => {
    createInteraction.mockResolvedValue({ id: 'bad', status: 'completed' });
    await expect(
      generateOmniVideo({ apiKey: 'key', appSettings: settings, text: 'Ocean', files: [], signal }),
    ).rejects.toThrow(/video/i);
    expect(createInteraction).toHaveBeenCalledTimes(1);
  });

  it('does not issue a request when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      generateOmniVideo({
        apiKey: 'key',
        appSettings: settings,
        text: 'Ocean',
        files: [],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(createInteraction).not.toHaveBeenCalled();
  });

  it('uses the real SDK to post an interaction and parse a video response', async () => {
    configuredClient.mockImplementation(async (apiKey: string, options: { baseUrl: string }) => {
      const { getClient } =
        await vi.importActual<typeof import('@/services/api/apiClient')>('@/services/api/apiClient');
      return getClient(apiKey, options.baseUrl);
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'interaction-real-sdk',
          status: 'completed',
          model: 'gemini-omni-1.2-flash',
          object: 'interaction',
          steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' }] }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await generateOmniVideo({
      apiKey: 'test-key',
      appSettings: settings,
      text: 'A cat runs',
      files: [],
      signal,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.url).toContain('/v1beta/interactions');
    expect(request.headers.get('x-goog-api-key')).toBe('test-key');
    expect(JSON.parse(await request.clone().text())).toMatchObject({
      model: 'gemini-omni-1.2-flash',
      input: 'A cat runs',
      response_format: { type: 'video', delivery: 'uri' },
    });
    expect(result.interactionId).toBe('interaction-real-sdk');
    expect(result.video?.size).toBe(5);
  });

  it('uses the real SDK to read an interaction that contains only a text answer', async () => {
    configuredClient.mockImplementation(async (apiKey: string, options: { baseUrl: string }) => {
      const { getClient } =
        await vi.importActual<typeof import('@/services/api/apiClient')>('@/services/api/apiClient');
      return getClient(apiKey, options.baseUrl);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'text-interaction-real-sdk',
            status: 'completed',
            model: 'gemini-omni-1.2-flash',
            object: 'interaction',
            steps: [{ type: 'model_output', content: [{ type: 'text', text: '你好，我是 Gemini。' }] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const result = await generateOmniVideo({
      apiKey: 'test-key',
      appSettings: settings,
      text: '你是谁',
      files: [],
      signal,
    });

    expect(result).toMatchObject({ interactionId: 'text-interaction-real-sdk', text: '你好，我是 Gemini。' });
    expect(result.video).toBeUndefined();
  });
});
