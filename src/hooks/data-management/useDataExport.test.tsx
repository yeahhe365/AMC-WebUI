import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedChatSession, UploadedFile } from '@/types';
import { extractPersistedSessionFileRecords } from '@/utils/chat/session';
import { useDataExport } from './useDataExport';
import { useDataImport } from './useDataImport';
import { renderHook } from '@/test/render/renderer';
import { createAppSettings, createChatSettings } from '@/test/data/factories';

const mockGetAllSessions = vi.fn();

vi.mock('@/services/db/dbService', async () => {
  const { createDbServiceMockModule } = await import('@/test/doubles/moduleMocks');

  return createDbServiceMockModule({
    getAllSessions: vi.fn((...args: unknown[]) => mockGetAllSessions(...args)),
  });
});

vi.mock('@/utils/export/core', () => ({
  triggerDownload: vi.fn(),
}));

describe('useDataExport history roundtrip', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalFileReader: typeof FileReader;
  let exportedJson = '';
  let createObjectURLMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    exportedJson = '';
    originalCreateObjectURL = URL.createObjectURL;
    originalFileReader = globalThis.FileReader;

    vi.stubGlobal('alert', vi.fn());

    createObjectURLMock = vi.fn(() => 'blob:history-export');
    URL.createObjectURL = createObjectURLMock as unknown as typeof URL.createObjectURL;

    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

      readAsText() {
        this.result = exportedJson;
        this.onload?.({
          target: {
            result: this.result,
          },
        } as ProgressEvent<FileReader>);
      }

      readAsDataURL(blob: Blob) {
        blob
          .arrayBuffer()
          .then((buffer) => {
            const base64 = Buffer.from(buffer).toString('base64');
            this.result = `data:${blob.type};base64,${base64}`;
            this.onload?.({
              target: {
                result: this.result,
              },
            } as ProgressEvent<FileReader>);
          })
          .catch(() => {
            this.onerror?.({} as ProgressEvent<FileReader>);
          });
      }
    }

    globalThis.FileReader = MockFileReader as unknown as typeof FileReader;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    globalThis.FileReader = originalFileReader;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves attachment payloads across export and import', async () => {
    const attachment: UploadedFile = {
      id: 'file-1',
      name: 'notes.txt',
      type: 'text/plain',
      size: 5,
      rawFile: new File(['hello'], 'notes.txt', { type: 'text/plain' }),
    };
    const exportedSession: SavedChatSession = {
      id: 'session-1',
      title: 'History',
      timestamp: Date.now(),
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'with file',
          timestamp: new Date('2026-04-20T08:00:00.000Z'),
          files: [attachment],
        },
      ],
      settings: createChatSettings({
        modelId: 'gemini-test',
      }),
    };

    mockGetAllSessions.mockResolvedValue([exportedSession]);

    const exportHook = renderHook(() =>
      useDataExport({
        appSettings: createAppSettings(),
        savedGroups: [],
        savedScenarios: [],
        t: (key) => key,
      }),
    );

    await act(async () => {
      await exportHook.result.current.handleExportHistory();
    });
    expect(createObjectURLMock).toHaveBeenCalled();
    const exportedBlob = createObjectURLMock.mock.calls[0][0] as Blob;
    exportedJson = await exportedBlob.text();

    expect(exportedJson).toContain('"AllModelChat-History"');

    let importedSessions: SavedChatSession[] = [];
    const importHook = renderHook(() =>
      useDataImport({
        setAppSettings: vi.fn(),
        updateAndPersistSessions: vi.fn((updater: (prev: SavedChatSession[]) => SavedChatSession[]) => {
          importedSessions = updater(importedSessions);
        }),
        updateAndPersistGroups: vi.fn(),
        savedScenarios: [],
        handleSaveAllScenarios: vi.fn(),
        t: (key) => key,
      }),
    );

    act(() => {
      importHook.result.current.handleImportHistory(
        new File(['history'], 'amc-webui-history.json', { type: 'application/json' }),
      );
    });

    expect(importedSessions).toHaveLength(1);
    expect(extractPersistedSessionFileRecords(importedSessions[0])).toHaveLength(1);

    exportHook.unmount();
    importHook.unmount();
  });

  it('redacts MCP secrets when exporting settings', async () => {
    const exportHook = renderHook(() =>
      useDataExport({
        appSettings: createAppSettings({
          mcpServers: [
            {
              id: 'remote',
              name: 'Remote MCP',
              enabled: true,
              transport: 'http',
              url: 'https://mcp.example.com/mcp',
              headers: {
                Authorization: 'Bearer legacy-token',
                'X-Workspace': 'docs',
              },
              auth: {
                type: 'bearer',
                token: 'structured-token',
              },
            },
            {
              id: 'stdio',
              name: 'Stdio MCP',
              enabled: true,
              transport: 'stdio',
              command: 'npx',
              env: {
                API_TOKEN: 'stdio-secret',
              },
            },
          ],
        }),
        savedGroups: [],
        savedScenarios: [],
        t: (key) => key,
      }),
    );

    act(() => {
      exportHook.result.current.handleExportSettings();
    });

    const exportedBlob = createObjectURLMock.mock.calls[0][0] as Blob;
    exportedJson = await exportedBlob.text();
    const exported = JSON.parse(exportedJson) as {
      settings: {
        mcpServers: Array<{
          headers?: Record<string, string>;
          env?: Record<string, string>;
          auth?: { type: string; token?: string };
        }>;
      };
    };

    expect(exportedJson).not.toContain('legacy-token');
    expect(exportedJson).not.toContain('structured-token');
    expect(exportedJson).not.toContain('stdio-secret');
    expect(exported.settings.mcpServers[0].headers).toEqual({ 'X-Workspace': 'docs' });
    expect(exported.settings.mcpServers[0].auth).toEqual({ type: 'bearer' });
    expect(exported.settings.mcpServers[1].env).toEqual({});

    exportHook.unmount();
  });

  it('keeps non-sensitive stdio MCP env vars when exporting settings', async () => {
    const exportHook = renderHook(() =>
      useDataExport({
        appSettings: createAppSettings({
          mcpServers: [
            {
              id: 'local',
              name: 'Local MCP',
              enabled: true,
              transport: 'stdio',
              command: 'npx',
              env: {
                API_TOKEN: 'env-secret-value',
                HOME: '/Users/tester',
                LOG_LEVEL: 'debug',
                DB_PASSWORD: 'another-secret',
              },
            },
          ],
        }),
        savedGroups: [],
        savedScenarios: [],
        t: (key) => key,
      }),
    );

    act(() => {
      exportHook.result.current.handleExportSettings();
    });

    const exportedBlob = createObjectURLMock.mock.calls[0][0] as Blob;
    const exported = JSON.parse(await exportedBlob.text()) as {
      settings: {
        mcpServers: Array<{ env?: Record<string, string> }>;
      };
    };

    expect(exported.settings.mcpServers[0].env).toEqual({
      HOME: '/Users/tester',
      LOG_LEVEL: 'debug',
    });

    exportHook.unmount();
  });
});
