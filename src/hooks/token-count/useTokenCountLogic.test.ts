import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AppSettings, UploadedFile } from '@/types';
import { createAppSettings } from '@/test/data/factories';
import { renderHook } from '@/test/render/renderer';

const { countTokensApiMock } = vi.hoisted(() => ({
  countTokensApiMock: vi.fn(),
}));

vi.mock('@/services/api/generation/tokenApi', () => ({
  countTokensApi: countTokensApiMock,
}));

import { useTokenCountLogic } from './useTokenCountLogic';

const renderTokenCountLogic = (appSettings: AppSettings, latestStoredSettings: AppSettings) => {
  useSettingsStore.setState({ appSettings: latestStoredSettings });
  const initialFiles: UploadedFile[] = [];

  return renderHook(() =>
    useTokenCountLogic({
      isOpen: true,
      initialText: 'hello',
      initialFiles,
      appSettings,
      currentModelId: 'gemini-3-flash-preview',
    }),
  );
};

describe('useTokenCountLogic API key resolution', () => {
  beforeEach(() => {
    countTokensApiMock.mockReset();
    countTokensApiMock.mockResolvedValue(42);
    useSettingsStore.setState({ appSettings: createAppSettings() });
  });

  it('prefers the latest stored API config fields when modal props are stale', async () => {
    const modalAppSettings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      useCustomApiConfig: true,
      apiKey: null,
      apiProxyUrl: null,
      useApiProxy: false,
      systemInstruction: 'session override',
      isGoogleSearchEnabled: true,
    };

    const latestStoredSettings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      useCustomApiConfig: true,
      apiKey: 'stored-key',
      apiProxyUrl: 'https://proxy.example.com/gemini',
      useApiProxy: true,
      systemInstruction: 'global instruction',
      isGoogleSearchEnabled: false,
    };

    const { unmount } = renderTokenCountLogic(modalAppSettings, latestStoredSettings);

    await waitFor(() => expect(countTokensApiMock).toHaveBeenCalled());
    expect(countTokensApiMock.mock.calls.at(-1)?.[0]).toBe('stored-key');
    unmount();
  });

  it('uses the first custom API key directly instead of chat rotation state', async () => {
    const appSettings = createAppSettings({
      useCustomApiConfig: true,
      apiKey: 'valid-key\nstale-key',
    });

    const { unmount } = renderTokenCountLogic(appSettings, appSettings);

    await waitFor(() => expect(countTokensApiMock).toHaveBeenCalled());
    expect(countTokensApiMock.mock.calls.at(-1)?.[0]).toBe('valid-key');
    unmount();
  });

  it('includes the token API failure detail in the visible error', async () => {
    countTokensApiMock.mockRejectedValueOnce(new Error('quota exhausted'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const appSettings = createAppSettings({
      useCustomApiConfig: true,
      apiKey: 'valid-key',
    });

    try {
      const { result, unmount } = renderTokenCountLogic(appSettings, appSettings);

      await waitFor(() => expect(result.current.error).toBe('Failed to count tokens: quota exhausted'));
      unmount();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('preserves user edits and model selection on parent re-renders while modal remains open', async () => {
    const appSettings = createAppSettings({
      useCustomApiConfig: true,
      apiKey: 'valid-key',
    });

    let currentSettings = appSettings;
    const initialFiles: UploadedFile[] = [];
    const { result, rerender, unmount } = renderHook(() =>
      useTokenCountLogic({
        isOpen: true,
        initialText: 'hello',
        initialFiles,
        appSettings: currentSettings,
        currentModelId: 'gemini-3-flash-preview',
      }),
    );

    await waitFor(() => expect(countTokensApiMock).toHaveBeenCalledTimes(1));
    expect(result.current.text).toBe('hello');

    // Simulate user editing text and selecting another model inside the modal
    act(() => {
      result.current.setText('user modified content');
      result.current.handleModelSelect('gemini-2.5-pro');
    });

    expect(result.current.text).toBe('user modified content');
    expect(result.current.selectedModelId).toBe('gemini-2.5-pro');

    // Simulate parent re-render with fresh object reference for appSettings
    act(() => {
      currentSettings = { ...appSettings };
      rerender();
    });

    // Content and selected model should NOT be wiped out
    expect(result.current.text).toBe('user modified content');
    expect(result.current.selectedModelId).toBe('gemini-2.5-pro');
    expect(countTokensApiMock).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('prioritizes dedicated tokenCalculatorApiKey and passes directGoogleApi option', async () => {
    const appSettings = createAppSettings({
      useCustomApiConfig: true,
      apiKey: 'global-proxy-key',
      useApiProxy: true,
      apiProxyUrl: 'http://localhost:7861',
      tokenCalculatorApiKey: 'dedicated-gemini-key',
    });

    const { result, unmount } = renderTokenCountLogic(appSettings, appSettings);

    await waitFor(() => expect(countTokensApiMock).toHaveBeenCalled());
    expect(countTokensApiMock.mock.calls.at(-1)?.[0]).toBe('dedicated-gemini-key');
    expect(countTokensApiMock.mock.calls.at(-1)?.[4]).toEqual({ directGoogleApi: true });
    expect(result.current.hasDedicatedApiKey).toBe(true);

    unmount();
  });

  it('updates and persists dedicated API key when saved from modal', async () => {
    const appSettings = createAppSettings({
      useCustomApiConfig: true,
      apiKey: 'global-key',
    });

    const { result, unmount } = renderTokenCountLogic(appSettings, appSettings);

    await waitFor(() => expect(countTokensApiMock).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.handleSaveDedicatedApiKey('new-saved-dedicated-key');
    });

    await waitFor(() => expect(countTokensApiMock).toHaveBeenCalledTimes(2));
    expect(countTokensApiMock.mock.calls.at(-1)?.[0]).toBe('new-saved-dedicated-key');
    expect(countTokensApiMock.mock.calls.at(-1)?.[4]).toEqual({ directGoogleApi: true });
    expect(useSettingsStore.getState().appSettings.tokenCalculatorApiKey).toBe('new-saved-dedicated-key');

    unmount();
  });
});
