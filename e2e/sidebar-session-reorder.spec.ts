import { expect, test, type Locator, type Page } from '@playwright/test';

import { seedAppState } from './helpers/appHarness';

const HISTORY_SIDEBAR_STORAGE_KEY = 'all_model_chat_history_sidebar_v1';
const DB_NAME = 'AllModelChatDB';
const DB_VERSION = 7;

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
        const hasMetadata = db.objectStoreNames.contains('session_metadata');
        const tx = db.transaction(hasMetadata ? ['sessions', 'session_metadata'] : ['sessions'], 'readwrite');
        const store = tx.objectStore('sessions');
        const metaStore = hasMetadata ? tx.objectStore('session_metadata') : null;

        nextSessions.forEach((session) => {
          store.put({
            ...session,
            messages: session.messages.map((message) => ({
              ...message,
              timestamp: new Date(message.timestamp),
            })),
          });
          if (metaStore) {
            metaStore.put({ ...session, messages: [] });
          }
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
  await expect(
    page
      .locator('li', { has: page.getByRole('link', { name: 'Oldest chat', exact: true }) })
      .getByTestId('session-pinned-indicator'),
  ).toBeVisible();
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

/**
 * Virtuoso 先用 initialItemCount 铺占位行、再按真实测量结果校正行高，期间每一行的位置都在变。
 * 读一次 boundingBox 就按下鼠标，指针可能落在邻居行甚至行间空隙上，dragstart 不会触发。
 * 这里等到连续两次读数一致（布局稳定）再返回。
 */
async function settleBoundingBox(locator: Locator) {
  let previous = await locator.boundingBox();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (previous === null) throw new Error('Missing bounding box while settling the row');
    await locator.page().waitForTimeout(50);
    const current = await locator.boundingBox();
    if (current === null) throw new Error('Row disappeared while settling the row');
    if (current.x === previous.x && current.y === previous.y && current.height === previous.height) return current;
    previous = current;
  }
  throw new Error('Row never settled to a stable position');
}

/**
 * 用真实鼠标事件起拖，并确认拖拽真的生效（源行进入被拖动态）。
 * 起拖失败时重试：CI 上指针落到旧坐标属于时序抖动，重试不会削弱断言 ——
 * 后续要验证的「行被虚拟列表卸载后不留变暗」仍然只可能发生在一次真实拖拽里。
 */
async function startNativeDrag(page: Page, title: string) {
  const surface = rowSurface(page, title);
  const source = page.getByRole('link', { name: title, exact: true });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const box = await settleBoundingBox(source);
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX, centerY - 12, { steps: 4 });

    try {
      await expect(surface).toHaveClass(/opacity-35/, { timeout: 3_000 });
      return;
    } catch {
      await page.mouse.up();
      await page.waitForTimeout(200);
    }
  }

  throw new Error(`Could not start a native drag on "${title}" after 3 attempts`);
}

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
  if (!containerBox) {
    throw new Error('Missing bounding box for the session list');
  }

  await startNativeDrag(page, 'Newest chat');

  // 贴近底部边缘 48px 内 → 自动滚动 → 源行被虚拟列表卸载
  await page.mouse.move(containerBox.x + 60, containerBox.y + containerBox.height - 10, { steps: 10 });
  await expect.poll(async () => container.evaluate((element) => element.scrollTop)).toBeGreaterThan(400);
  await expect(source).toHaveCount(0);

  await page.mouse.up();
  await page.waitForTimeout(300);
  await container.evaluate((element) => {
    element.scrollTop = 0;
  });

  // 先确认那行被重新渲染出来了，否则「没有变暗样式」对着一片空白也成立，断言就失去了意义。
  await expect(source).toBeVisible();
  await expect(rowSurface(page, 'Newest chat')).not.toHaveClass(/opacity-35/);
});
