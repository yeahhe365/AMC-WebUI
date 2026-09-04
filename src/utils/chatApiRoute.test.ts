import { describe, expect, it } from 'vitest';

import { createAppSettings, createChatSettings, createThirdPartyConnection } from '@/test/data/factories';
import { resolveChatApiRoute } from './chatApiRoute';
import { GEMINI_PROVIDER_ID } from '@/types';

describe('resolveChatApiRoute', () => {
  const appSettings = createAppSettings({
    thirdPartyApi: {
      connections: [
        createThirdPartyConnection({
          id: 'openai',
          apiKey: 'openai-key',
          enabled: true,
          modelId: 'gpt-5.6-sol',
        }),
        createThirdPartyConnection({
          id: 'kimi',
          templateId: 'kimi',
          apiKey: 'kimi-key',
          enabled: true,
          modelId: 'kimi-k3',
        }),
        createThirdPartyConnection({
          id: 'anthropic',
          templateId: 'anthropic',
          apiKey: 'anthropic-key',
          enabled: true,
          modelId: 'claude-sonnet-5',
        }),
      ],
    },
  });

  it('routes to gemini-native when providerId is absent and the modelId belongs to no enabled provider', () => {
    const chatSettings = createChatSettings({
      modelId: 'gemini-3.1-pro-preview',
      providerId: undefined,
    });

    expect(resolveChatApiRoute(appSettings, chatSettings)).toEqual({
      apiMode: 'gemini-native',
      modelId: 'gemini-3.1-pro-preview',
    });
  });

  it('routes to gemini-native when providerId is explicitly gemini-native', () => {
    const chatSettings = createChatSettings({
      modelId: 'gemini-3.1-pro-preview',
      providerId: GEMINI_PROVIDER_ID,
    });

    expect(resolveChatApiRoute(appSettings, chatSettings)).toEqual({
      apiMode: 'gemini-native',
      modelId: 'gemini-3.1-pro-preview',
    });
  });

  it('routes to the explicit third-party connection', () => {
    const chatSettings = createChatSettings({
      modelId: 'kimi-k3',
      providerId: 'kimi',
    });

    expect(resolveChatApiRoute(appSettings, chatSettings)).toMatchObject({
      apiMode: 'third-party',
      modelId: 'kimi-k3',
      providerId: 'kimi',
      provider: expect.objectContaining({ apiKey: 'kimi-key' }),
    });
  });

  it('resolves the connection from the modelId when providerId is absent (legacy session)', () => {
    const chatSettings = createChatSettings({
      modelId: 'kimi-k3',
      providerId: undefined,
    });

    expect(resolveChatApiRoute(appSettings, chatSettings)).toMatchObject({
      apiMode: 'third-party',
      modelId: 'kimi-k3',
      providerId: 'kimi',
    });
  });

  it('gemini models win over a colliding third-party id even when providerId is absent', () => {
    const collidingApp = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            apiKey: 'openai-key',
            enabled: true,
            models: [{ id: 'gemini-3.1-pro-preview', name: 'Gemini via OpenAI' }],
          }),
        ],
      },
    });

    expect(
      resolveChatApiRoute(
        collidingApp,
        createChatSettings({ modelId: 'gemini-3.1-pro-preview', providerId: undefined }),
      ),
    ).toEqual({ apiMode: 'gemini-native', modelId: 'gemini-3.1-pro-preview' });

    expect(
      resolveChatApiRoute(
        collidingApp,
        createChatSettings({ modelId: 'gemini-3.1-pro-preview', providerId: 'openai' }),
      ),
    ).toMatchObject({ apiMode: 'third-party', providerId: 'openai' });
  });

  it('falls back to the connection default modelId when the session modelId is empty', () => {
    const chatSettings = createChatSettings({
      modelId: '',
      providerId: 'kimi',
    });

    expect(resolveChatApiRoute(appSettings, chatSettings)).toMatchObject({
      apiMode: 'third-party',
      modelId: 'kimi-k3',
      providerId: 'kimi',
    });
  });

  it('marks an explicit disabled connection unavailable instead of falling back to Gemini', () => {
    const disabledApp = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'kimi',
            templateId: 'kimi',
            apiKey: 'kimi-key',
            enabled: false,
            modelId: 'kimi-k3',
          }),
        ],
      },
    });

    expect(
      resolveChatApiRoute(disabledApp, createChatSettings({ modelId: 'kimi-k3', providerId: 'kimi' })),
    ).toMatchObject({
      apiMode: 'third-party',
      modelId: 'kimi-k3',
      providerId: 'kimi',
      unavailable: 'disabled',
    });
  });

  it('marks a missing connection unavailable instead of falling back to Gemini', () => {
    expect(
      resolveChatApiRoute(
        createAppSettings({ thirdPartyApi: { connections: [] } }),
        createChatSettings({ modelId: 'gpt-4o', providerId: 'removed-id' }),
      ),
    ).toMatchObject({
      apiMode: 'third-party',
      providerId: 'removed-id',
      unavailable: 'missing',
    });
  });

  it('routes to the explicit connection when two connections share the same model id', () => {
    const sharedModel = 'shared-model';
    const dupApp = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'openai',
            apiKey: 'openai-key',
            enabled: true,
            models: [{ id: sharedModel, name: 'Shared Model' }],
          }),
          createThirdPartyConnection({
            id: 'kimi',
            templateId: 'kimi',
            apiKey: 'kimi-key',
            enabled: true,
            models: [{ id: sharedModel, name: 'Shared Model (Kimi)' }],
          }),
        ],
      },
    });

    expect(
      resolveChatApiRoute(dupApp, createChatSettings({ modelId: sharedModel, providerId: 'openai' })),
    ).toMatchObject({
      apiMode: 'third-party',
      providerId: 'openai',
      provider: expect.objectContaining({ apiKey: 'openai-key' }),
    });

    expect(resolveChatApiRoute(dupApp, createChatSettings({ modelId: sharedModel, providerId: 'kimi' }))).toMatchObject(
      { apiMode: 'third-party', providerId: 'kimi', provider: expect.objectContaining({ apiKey: 'kimi-key' }) },
    );
  });

  it('routes the built-in Atlas Cloud template through the OpenAI-compatible path', () => {
    const atlasApp = createAppSettings({
      thirdPartyApi: {
        connections: [
          createThirdPartyConnection({
            id: 'atlascloud',
            templateId: 'atlascloud',
            apiKey: 'atlascloud-key',
            enabled: true,
          }),
        ],
      },
    });

    expect(
      resolveChatApiRoute(
        atlasApp,
        createChatSettings({ modelId: 'deepseek-ai/deepseek-v4-pro', providerId: 'atlascloud' }),
      ),
    ).toMatchObject({
      apiMode: 'third-party',
      modelId: 'deepseek-ai/deepseek-v4-pro',
      providerId: 'atlascloud',
      provider: expect.objectContaining({
        apiKey: 'atlascloud-key',
        baseUrl: 'https://api.atlascloud.ai/v1',
        protocol: 'openai-compatible',
      }),
    });
  });

});
