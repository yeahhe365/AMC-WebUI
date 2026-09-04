import { expect, test } from '@playwright/test';
import { seedAppState } from './helpers/appHarness';

const SESSION_ID = 'e2e-scroll-bottom-session';
const TURNS = 12;

const longModelContent = (turn: number) =>
  `## Turn ${turn} answer\n\n` +
  Array.from(
    { length: 6 },
    (_, paragraph) =>
      `Paragraph ${turn}-${paragraph}: ${'The quick brown fox jumps over the lazy dog. '.repeat(
        6,
      )}Lorem ipsum dolor sit amet, consectetur adipiscing elit.\n\n`,
  ).join('');

const buildMessages = () => {
  const messages: Array<{
    id: string;
    role: 'user' | 'model';
    content: string;
  }> = [];
  for (let turn = 0; turn < TURNS; turn++) {
    messages.push({
      id: `u-${turn}`,
      role: 'user',
      content: `User question number ${turn}: please explain something in detail.`,
    });
    messages.push({
      id: `m-${turn}`,
      role: 'model',
      content: longModelContent(turn),
    });
  }
  return messages;
};

test('chat scroll-to-bottom paths land at the true bottom of the message list', async ({ page }) => {
  await seedAppState(page, {
    session: {
      id: SESSION_ID,
      title: 'E2E Scroll Bottom',
      messages: buildMessages(),
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
  await expect(page.locator('.chat-message-list-scroller')).toBeVisible();

  const residual = () =>
    page.evaluate(() => {
      const el = document.querySelector('.chat-message-list-scroller');
      return el ? Math.round(el.scrollHeight - el.clientHeight - el.scrollTop) : Number.NaN;
    });

  // The restore pass renders the bottom window first; wait for the last
  // message before judging the resting position.
  await expect(page.locator('[data-message-id="m-11"]')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect.poll(residual, { timeout: 15_000 }).toBeLessThanOrEqual(1);

  // At the true bottom only the scroll-up control remains (the scroll-down
  // control requires !atBottom, which must be false here).
  const navButtons = page.locator('div[class*="z-30"][class*="right-3"] button');
  await expect(navButtons).toHaveCount(1);

  // Jump up, then use the double-click scroll-to-bottom shortcut.
  await page.evaluate(() => {
    const el = document.querySelector('.chat-message-list-scroller');
    if (el) el.scrollTop = Math.max(0, el.scrollTop - 1500);
  });
  await expect(navButtons).toHaveCount(2);
  await navButtons.last().dblclick();
  await expect.poll(residual, { timeout: 15_000 }).toBeLessThanOrEqual(1);
  await expect(navButtons).toHaveCount(1);
});
