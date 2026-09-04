import { vi } from 'vitest';

type MockFn = ReturnType<typeof vi.fn> & ((...args: unknown[]) => unknown);
type MockRecord = Record<string, MockFn>;

const mockFn = () => vi.fn() as MockFn;
const asyncMockFn = (value: unknown) => vi.fn().mockResolvedValue(value) as MockFn;

type MockDbService = MockRecord & {
  getAllSessions: MockFn;
  getAllSessionMetadata: MockFn;
  getSession: MockFn;
  getSessionMetadataOnly: MockFn;
  searchSessions: MockFn;
  setAllSessions: MockFn;
  saveSession: MockFn;
  deleteSession: MockFn;
  getAllGroups: MockFn;
  setAllGroups: MockFn;
  getAllScenarios: MockFn;
  setAllScenarios: MockFn;
  getAppSettings: MockFn;
  setAppSettings: MockFn;
  getActiveSessionId: MockFn;
  setActiveSessionId: MockFn;
  addLogs: MockFn;
  getLogs: MockFn;
  clearLogs: MockFn;
  pruneLogs: MockFn;
  addApiUsageRecord: MockFn;
  getApiUsageByTimeRange: MockFn;
  clearApiUsage: MockFn;
  estimateAppDataSize: MockFn;
  clearAllData: MockFn;
};

type MockLogService = MockRecord & {
  error: MockFn;
  warn: MockFn;
  info: MockFn;
  debug: MockFn;
  setEnabled: MockFn;
  recordTokenUsage: MockFn;
  recordApiKeyUsage: MockFn;
  getRecentLogs: MockFn;
  clearLogs: MockFn;
};

interface MockBroadcastChannelInstance {
  name: string;
  postMessage: MockFn;
  close: MockFn;
  onmessage: ((event: MessageEvent) => void) | null;
  addEventListener: MockFn;
  removeEventListener: MockFn;
  dispatchEvent: MockFn;
}

export const createMockDbService = (overrides: Partial<MockDbService> = {}): MockDbService => ({
  getAllSessions: asyncMockFn([]),
  getAllSessionMetadata: asyncMockFn([]),
  getSession: asyncMockFn(null),
  getSessionMetadataOnly: asyncMockFn(null),
  searchSessions: asyncMockFn([]),
  setAllSessions: asyncMockFn(undefined),
  saveSession: asyncMockFn(undefined),
  deleteSession: asyncMockFn(undefined),
  getAllGroups: asyncMockFn([]),
  setAllGroups: asyncMockFn(undefined),
  getAllScenarios: asyncMockFn([]),
  setAllScenarios: asyncMockFn(undefined),
  getAppSettings: asyncMockFn(undefined),
  setAppSettings: asyncMockFn(undefined),
  getActiveSessionId: asyncMockFn(null),
  setActiveSessionId: asyncMockFn(undefined),
  addLogs: asyncMockFn(undefined),
  getLogs: asyncMockFn([]),
  clearLogs: asyncMockFn(undefined),
  pruneLogs: asyncMockFn(undefined),
  addApiUsageRecord: asyncMockFn(undefined),
  getApiUsageByTimeRange: asyncMockFn([]),
  clearApiUsage: asyncMockFn(undefined),
  estimateAppDataSize: asyncMockFn({
    totalBytes: 0,
    indexedDbBytes: 0,
    localStorageBytes: 0,
  }),
  clearAllData: asyncMockFn(undefined),
  ...overrides,
});

export const createMockLogService = (overrides: Partial<MockLogService> = {}): MockLogService => ({
  error: mockFn(),
  warn: mockFn(),
  info: mockFn(),
  debug: mockFn(),
  setEnabled: mockFn(),
  recordTokenUsage: mockFn(),
  recordApiKeyUsage: mockFn(),
  getRecentLogs: asyncMockFn([]),
  clearLogs: asyncMockFn(undefined),
  ...overrides,
});

export const createMockBroadcastChannel = () => {
  const instances: MockBroadcastChannelInstance[] = [];
  const BroadcastChannelMock = vi.fn(function MockBroadcastChannel(name: string) {
    const instance: MockBroadcastChannelInstance = {
      name,
      postMessage: mockFn(),
      close: mockFn(),
      onmessage: null,
      addEventListener: mockFn(),
      removeEventListener: mockFn(),
      dispatchEvent: vi.fn(() => true) as MockFn,
    };

    instances.push(instance);
    return instance;
  });

  return { BroadcastChannelMock, instances };
};
