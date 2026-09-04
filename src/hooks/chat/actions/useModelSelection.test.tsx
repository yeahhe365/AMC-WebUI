import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/chat-input/focus', () => ({ focusChatInput: vi.fn() }));
vi.mock('@/utils/model/modelSwitchSettings', () => ({
  resolveModelSwitchSettings: vi.fn(({ targetModelId }: { targetModelId: string }) => ({
    modelId: targetModelId,
    thinkingBudget: 0,
    thinkingLevel: 'MEDIUM',
  })),
}));

import { useModelSelection } from './useModelSelection';
import {
  createAppSettings,
  createChatSettings,
  createSavedChatSession,
  createThirdPartyConnection,
} from '@/test/data/factories';
import { renderHook } from '@/test/render/renderer';
import { GEMINI_PROVIDER_ID } from '@/types';

const appSettingsWithSharedModel = (): ReturnType<typeof createAppSettings> =>
  createAppSettings({
    thirdPartyApi: {
      connections: [
        createThirdPartyConnection({
          id: 'openai',
          enabled: true,
          models: [{ id: 'shared-model', name: 'Shared (OpenAI)' }],
        }),
        createThirdPartyConnection({
          id: 'kimi',
          templateId: 'kimi',
          enabled: true,
          models: [{ id: 'shared-model', name: 'Shared (Kimi)' }],
        }),
      ],
    },
  });

describe('useModelSelection', () => {
  it('clears third-party session routing when selecting a Gemini model', () => {
    const thirdPartySettings = createChatSettings({
      modelId: 'kimi-k3',
      providerId: 'kimi',
    });
    const updateAndPersistSessions = vi.fn();

    const { result, unmount } = renderHook(() =>
      useModelSelection({
        appSettings: createAppSettings(),
        activeSessionId: 'session-1',
        currentChatSettings: thirdPartySettings,
        isLoading: false,
        updateAndPersistSessions,
        setActiveSessionId: vi.fn(),
        setCurrentChatSettings: vi.fn(),
        setIsSwitchingModel: vi.fn(),
        handleStopGenerating: vi.fn(),
        userScrolledUpRef: { current: false },
      }),
    );

    act(() => {
      result.current.handleSelectModelInHeader('gemini-3-flash-preview');
    });

    const update = updateAndPersistSessions.mock.calls[0]?.[0];
    const [updatedSession] = update([createSavedChatSession({ id: 'session-1', settings: thirdPartySettings })]);

    expect(updatedSession.settings).toMatchObject({
      modelId: 'gemini-3-flash-preview',
      providerId: GEMINI_PROVIDER_ID,
    });

    unmount();
  });

  it('routes a shared model id to the explicitly picked provider', () => {
    const updateAndPersistSessions = vi.fn();

    const { result, unmount } = renderHook(() =>
      useModelSelection({
        appSettings: appSettingsWithSharedModel(),
        activeSessionId: 'session-1',
        currentChatSettings: createChatSettings(),
        isLoading: false,
        updateAndPersistSessions,
        setActiveSessionId: vi.fn(),
        setCurrentChatSettings: vi.fn(),
        setIsSwitchingModel: vi.fn(),
        handleStopGenerating: vi.fn(),
        userScrolledUpRef: { current: false },
      }),
    );

    act(() => {
      result.current.handleSelectModelInHeader('shared-model', 'kimi');
    });

    const update = updateAndPersistSessions.mock.calls[0]?.[0];
    const [updatedSession] = update([createSavedChatSession({ id: 'session-1', settings: createChatSettings() })]);

    expect(updatedSession.settings).toMatchObject({
      modelId: 'shared-model',
      providerId: 'kimi',
    });

    unmount();
  });

  it('falls back to inference when no explicit providerId is given', () => {
    const updateAndPersistSessions = vi.fn();

    const { result, unmount } = renderHook(() =>
      useModelSelection({
        appSettings: appSettingsWithSharedModel(),
        activeSessionId: 'session-1',
        currentChatSettings: createChatSettings(),
        isLoading: false,
        updateAndPersistSessions,
        setActiveSessionId: vi.fn(),
        setCurrentChatSettings: vi.fn(),
        setIsSwitchingModel: vi.fn(),
        handleStopGenerating: vi.fn(),
        userScrolledUpRef: { current: false },
      }),
    );

    act(() => {
      result.current.handleSelectModelInHeader('shared-model');
    });

    const update = updateAndPersistSessions.mock.calls[0]?.[0];
    const [updatedSession] = update([createSavedChatSession({ id: 'session-1', settings: createChatSettings() })]);

    // Without an explicit providerId the inference path resolves the first
    // enabled provider in fixed order (openai).
    expect(updatedSession.settings).toMatchObject({
      modelId: 'shared-model',
      providerId: 'openai',
    });

    unmount();
  });
});
