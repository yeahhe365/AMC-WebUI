import { expect, test } from '@playwright/test';

import { seedAppState } from './helpers/appHarness';

const SESSION_ID = 'settings-model-selector-session';

test('editing the system prompt still persists when switching to models and selecting a model', async ({ page }) => {
  await seedAppState(page, {
    session: {
      id: SESSION_ID,
      title: 'Settings model selector',
      messages: [],
      settings: {
        modelId: 'gemini-3-flash-preview',
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
    appSettings: {
      useCustomApiConfig: true,
      apiKey: 'e2e-key',
      isStreamingEnabled: false,
      language: 'en',
    },
  });

  await page.goto(`/chat/${SESSION_ID}`);

  await page
    .getByRole('complementary', { name: 'History', exact: true })
    .getByRole('button', { name: 'Settings', exact: true })
    .click();

  await page.getByRole('tab', { name: 'Models' }).click();

  const textarea = page.locator('#system-prompt-input');
  await expect(textarea).toBeVisible();
  await textarea.click();
  await textarea.fill('Persist this prompt while selecting a model');

  const targetButton = page.getByTestId('settings-model-option-gemini-native:gemma-4-31b-it');

  await targetButton.scrollIntoViewIfNeeded();
  await targetButton.click();

  await expect(targetButton).toContainText('New chat default');

  await expect(textarea).toHaveValue('Persist this prompt while selecting a model');

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'History', exact: true })
    .getByRole('button', { name: 'Settings', exact: true })
    .click();

  await expect(textarea).toHaveValue('Persist this prompt while selecting a model');
  await expect(page.getByTestId('settings-model-option-gemini-native:gemma-4-31b-it')).toContainText(
    'New chat default',
  );
});

test('workspace settings content does not expose a horizontal scrollbar', async ({ page }) => {
  await seedAppState(page, {
    appSettings: {
      language: 'en',
    },
  });

  await page.goto('/');

  await page
    .getByRole('complementary', { name: 'History', exact: true })
    .getByRole('button', { name: 'Settings', exact: true })
    .click();

  await page.getByRole('tab', { name: 'Interface & Interaction' }).click();

  const settingsScroller = page.locator('main > div').first();

  await expect.poll(() => settingsScroller.evaluate((element) => getComputedStyle(element).overflowX)).toBe('hidden');
});
