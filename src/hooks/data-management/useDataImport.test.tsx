import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AppSettings,
  type ChatGroup,
  type SavedChatSession,
  HarmBlockThreshold,
  HarmCategory,
  MediaResolution,
} from '@/types';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { useDataImport } from './useDataImport';
import { renderHook } from '@/test/render/renderer';

describe('useDataImport', () => {
  let originalFileReader: typeof FileReader;
  let fileReaderResult = '';

  beforeEach(() => {
    originalFileReader = globalThis.FileReader;

    class MockFileReader {
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

      readAsText() {
        this.onload?.({
          target: {
            result: fileReaderResult,
          },
        } as ProgressEvent<FileReader>);
      }
    }

    globalThis.FileReader = MockFileReader as unknown as typeof FileReader;
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    globalThis.FileReader = originalFileReader;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes imported history timestamps before persisting sessions and groups', () => {
    let sessions: SavedChatSession[] = [];
    let groups: ChatGroup[] = [];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });
    const updateAndPersistGroups = vi.fn((updater: (prev: ChatGroup[]) => ChatGroup[]) => {
      groups = updater(groups);
    });

    fileReaderResult = JSON.stringify({
      type: 'AllModelChat-History',
      history: [
        {
          id: 'session-1',
          title: 'Imported',
          timestamp: '2026-04-18T08:30:00.000Z',
          messages: [],
          settings: {},
        },
      ],
      groups: [
        {
          id: 'group-1',
          title: 'Imported Group',
          timestamp: '2026-04-17T08:30:00.000Z',
        },
      ],
    });

    const { result, unmount } = renderHook(() =>
      useDataImport({
        setAppSettings: vi.fn(),
        updateAndPersistSessions,
        updateAndPersistGroups,
        savedScenarios: [],
        handleSaveAllScenarios: vi.fn(),
        t: (key) => key,
      }),
    );

    act(() => {
      result.current.handleImportHistory(new File(['history'], 'history.json', { type: 'application/json' }));
    });

    expect(typeof sessions[0].timestamp).toBe('number');
    expect(sessions[0].timestamp).toBe(new Date('2026-04-18T08:30:00.000Z').getTime());
    expect(typeof groups[0].timestamp).toBe('number');
    expect(groups[0].timestamp).toBe(new Date('2026-04-17T08:30:00.000Z').getTime());

    unmount();
  });

  it('normalizes imported message date fields before persisting history', () => {
    let sessions: SavedChatSession[] = [];
    const updateAndPersistSessions = vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
      sessions = updater(sessions);
    });

    fileReaderResult = JSON.stringify({
      type: 'AllModelChat-History',
      history: [
        {
          id: 'session-1',
          title: 'Imported',
          timestamp: '2026-04-18T08:30:00.000Z',
          messages: [
            {
              id: 'message-1',
              role: 'model',
              content: 'Imported reply',
              timestamp: '2026-04-18T08:31:00.000Z',
              generationStartTime: '2026-04-18T08:30:30.000Z',
              generationEndTime: '2026-04-18T08:31:30.000Z',
            },
          ],
          settings: {},
        },
      ],
    });

    const { result, unmount } = renderHook(() =>
      useDataImport({
        setAppSettings: vi.fn(),
        updateAndPersistSessions,
        updateAndPersistGroups: vi.fn(),
        savedScenarios: [],
        handleSaveAllScenarios: vi.fn(),
        t: (key) => key,
      }),
    );

    act(() => {
      result.current.handleImportHistory(new File(['history'], 'history.json', { type: 'application/json' }));
    });

    expect(sessions[0].messages[0].timestamp).toBeInstanceOf(Date);
    expect(sessions[0].messages[0].generationStartTime).toBeInstanceOf(Date);
    expect(sessions[0].messages[0].generationEndTime).toBeInstanceOf(Date);

    unmount();
  });

  it('falls back to defaults for invalid nested and enum settings during import', () => {
    let importedSettings: AppSettings = DEFAULT_APP_SETTINGS;
    let didImportSettings = false;

    fileReaderResult = JSON.stringify({
      type: 'AllModelChat-Settings',
      settings: {
        themeId: 'midnight',
        language: 'jp',
        thinkingLevel: 'MAX',
        mediaResolution: 'SUPER',
        filesApiConfig: {
          images: 'yes',
          pdfs: false,
          audio: 1,
          video: true,
          text: null,
        },
        safetySettings: [
          {
            category: 'NOT_A_CATEGORY',
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: 'INVALID_THRESHOLD',
          },
        ],
        customShortcuts: {
          openSettings: 'Cmd+,',
          launchChat: 42,
        },
      },
    });

    const { result, unmount } = renderHook(() =>
      useDataImport({
        setAppSettings: vi.fn((value: AppSettings | ((prev: AppSettings) => AppSettings)) => {
          didImportSettings = true;
          importedSettings = typeof value === 'function' ? value(DEFAULT_APP_SETTINGS) : value;
        }),
        updateAndPersistSessions: vi.fn(),
        updateAndPersistGroups: vi.fn(),
        savedScenarios: [],
        handleSaveAllScenarios: vi.fn(),
        t: (key) => key,
      }),
    );

    act(() => {
      result.current.handleImportSettings(new File(['settings'], 'settings.json', { type: 'application/json' }));
    });

    expect(didImportSettings).toBe(true);
    expect(importedSettings.themeId).toBe(DEFAULT_APP_SETTINGS.themeId);
    expect(importedSettings.language).toBe(DEFAULT_APP_SETTINGS.language);
    expect(importedSettings.thinkingLevel).toBe(DEFAULT_APP_SETTINGS.thinkingLevel);
    expect(importedSettings.mediaResolution).toBe(DEFAULT_APP_SETTINGS.mediaResolution);
    expect(importedSettings.filesApiConfig).toEqual({
      ...DEFAULT_APP_SETTINGS.filesApiConfig,
      pdfs: false,
      video: true,
    });
    expect(importedSettings.safetySettings).toEqual(DEFAULT_APP_SETTINGS.safetySettings);
    expect(importedSettings.customShortcuts).toEqual({
      openSettings: 'Cmd+,',
    });

    unmount();
  });

  it('keeps valid nested settings when importing settings', () => {
    let importedSettings: AppSettings = DEFAULT_APP_SETTINGS;
    let didImportSettings = false;

    fileReaderResult = JSON.stringify({
      type: 'AllModelChat-Settings',
      settings: {
        themeId: 'onyx',
        language: 'zh',
        thinkingLevel: 'HIGH',
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
        filesApiConfig: {
          images: true,
          pdfs: false,
          audio: true,
          video: false,
          text: true,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
          },
        ],
        customShortcuts: {
          openSettings: 'Cmd+,',
          newChat: 'Cmd+Shift+O',
        },
        tabModelCycleIds: [' gemini-3.1-pro-preview ', 'gemini-3-flash-preview', 'gemini-3-flash-preview', 42],
      },
    });

    const { result, unmount } = renderHook(() =>
      useDataImport({
        setAppSettings: vi.fn((value: AppSettings | ((prev: AppSettings) => AppSettings)) => {
          didImportSettings = true;
          importedSettings = typeof value === 'function' ? value(DEFAULT_APP_SETTINGS) : value;
        }),
        updateAndPersistSessions: vi.fn(),
        updateAndPersistGroups: vi.fn(),
        savedScenarios: [],
        handleSaveAllScenarios: vi.fn(),
        t: (key) => key,
      }),
    );

    act(() => {
      result.current.handleImportSettings(new File(['settings'], 'settings.json', { type: 'application/json' }));
    });

    expect(didImportSettings).toBe(true);
    expect(importedSettings.themeId).toBe('onyx');
    expect(importedSettings.language).toBe('zh');
    expect(importedSettings.thinkingLevel).toBe('HIGH');
    expect(importedSettings.mediaResolution).toBe(MediaResolution.MEDIA_RESOLUTION_HIGH);
    expect(importedSettings.filesApiConfig).toEqual({
      images: true,
      pdfs: false,
      audio: true,
      video: false,
      text: true,
    });
    expect(importedSettings.safetySettings).toEqual([
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
      },
    ]);
    expect(importedSettings.customShortcuts).toEqual({
      openSettings: 'Cmd+,',
      newChat: 'Cmd+Shift+O',
    });
    expect(importedSettings.tabModelCycleIds).toEqual(['gemini-3.1-pro-preview', 'gemini-3-flash-preview']);

    unmount();
  });

  it('imports valid settings fields that are not covered by legacy manual key lists', () => {
    let importedSettings: AppSettings = DEFAULT_APP_SETTINGS;
    let didImportSettings = false;

    fileReaderResult = JSON.stringify({
      type: 'AllModelChat-Settings',
      settings: {
        isOpenAICompatibleApiEnabled: true,
        apiMode: 'openai-compatible',
        openaiCompatibleApiKey: 'openai-key',
        openaiCompatibleBaseUrl: 'https://openai-compatible.example.com/v1',
        openaiCompatibleModelId: 'custom-model',
        openaiCompatibleModels: [
          {
            id: 'custom-model',
            name: 'Custom Model',
            isPinned: true,
            apiMode: 'openai-compatible',
          },
        ],
        translationTargetLanguage: 'Japanese',
        inputTranslationModelId: 'gemini-input-translation',
        thoughtTranslationTargetLanguage: 'Korean',
        thoughtTranslationModelId: 'gemini-thought-translation',
        showInputTranslationButton: true,
        showInputPasteButton: false,
        showInputClearButton: true,
        isCopySelectionFormattingEnabled: false,
      },
    });

    const { result, unmount } = renderHook(() =>
      useDataImport({
        setAppSettings: vi.fn((value: AppSettings | ((prev: AppSettings) => AppSettings)) => {
          didImportSettings = true;
          importedSettings = typeof value === 'function' ? value(DEFAULT_APP_SETTINGS) : value;
        }),
        updateAndPersistSessions: vi.fn(),
        updateAndPersistGroups: vi.fn(),
        savedScenarios: [],
        handleSaveAllScenarios: vi.fn(),
        t: (key) => key,
      }),
    );

    act(() => {
      result.current.handleImportSettings(new File(['settings'], 'settings.json', { type: 'application/json' }));
    });

    expect(didImportSettings).toBe(true);
    // Legacy openaiCompatible* fields fold into thirdPartyApi.providers.openai on import.
    expect(importedSettings.thirdPartyApi.connections.find((connection) => connection.id === 'openai')?.apiKey).toBe(
      'openai-key',
    );
    expect(importedSettings.thirdPartyApi.connections.find((connection) => connection.id === 'openai')?.baseUrl).toBe(
      'https://openai-compatible.example.com/v1',
    );
    expect(importedSettings.thirdPartyApi.connections.find((connection) => connection.id === 'openai')?.modelId).toBe(
      'custom-model',
    );
    expect(importedSettings.thirdPartyApi.connections.find((connection) => connection.id === 'openai')?.models).toEqual(
      [
        {
          id: 'custom-model',
          name: 'Custom Model',
          isPinned: true,
          // The legacy 'openai-compatible' model tag is normalized to
          // 'third-party' during sanitize (normalizeModelApiModeTag).
          apiMode: 'third-party',
        },
      ],
    );
    // Legacy 'openai-compatible' apiMode is no longer part of the settings
    // shape; routing derives from (providerId, modelId) so the import falls
    // back to gemini-native.
    expect(importedSettings.providerId).toBe('gemini-native');
    expect(importedSettings.translationTargetLanguage).toBe('Japanese');
    expect(importedSettings.inputTranslationModelId).toBe('gemini-input-translation');
    expect(importedSettings.thoughtTranslationTargetLanguage).toBe('Korean');
    expect(importedSettings.thoughtTranslationModelId).toBe('gemini-thought-translation');
    expect(importedSettings.showInputTranslationButton).toBe(true);
    expect(importedSettings.showInputPasteButton).toBe(false);
    expect(importedSettings.showInputClearButton).toBe(true);
    expect(importedSettings.isCopySelectionFormattingEnabled).toBe(false);

    unmount();
  });
});
