import type { AppSettings, ChatGroup, SavedScenario } from '@/types';
import { DB_STORE_NAMES, GROUPS_STORE, SCENARIOS_STORE } from './dbSchema';
import { estimateAppDataSize } from './appDataSize';
import { addApiUsageRecord, clearApiUsage, getApiUsageByTimeRange } from './apiUsageRecords';
import {
  getAll,
  getDb,
  getKeyValue,
  setAll,
  setKeyValue,
  transactionToPromise,
  withWriteLock,
} from './indexedDbAccess';
import { addLogs, clearLogs, getLogs, pruneLogs } from './logRecords';
import {
  deleteSession,
  getAllSessionMetadata,
  getAllSessions,
  getSession,
  getSessionMetadataOnly,
  saveSession,
  searchSessions,
  setAllSessions,
} from './sessionRecords';

export type {
  ApiUsageExactPricing,
  ApiUsageModalityTokenCount,
  ApiUsageRecord,
  ApiUsageRequestKind,
} from './apiUsageRecords';
export type { AppDataSizeEstimate } from './appDataSize';

export const dbService = {
  getAllSessions,
  getSession,
  getSessionMetadataOnly,
  getAllSessionMetadata,
  searchSessions,
  setAllSessions,
  saveSession,
  deleteSession,

  getAllGroups: () => getAll<ChatGroup>(GROUPS_STORE),
  setAllGroups: (groups: ChatGroup[]) => setAll<ChatGroup>(GROUPS_STORE, groups),

  getAllScenarios: () => getAll<SavedScenario>(SCENARIOS_STORE),
  setAllScenarios: (scenarios: SavedScenario[]) => setAll<SavedScenario>(SCENARIOS_STORE, scenarios),

  getAppSettings: () => getKeyValue<AppSettings>('appSettings'),
  setAppSettings: (settings: AppSettings) => setKeyValue<AppSettings>('appSettings', settings),

  getActiveSessionId: () => getKeyValue<string | null>('activeSessionId'),
  setActiveSessionId: (id: string | null) => setKeyValue<string | null>('activeSessionId', id),

  addLogs,
  getLogs,
  clearLogs,
  pruneLogs,

  addApiUsageRecord,
  getApiUsageByTimeRange,
  clearApiUsage,

  estimateAppDataSize,
  clearAllData: () =>
    withWriteLock(async () => {
      const db = await getDb();
      const tx = db.transaction(DB_STORE_NAMES, 'readwrite');
      for (const storeName of DB_STORE_NAMES) tx.objectStore(storeName).clear();
      return transactionToPromise(tx);
    }),
};
