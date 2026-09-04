import type { Page } from '@playwright/test';
import {
  DB_NAME,
  DB_STORE_DEFS,
  DB_VERSION,
  FILES_STORE,
  GROUPS_STORE,
  KEY_VALUE_STORE,
  SCENARIOS_STORE,
  SESSIONS_STORE,
} from '@/services/db/dbSchema';

const ACTIVE_SESSION_STORAGE_KEY = 'activeChatSessionId';

interface SeededSession {
  id: string;
  title: string;
  timestamp?: number;
  messages: Array<{
    id: string;
    role: 'user' | 'model' | 'error';
    content: string;
    timestamp?: string;
    files?: unknown[];
  }>;
  settings: Record<string, unknown>;
}

type SeededAppSettings = Record<string, unknown>;

/**
 * Structured-clone-safe snapshot of the production IndexedDB schema. It is
 * built from src/services/db/dbSchema.ts so the E2E seed cannot drift from the
 * real migration path (store set, keyPaths, indexes), and it is passed into
 * page.evaluate() as plain data because evaluate arguments must survive
 * structured cloning — module references and closures do not.
 */
export interface SerializableDbSchema {
  dbName: string;
  dbVersion: number;
  stores: Array<{
    name: string;
    options?: IDBObjectStoreParameters;
    indexes?: Array<{ name: string; keyPath: string; unique: boolean }>;
  }>;
  seedStores: {
    sessions: string;
    files: string;
    groups: string;
    scenarios: string;
    keyValue: string;
  };
}

export const getSerializableDbSchema = (): SerializableDbSchema => ({
  dbName: DB_NAME,
  dbVersion: DB_VERSION,
  stores: DB_STORE_DEFS.map((storeDef) => ({
    name: storeDef.name,
    ...(storeDef.options ? { options: { ...storeDef.options } } : {}),
    ...(storeDef.indexes
      ? {
          indexes: storeDef.indexes.map((index) => ({
            name: index.name,
            keyPath: index.keyPath,
            unique: index.unique ?? false,
          })),
        }
      : {}),
  })),
  seedStores: {
    sessions: SESSIONS_STORE,
    files: FILES_STORE,
    groups: GROUPS_STORE,
    scenarios: SCENARIOS_STORE,
    keyValue: KEY_VALUE_STORE,
  },
});

export async function installMockPyodideWorker(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;

    class MockPyodideWorker {
      private delegate: Worker | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(scriptUrl: string | URL, options?: WorkerOptions) {
        const url = String(scriptUrl);

        if (!url.startsWith('blob:')) {
          this.delegate = new NativeWorker(scriptUrl, options);
          this.delegate.onmessage = (event) => this.onmessage?.(event);
          this.delegate.onerror = (event) => this.onerror?.(event);
        }
      }

      postMessage(message: Record<string, unknown>, transfer?: Transferable[]) {
        if (this.delegate) {
          this.delegate.postMessage(message, transfer ?? []);
          return;
        }

        if (message.type === 'MOUNT_FILES') {
          queueMicrotask(() => {
            this.onmessage?.(
              new MessageEvent('message', {
                data: { id: message.id, status: 'success', type: 'MOUNT_COMPLETE' },
              }),
            );
          });
          return;
        }

        queueMicrotask(() => {
          this.onmessage?.(
            new MessageEvent('message', {
              data: {
                id: message.id,
                status: 'success',
                output: 'hello from mocked pyodide',
                files: [],
              },
            }),
          );
        });
      }

      terminate() {
        this.delegate?.terminate();
      }

      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (this.delegate) {
          this.delegate.addEventListener(type, listener);
          return;
        }

        if (type === 'message') {
          this.onmessage =
            typeof listener === 'function'
              ? (listener as (event: MessageEvent) => void)
              : (event) => listener.handleEvent(event);
        }

        if (type === 'error') {
          this.onerror =
            typeof listener === 'function'
              ? (listener as (event: Event) => void)
              : (event) => listener.handleEvent(event);
        }
      }

      removeEventListener() {}
    }

    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: MockPyodideWorker,
    });
  });
}

export async function seedAppState(
  page: Page,
  options: {
    session?: SeededSession;
    appSettings?: SeededAppSettings;
  } = {},
) {
  await page.goto('/e2e-seed.html');

  await page.evaluate(
    async ({ schema, activeSessionStorageKey, session, appSettings }) => {
      const sessionStoreName = schema.seedStores.sessions;
      const filesStoreName = schema.seedStores.files;
      const groupStoreName = schema.seedStores.groups;
      const scenarioStoreName = schema.seedStores.scenarios;
      const keyValueStoreName = schema.seedStores.keyValue;

      await new Promise<void>((resolve) => {
        const deleteRequest = indexedDB.deleteDatabase(schema.dbName);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => resolve();
        deleteRequest.onblocked = () => resolve();
      });

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(schema.dbName, schema.dbVersion);

        request.onupgradeneeded = () => {
          const nextDb = request.result;

          // Mirrors createStoreIfMissing() in src/services/db/dbSchema.ts with
          // the same serialized store shapes, so the seeded DB is byte-for-byte
          // the structure the production migration path would create.
          for (const storeDef of schema.stores) {
            if (nextDb.objectStoreNames.contains(storeDef.name)) {
              continue;
            }

            const objectStore = storeDef.options
              ? nextDb.createObjectStore(storeDef.name, storeDef.options)
              : nextDb.createObjectStore(storeDef.name);
            for (const index of storeDef.indexes ?? []) {
              objectStore.createIndex(index.name, index.keyPath, { unique: index.unique });
            }
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(
          [sessionStoreName, filesStoreName, groupStoreName, scenarioStoreName, keyValueStoreName],
          'readwrite',
        );
        tx.objectStore(filesStoreName).clear();
        tx.objectStore(groupStoreName).clear();
        tx.objectStore(scenarioStoreName).clear();

        if (appSettings) {
          tx.objectStore(keyValueStoreName).put(appSettings, 'appSettings');
        }

        if (session) {
          tx.objectStore(sessionStoreName).put({
            ...session,
            timestamp: session.timestamp ?? Date.now(),
            messages: session.messages.map((message) => ({
              ...message,
              timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
            })),
          });
          sessionStorage.setItem(activeSessionStorageKey, session.id);
        } else {
          tx.objectStore(sessionStoreName).clear();
          sessionStorage.removeItem(activeSessionStorageKey);
        }

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },
    {
      schema: getSerializableDbSchema(),
      activeSessionStorageKey: ACTIVE_SESSION_STORAGE_KEY,
      session: options.session,
      appSettings: options.appSettings,
    },
  );
}

export async function mockGeminiTextResponses(
  page: Page,
  options: {
    nonStreamText?: string;
    streamedChunks?: string[];
  },
) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const normalizedUrl = url.toLowerCase();

    if (!normalizedUrl.includes('generatecontent')) {
      await route.continue();
      return;
    }

    if (normalizedUrl.includes('streamgeneratecontent') || normalizedUrl.includes('generatecontentstream')) {
      const chunks = options.streamedChunks ?? ['Streamed ', 'response'];
      const body = `${chunks
        .map(
          (chunk) =>
            `data: ${JSON.stringify({
              candidates: [{ content: { parts: [{ text: chunk }] } }],
            })}\n\n`,
        )
        .join('')}data: ${JSON.stringify({
        candidates: [{ content: { parts: [] } }],
        usageMetadata: {
          promptTokenCount: 4,
          candidatesTokenCount: 2,
          totalTokenCount: 6,
        },
      })}\n\n`;

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body,
        headers: {
          'access-control-allow-origin': '*',
          'cache-control': 'no-cache',
        },
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: options.nonStreamText ?? 'Mocked non-stream response' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 4,
          candidatesTokenCount: 2,
          totalTokenCount: 6,
        },
      }),
    });
  });
}
