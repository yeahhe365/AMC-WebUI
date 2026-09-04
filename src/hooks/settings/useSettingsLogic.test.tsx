import { act, type UIEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { createThirdPartyConnection } from '@/test/data/factories';
import type { AppSettings } from '@/types';
import { useSettingsLogic, ANCHOR_SCROLL_LOCK_MS } from './useSettingsLogic';
import { renderHook } from '@/test/render/renderer';
import { useSettingsUiStore } from '@/stores/settingsUiStore';

describe('useSettingsLogic', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsUiStore.setState({
      activeTab: 'models',
      scrollPositions: {},
      legacySettingsUiHydrated: false,
    });
  });

  it('does not include the usage tab in the settings sidebar model', () => {
    const { result, unmount } = renderHook(() =>
      useSettingsLogic({
        isOpen: true,
        currentSettings: DEFAULT_APP_SETTINGS,
        onSave: vi.fn(),
        onClearAllHistory: vi.fn(),
        onClearCache: vi.fn(),
        onImportHistory: vi.fn(),
        t: (key: string) => key,
      }),
    );

    expect(result.current.tabs.map((tab) => tab.id)).not.toContain('usage');
    unmount();
  });

  it('does not include the legacy Canvas tab in the settings sidebar model', () => {
    const { result, unmount } = renderHook(() =>
      useSettingsLogic({
        isOpen: true,
        currentSettings: DEFAULT_APP_SETTINGS,
        onSave: vi.fn(),
        onClearAllHistory: vi.fn(),
        onClearCache: vi.fn(),
        onImportHistory: vi.fn(),
        t: (key: string) => key,
      }),
    );

    expect(result.current.tabs.map((tab) => tab.id)).not.toContain('canvas');
    unmount();
  });

  it('does not include the merged language and voice tab in the settings sidebar model', () => {
    const { result, unmount } = renderHook(() =>
      useSettingsLogic({
        isOpen: true,
        currentSettings: DEFAULT_APP_SETTINGS,
        onSave: vi.fn(),
        onClearAllHistory: vi.fn(),
        onClearCache: vi.fn(),
        onImportHistory: vi.fn(),
        t: (key: string) => key,
      }),
    );

    expect(result.current.tabs.map((tab) => tab.id)).not.toContain('languageVoice');
    unmount();
  });

  it('restores legacy grouped chat tabs to the models tab', () => {
    localStorage.setItem('chatSettingsLastTab', 'chat');

    const { result, unmount } = renderHook(() =>
      useSettingsLogic({
        isOpen: true,
        currentSettings: DEFAULT_APP_SETTINGS,
        onSave: vi.fn(),
        onClearAllHistory: vi.fn(),
        onClearCache: vi.fn(),
        onImportHistory: vi.fn(),
        t: (key: string) => key,
      }),
    );

    expect(result.current.activeTab).toBe('models');
    unmount();
  });

  it('restores the removed model behavior tab to the models tab', () => {
    localStorage.setItem('chatSettingsLastTab', 'generation');

    const { result, unmount } = renderHook(() =>
      useSettingsLogic({
        isOpen: true,
        currentSettings: DEFAULT_APP_SETTINGS,
        onSave: vi.fn(),
        onClearAllHistory: vi.fn(),
        onClearCache: vi.fn(),
        onImportHistory: vi.fn(),
        t: (key: string) => key,
      }),
    );

    expect(result.current.activeTab).toBe('models');
    unmount();
  });

  it('restores the legacy Canvas tab to the models tab', () => {
    localStorage.setItem('chatSettingsLastTab', 'canvas');

    const { result, unmount } = renderHook(() =>
      useSettingsLogic({
        isOpen: true,
        currentSettings: DEFAULT_APP_SETTINGS,
        onSave: vi.fn(),
        onClearAllHistory: vi.fn(),
        onClearCache: vi.fn(),
        onImportHistory: vi.fn(),
        t: (key: string) => key,
      }),
    );

    expect(result.current.activeTab).toBe('models');
    unmount();
  });

  it('restores the merged language and voice tab to the models tab', () => {
    localStorage.setItem('chatSettingsLastTab', 'languageVoice');

    const { result, unmount } = renderHook(() =>
      useSettingsLogic({
        isOpen: true,
        currentSettings: DEFAULT_APP_SETTINGS,
        onSave: vi.fn(),
        onClearAllHistory: vi.fn(),
        onClearCache: vi.fn(),
        onImportHistory: vi.fn(),
        t: (key: string) => key,
      }),
    );

    expect(result.current.activeTab).toBe('models');
    unmount();
  });

  it('preserves API connection and MCP configuration when resetting settings to defaults', () => {
    const onSave = vi.fn();
    const currentSettings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      systemInstruction: 'Custom prompt',
      apiKey: 'stored-api-key',
      useCustomApiConfig: true,
      mcpServers: [
        {
          id: 'alpha',
          name: 'Alpha',
          enabled: true,
          transport: 'stdio',
          command: 'npx',
        },
      ],
      thirdPartyApi: {
        connections: [createThirdPartyConnection({ id: 'openai', apiKey: 'sk-third-party' })],
      },
    };

    const { result, unmount } = renderHook(() =>
      useSettingsLogic({
        isOpen: true,
        currentSettings,
        onSave,
        onClearAllHistory: vi.fn(),
        onClearCache: vi.fn(),
        onImportHistory: vi.fn(),
        t: (key: string) => key,
      }),
    );

    act(() => {
      result.current.handleResetToDefaults();
    });
    act(() => {
      result.current.confirmConfig.onConfirm();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedSettings = onSave.mock.calls[0][0] as AppSettings;
    expect(savedSettings.systemInstruction).toBe('');
    expect(savedSettings.apiKey).toBe('stored-api-key');
    expect(savedSettings.useCustomApiConfig).toBe(true);
    expect(savedSettings.mcpServers).toEqual(currentSettings.mcpServers);
    expect(savedSettings.thirdPartyApi.connections.find((connection) => connection.id === 'openai')?.apiKey).toBe(
      'sk-third-party',
    );

    unmount();
  });

  it('preserves pending setting updates when a model change happens immediately after', () => {
    const onSave = vi.fn();
    const { result, unmount } = renderHook(() =>
      useSettingsLogic({
        isOpen: true,
        currentSettings: DEFAULT_APP_SETTINGS,
        onSave,
        onClearAllHistory: vi.fn(),
        onClearCache: vi.fn(),
        onImportHistory: vi.fn(),
        t: (key: string) => key,
      }),
    );

    act(() => {
      result.current.updateSetting('systemInstruction', 'Persist this prompt');
      result.current.handleModelChange('gemma-4-31b-it');
    });

    expect(onSave).toHaveBeenNthCalledWith(1, {
      ...DEFAULT_APP_SETTINGS,
      systemInstruction: 'Persist this prompt',
    });

    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modelId: 'gemma-4-31b-it',
        systemInstruction: 'Persist this prompt',
      }),
    );

    unmount();
  });

  it('does not save the scroll position while an anchor scroll lock is active', () => {
    vi.useFakeTimers();
    try {
      const { result, unmount } = renderHook(() =>
        useSettingsLogic({
          isOpen: true,
          currentSettings: DEFAULT_APP_SETTINGS,
          onSave: vi.fn(),
          onClearAllHistory: vi.fn(),
          onClearCache: vi.fn(),
          onImportHistory: vi.fn(),
          t: (key: string) => key,
        }),
      );

      act(() => {
        result.current.beginAnchorScroll();
      });
      const scrollEvent = { currentTarget: { scrollTop: 240 } } as unknown as UIEvent<HTMLDivElement>;
      act(() => {
        result.current.handleContentScroll(scrollEvent);
      });

      // Mid-animation saves are suppressed so they cannot cancel the smooth
      // scrollIntoView via the restore effect.
      expect(useSettingsUiStore.getState().scrollPositions.models).toBeUndefined();

      act(() => {
        vi.advanceTimersByTime(ANCHOR_SCROLL_LOCK_MS + 1);
      });
      act(() => {
        result.current.handleContentScroll(scrollEvent);
      });

      // Once the lock expires, user scrolls persist again.
      expect(useSettingsUiStore.getState().scrollPositions.models).toBe(240);

      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists the container scroll position via saveActiveScrollPosition', () => {
    const { result, unmount } = renderHook(() =>
      useSettingsLogic({
        isOpen: true,
        currentSettings: DEFAULT_APP_SETTINGS,
        onSave: vi.fn(),
        onClearAllHistory: vi.fn(),
        onClearCache: vi.fn(),
        onImportHistory: vi.fn(),
        t: (key: string) => key,
      }),
    );

    (result.current.scrollContainerRef as { current: HTMLDivElement | null }).current = {
      scrollTop: 360,
    } as HTMLDivElement;
    act(() => {
      result.current.saveActiveScrollPosition();
    });

    expect(useSettingsUiStore.getState().scrollPositions.models).toBe(360);

    unmount();
  });
});
