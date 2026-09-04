import { expect, test } from '@playwright/test';
import { installMockPyodideWorker, seedAppState } from './helpers/appHarness';

const SESSION_ID = 'e2e-compact-flow-session';

test.beforeEach(async ({ page }) => {
  await installMockPyodideWorker(page);
});

test('compact: empty collapse, growth, expand corner and clear flow', async ({ page }) => {
  await seedAppState(page, {
    session: {
      id: SESSION_ID,
      title: 'Compact Flow',
      messages: [],
      settings: {
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
      },
    },
  });

  await page.goto(`/chat/${SESSION_ID}`);
  const textarea = page.getByLabel('Chat message input');
  await expect(textarea).toBeVisible();

  const frame = page.locator('[data-composer-editor-frame]');
  const corner = page.locator('[data-composer-expand-corner]');

  // 1. Empty state: compact single line, no corner/handle decorations.
  await page.waitForTimeout(700);
  expect(await frame.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(40);
  await expect(corner).toHaveCount(0);

  // 2. One line stays compact.
  await textarea.click();
  await textarea.pressSequentially('hello single line');
  await page.waitForTimeout(600);
  expect(await frame.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(40);
  await expect(corner).toHaveCount(0);

  // 3. Second line grows to regular and corner reappears.
  await textarea.press('Shift+Enter');
  await textarea.pressSequentially('second line');
  await page.waitForTimeout(700);
  expect(await frame.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(40);
  await expect(corner).toHaveCount(1);

  // 4. Expand via corner, then collapse.
  await corner.hover();
  await corner.getByRole('button').click();
  await page.waitForTimeout(700);
  const expandedHeight = await frame.evaluate((el) => el.getBoundingClientRect().height);
  expect(expandedHeight).toBeGreaterThanOrEqual(220);
  await corner.hover();
  await corner.getByRole('button').click();
  await page.waitForTimeout(700);
  expect(await frame.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(expandedHeight);

  // 5. Clear via eraser collapses back to compact and input stays usable.
  await page.locator('[data-testid="clear-input-button"]').click();
  await page.waitForTimeout(700);
  await expect(textarea).toHaveValue('');
  expect(await frame.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(40);
  await textarea.pressSequentially('works after clear');
  await expect(textarea).toHaveValue('works after clear');
});
