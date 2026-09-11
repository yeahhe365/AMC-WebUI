import { devices, expect, test, type Page } from '@playwright/test';

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

const createSession = (id: string, title: string, timestamp: number) => ({
  id,
  title,
  timestamp,
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

async function addSessions(page: Page, sessions: Array<ReturnType<typeof createSession>>) {
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

async function seedSidebarFixture(page: Page, options?: { collapsed?: boolean; mobileOpen?: boolean }) {
  const now = Date.now();
  const activeSession = createSession('sidebar-active', 'Active session', now);
  const targetSession = createSession('sidebar-target', 'Target session', now - 1_000);
  const extraSession = createSession('sidebar-extra', 'Extra session', now - 2_000);

  await seedAppState(page, {
    session: activeSession,
    appSettings: {
      useCustomApiConfig: true,
      apiKey: 'e2e-key',
      isStreamingEnabled: false,
      language: 'en',
    },
  });

  await page.evaluate(
    ({ collapsed, mobileOpen, storageKey }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          desktopOpen: !collapsed,
          mobileOpen,
        }),
      );
    },
    {
      collapsed: options?.collapsed ?? false,
      mobileOpen: options?.mobileOpen ?? false,
      storageKey: HISTORY_SIDEBAR_STORAGE_KEY,
    },
  );

  await addSessions(page, [targetSession, extraSession]);

  return {
    activeSession,
    targetSession,
    extraSession,
  };
}

test('sidebar session link still activates after a slight pointer move', async ({ page }) => {
  const { activeSession, targetSession } = await seedSidebarFixture(page);

  await page.goto(`/chat/${activeSession.id}`);

  const link = page.getByRole('link', { name: targetSession.title, exact: true });
  await expect(link).toBeVisible();

  const box = await link.boundingBox();
  expect(box).not.toBeNull();

  if (!box) {
    throw new Error('Expected target session link to have a bounding box');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2 + 2);
  await page.mouse.up();

  await expect(page).toHaveURL(new RegExp(`/chat/${targetSession.id}$`));
});

test('sidebar session menu still opens after a slight pointer move', async ({ page }) => {
  const { activeSession, targetSession } = await seedSidebarFixture(page);

  await page.goto(`/chat/${activeSession.id}`);

  const sessionRow = page.locator('li', { hasText: targetSession.title });
  await sessionRow.hover();

  const menuButton = sessionRow.locator('button').first();
  await expect(menuButton).toBeVisible();

  const box = await menuButton.boundingBox();
  expect(box).not.toBeNull();

  if (!box) {
    throw new Error('Expected session menu button to have a bounding box');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2 + 2);
  await page.mouse.up();

  await expect(page.getByRole('menuitem', { name: /^Edit/ })).toBeVisible();
});

test('collapsed recent chats popover stays open while traversing from button to panel', async ({ page }) => {
  const { activeSession } = await seedSidebarFixture(page, { collapsed: true });

  await page.goto(`/chat/${activeSession.id}`);

  const button = page.getByRole('button', { name: 'Recent Chats', exact: true });
  await expect(button).toBeVisible();
  await button.hover();

  const panel = page.getByRole('dialog', { name: 'Recent Chats', exact: true });
  await expect(panel).toBeVisible();

  const buttonBox = await button.boundingBox();
  const panelBox = await panel.boundingBox();

  expect(buttonBox).not.toBeNull();
  expect(panelBox).not.toBeNull();

  if (!buttonBox || !panelBox) {
    throw new Error('Expected recent chats button and panel to have bounding boxes');
  }

  const buttonRight = buttonBox.x + buttonBox.width;
  const transitX = buttonRight + Math.max(1, Math.round((panelBox.x - buttonRight) / 2));
  const transitY = buttonBox.y + buttonBox.height / 2;

  await page.mouse.move(transitX, transitY);
  await page.waitForTimeout(180);
  await expect(panel).toBeVisible();

  await page.mouse.move(panelBox.x + 24, panelBox.y + 24);
  await expect(panel).toBeVisible();
});

test('collapsed recent chats popover opened by click stays open until explicit dismissal', async ({ page }) => {
  const { activeSession } = await seedSidebarFixture(page, { collapsed: true });

  await page.goto(`/chat/${activeSession.id}`);

  const button = page.getByRole('button', { name: 'Recent Chats', exact: true });
  await expect(button).toBeVisible();
  await button.click();

  const panel = page.getByRole('dialog', { name: 'Recent Chats', exact: true });
  await expect(panel).toBeVisible();

  const buttonBox = await button.boundingBox();
  expect(buttonBox).not.toBeNull();

  if (!buttonBox) {
    throw new Error('Expected recent chats button to have a bounding box');
  }

  await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
  await page.mouse.move(buttonBox.x - 30, buttonBox.y - 20);
  await page.waitForTimeout(180);
  await expect(panel).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test.describe('mobile sidebar tap targets', () => {
  const mobileDevice = { ...devices['iPhone 13'] };
  delete (mobileDevice as { defaultBrowserType?: string }).defaultBrowserType;

  test.use(mobileDevice);

  test('mobile tap on the right edge of a session row still opens that session', async ({ page }) => {
    const { activeSession, targetSession } = await seedSidebarFixture(page, {
      mobileOpen: true,
    });

    await page.goto(`/chat/${activeSession.id}`);

    const history = page.getByRole('complementary', { name: 'History', exact: true });
    await expect(history).toBeVisible();

    const sessionRow = history.locator('li', { hasText: targetSession.title }).first();
    const box = await sessionRow.boundingBox();
    expect(box).not.toBeNull();

    if (!box) {
      throw new Error('Expected target session row to have a bounding box');
    }

    await page.touchscreen.tap(box.x + box.width - 12, box.y + box.height / 2);

    await expect(page).toHaveURL(new RegExp(`/chat/${targetSession.id}$`));
  });
});
