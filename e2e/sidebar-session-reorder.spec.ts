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

/** 行内那层承载“被拖动”视觉状态的 div（opacity-35 加在它身上，不在 li 上）。 */
const rowSurface = (page: Page, title: string) =>
  page
    .locator('li', { has: page.getByRole('link', { name: title, exact: true }) })
    .locator('div.relative')
    .first();

async function openSidebar(page: Page) {
  await page.evaluate(
    ({ storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify({ desktopOpen: true, mobileOpen: false }));
    },
    { storageKey: HISTORY_SIDEBAR_STORAGE_KEY },
  );
}

/** 60 条会话 → 超过虚拟化阈值，走 Virtuoso 渲染窗口。 */
async function seedLargeListFixture(page: Page) {
  const now = Date.now();

  await seedAppState(page, {
    session: createSession('bulk-newest', 'Newest chat', now),
    appSettings: {
      useCustomApiConfig: true,
      apiKey: 'e2e-key',
      isStreamingEnabled: false,
      language: 'en',
    },
  });

  await openSidebar(page);
  await addSessions(
    page,
    Array.from({ length: 59 }, (_, index) =>
      createSession(`bulk-${index}`, `Bulk chat ${index}`, now - (index + 1) * 1_000),
    ),
  );
}

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

  // 松手后不得残留拖拽态：被拖动的行只应在拖动【过程中】变暗（SessionItem 的 isBeingDragged），
  // 一旦 drop 完成就必须恢复。残留会表现为该行一直灰着 + 虚线边框。
  await expect(rowSurface(page, 'Oldest chat')).not.toHaveClass(/opacity-35/);

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

test('a drag cancelled by the virtual list leaves no dimmed row behind', async ({ page }) => {
  // 超过 50 条会话会走 Virtuoso。拖动中贴近列表边缘会触发自动滚动，被拖的行滚出渲染窗口后
  // 会被卸载；浏览器随之取消这次拖拽，既不再派发 dragend 也没有 drop。这里锁定：
  // 松手后那行不得残留“被拖动”的变暗样式（曾经的 bug：一直灰到刷新页面）。
  await seedLargeListFixture(page);
  await page.goto('/');

  const source = page.getByRole('link', { name: 'Newest chat', exact: true });
  await expect(source).toBeVisible();

  const container = page.locator('[data-history-sidebar-root] .overflow-y-auto').first();
  const containerBox = await container.boundingBox();
  const sourceBox = await source.boundingBox();
  if (!containerBox || !sourceBox) {
    throw new Error('Missing bounding box for the drag');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2 - 12, { steps: 4 });

  // 前提确认：拖动确实生效了（源行进入被拖动态），否则后面的断言毫无意义。
  await expect(rowSurface(page, 'Newest chat')).toHaveClass(/opacity-35/);

  // 贴近底部边缘 48px 内 → 自动滚动 → 源行被虚拟列表卸载
  await page.mouse.move(containerBox.x + 60, containerBox.y + containerBox.height - 10, { steps: 10 });
  await expect.poll(async () => container.evaluate((element) => element.scrollTop)).toBeGreaterThan(400);
  await expect(source).toHaveCount(0);

  await page.mouse.up();
  await page.waitForTimeout(300);
  await container.evaluate((element) => {
    element.scrollTop = 0;
  });

  await expect(rowSurface(page, 'Newest chat')).not.toHaveClass(/opacity-35/);
});
