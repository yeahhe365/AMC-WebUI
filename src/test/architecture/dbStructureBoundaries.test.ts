import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { DB_VERSION } from '@/services/db/dbSchema';
import { projectRoot, readProjectFile } from './projectFiles';

describe('database structure boundaries', () => {
  it('keeps IndexedDB service orchestration split into focused modules', () => {
    const dbServiceSource = readProjectFile('src/services/db/dbService.ts');

    for (const relativePath of [
      'src/services/db/dbSchema.ts',
      'src/services/db/indexedDbAccess.ts',
      'src/services/db/sessionRecords.ts',
      'src/services/db/logRecords.ts',
      'src/services/db/apiUsageRecords.ts',
      'src/services/db/appDataSize.ts',
    ]) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(true);
    }

    expect(fs.existsSync(path.join(projectRoot, 'src/services/db/idbUtils.ts'))).toBe(false);
    expect(dbServiceSource).toContain("from './sessionRecords'");
    expect(dbServiceSource).toContain("from './logRecords'");
    expect(dbServiceSource).toContain("from './apiUsageRecords'");
    expect(dbServiceSource).toContain("from './appDataSize'");
    expect(dbServiceSource).not.toContain('const estimateStoredValueBytes =');
    expect(dbServiceSource).not.toContain('const persistSessionRecord =');
    expect(dbServiceSource).not.toContain('const getSessionFileRecords =');
    expect(dbServiceSource.length).toBeLessThan(12000);
  });

  it('projects the production schema into the E2E seed payload without drift', async () => {
    const { getSerializableDbSchema } = await import('../../../e2e/helpers/appHarness');

    // Literal pinned to the pre-single-source harness copy (e2e/helpers/appHarness.ts
    // before it consumed dbSchema): any shape change here must be a conscious one.
    expect(getSerializableDbSchema()).toEqual({
      dbName: 'AllModelChatDB',
      dbVersion: DB_VERSION,
      stores: [
        { name: 'sessions', options: { keyPath: 'id' } },
        { name: 'groups', options: { keyPath: 'id' } },
        { name: 'scenarios', options: { keyPath: 'id' } },
        { name: 'keyValueStore' },
        {
          name: 'logs',
          options: { keyPath: 'id', autoIncrement: true },
          indexes: [{ name: 'timestamp', keyPath: 'timestamp', unique: false }],
        },
        {
          name: 'files',
          options: { keyPath: 'id' },
          indexes: [{ name: 'sessionId', keyPath: 'sessionId', unique: false }],
        },
        {
          name: 'api_usage',
          options: { keyPath: 'id', autoIncrement: true },
          indexes: [{ name: 'timestamp', keyPath: 'timestamp', unique: false }],
        },
      ],
      seedStores: {
        sessions: 'sessions',
        files: 'files',
        groups: 'groups',
        scenarios: 'scenarios',
        keyValue: 'keyValueStore',
      },
    });
  });
});
