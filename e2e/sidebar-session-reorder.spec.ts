import { expect, test, type Page } from '@playwright/test';

import { seedAppState } from './helpers/appHarness';

const HISTORY_SIDEBAR_STORAGE_KEY = 'all_model_chat_history_sidebar_v1';
const DB_NAME = 'AllModelChatDB';
const DB_VERSION = 5;

const BASE_SETTINGS = {
  modelId: 'gemini-2.5-flash',
  temperature: 1,
  topP: 0.95,
  topK: 64,
  showThoughts: true,
  systemInstruction: '',
  ttsVoice: 'Aoede',
  thinkingBudget: 0,
  thinkingLevel: 'HIGH',
  lockedApiKey: null,
  isGoogleSearchEnabled: false,
  isCodeExecutionEnabled: false,
  isUrlContextEnabled: false,
  isDeepSearchEnabled: false,
  isRawModeEnabled: false,
  hideThinkingInContext: false,
  safetySettings: [],
  mediaResolution: 'MEDIA_RESOLUTION_UNSPECIFIED',
};

const createSession = (id: string, title: string, timestamp: number, isPinned = false) => ({
  id,
  title,
  timestamp,
  isPinned,
  messages: [
    {
      id: `${id}-message`,
      role: 'user' as const,
      content: `${title} content`,
      timestamp: new Date(timestamp).toISOString(),
    },
  ],
  settings: BASE_SETTINGS,
});

type SeededSession = ReturnType<typeof createSession>;

async function addSessions(page: Page, sessions: SeededSession[]) {
  await page.evaluate(
    async ({ nextSessions, dbName, dbVersion }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['sessions'], 'readwrite');
        const store = tx.objectStore('sessions');

        nextSessions.forEach((session) => {
          store.put({
            ...session,
            messages: session.messages.map((message) => ({
              ...message,
              timestamp: new Date(message.timestamp),
            })),
          });
        });

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },
    { nextSessions: sessions, dbName: DB_NAME, dbVersion: DB_VERSION },
  );
}

async function readStoredSessions(page: Page) {
  return page.evaluate(
    async ({ dbName, dbVersion }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const sessions = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const tx = db.transaction(['sessions'], 'readonly');
        const request = tx.objectStore('sessions').getAll();
        request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
        request.onerror = () => reject(request.error);
      });

      db.close();
      return sessions.map((session) => ({
        id: session.id as string,
        sortOrder: session.sortOrder as number | undefined,
        isPinned: !!session.isPinned,
      }));
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION },
  );
}

/** 三个未分组会话 + 一个已置顶会话，时间戳固定，避免排序受创建时刻影响。 */
async function seedReorderFixture(page: Page) {
  const now = Date.now();
  const newest = createSession('reorder-newest', 'Newest chat', now);

  await seedAppState(page, {
    session: newest,
    appSettings: {
      useCustomApiConfig: true,
      apiKey: 'e2e-key',
      isStreamingEnabled: false,
      language: 'en',
    },
  });

  await page.evaluate(
    ({ storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify({ desktopOpen: true, mobileOpen: false }));
    },
    { storageKey: HISTORY_SIDEBAR_STORAGE_KEY },
  );

  await addSessions(page, [
    createSession('reorder-middle', 'Middle chat', now - 1_000),
    createSession('reorder-oldest', 'Oldest chat', now - 2_000),
    createSession('reorder-pinned', 'Pinned chat', now - 3_000, true),
  ]);
}

const sessionLinks = (page: Page) => page.locator('[data-history-sidebar-root] li a');

/** 真·原生拖拽：分步移动鼠标，让 Chromium 触发 dragstart / dragover / drop。 */
async function dragSessionOnto(page: Page, sourceTitle: string, targetTitle: string, position: 'above' | 'below') {
  const source = page.getByRole('link', { name: sourceTitle, exact: true });
  const target = page.getByRole('link', { name: targetTitle, exact: true });

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error(`Missing bounding box for drag ${sourceTitle} -> ${targetTitle}`);
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = position === 'above' ? targetBox.y + 3 : targetBox.y + targetBox.height - 3;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY - 12, { steps: 4 });
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.move(endX, endY, { steps: 2 });
  await page.mouse.up();
}

test('dragging a session reorders it and the order survives a reload', async ({ page }) => {
  await seedReorderFixture(page);
  await page.goto('/');

  await expect(sessionLinks(page)).toHaveText(['Pinned chat', 'Newest chat', 'Middle chat', 'Oldest chat']);

  await dragSessionOnto(page, 'Oldest chat', 'Newest chat', 'above');

  await expect(sessionLinks(page)).toHaveText(['Pinned chat', 'Oldest chat', 'Newest chat', 'Middle chat']);

  await page.reload();

  await expect(sessionLinks(page)).toHaveText(['Pinned chat', 'Oldest chat', 'Newest chat', 'Middle chat']);
});

test('a single drag rewrites exactly one session record', async ({ page }) => {
  await seedReorderFixture(page);
  await page.goto('/');
  await expect(sessionLinks(page)).toHaveText(['Pinned chat', 'Newest chat', 'Middle chat', 'Oldest chat']);

  // 等首次加载的 orderKey 回填写完，再取基线快照。
  await expect
    .poll(async () => (await readStoredSessions(page)).every((session) => typeof session.sortOrder === 'number'))
    .toBe(true);
  const before = await readStoredSessions(page);

  await dragSessionOnto(page, 'Oldest chat', 'Newest chat', 'above');
  await expect(sessionLinks(page)).toHaveText(['Pinned chat', 'Oldest chat', 'Newest chat', 'Middle chat']);

  await expect
    .poll(async () => {
      const after = await readStoredSessions(page);
      return after.filter(
        (session) => before.find((previous) => previous.id === session.id)?.sortOrder !== session.sortOrder,
      ).length;
    })
    .toBe(1);

  const after = await readStoredSessions(page);
  const changed = after.filter(
    (session) => before.find((previous) => previous.id === session.id)?.sortOrder !== session.sortOrder,
  );
  expect(changed.map((session) => session.id)).toEqual(['reorder-oldest']);
});

test('dropping a plain session into the pinned zone pins it', async ({ page }) => {
  await seedReorderFixture(page);
  await page.goto('/');
  await expect(sessionLinks(page)).toHaveText(['Pinned chat', 'Newest chat', 'Middle chat', 'Oldest chat']);

  await dragSessionOnto(page, 'Oldest chat', 'Pinned chat', 'above');

  await expect
    .poll(async () => (await readStoredSessions(page)).find((session) => session.id === 'reorder-oldest')?.isPinned)
    .toBe(true);

  // 置顶项会渲染图钉图标。
  await expect(page.getByRole('link', { name: 'Oldest chat', exact: true }).locator('svg').first()).toBeVisible();
});

test('group view drops the date subheaders in the ungrouped area', async ({ page }) => {
  await seedReorderFixture(page);
  await page.goto('/');
  await expect(sessionLinks(page)).toHaveText(['Pinned chat', 'Newest chat', 'Middle chat', 'Oldest chat']);

  const sidebar = page.locator('[data-history-sidebar-root]');
  await expect(sidebar).toContainText('Pinned');
  await expect(sidebar).not.toContainText('Today');
  await expect(sidebar).not.toContainText('Yesterday');
});

test('time view disables session dragging', async ({ page }) => {
  await seedReorderFixture(page);
  await page.goto('/');
  await expect(sessionLinks(page)).toHaveText(['Pinned chat', 'Newest chat', 'Middle chat', 'Oldest chat']);

  await page.getByRole('button', { name: 'By time' }).click();

  await expect(sessionLinks(page).first()).toHaveAttribute('draggable', 'false');
  await expect(page.locator('[data-history-sidebar-root]')).toContainText('Today');
});
