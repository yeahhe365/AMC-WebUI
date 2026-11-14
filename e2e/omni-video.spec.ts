import { expect, test } from '@playwright/test';
import { seedAppState } from './helpers/appHarness';

test('creates and edits an Omni video and restores it after reload', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/v1beta/interactions')) {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      const fileId = `omni-video-${requests.length}`;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          id: `interaction-${requests.length}`,
          status: 'completed',
          model: 'gemini-omni-1.2-flash',
          object: 'interaction',
          steps: [{ type: 'model_output', content: [{ type: 'video', uri: `files/${fileId}` }] }],
        }),
      });
      return;
    }
    if (url.pathname.includes('/v1beta/files/omni-video-')) {
      if (url.pathname.endsWith(':download')) {
        await route.fulfill({ status: 200, contentType: 'video/mp4', body: 'mock video bytes' });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ name: `files/${url.pathname.split('/').pop()}`, state: 'ACTIVE' }),
        });
      }
      return;
    }
    if (url.hostname === 'generativelanguage.googleapis.com') {
      await route.abort();
      return;
    }
    await route.continue();
  });

  await seedAppState(page, {
    appSettings: { useCustomApiConfig: true, apiKey: 'e2e-key', isAutoTitleEnabled: false, language: 'en' },
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Current AI Model/ }).click();
  await page.getByRole('option', { name: /Gemini Omni 1\.2 Flash/ }).click();
  await expect(page.getByText(/Paid model: 720p video/)).toBeVisible();

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'reference.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/eZkAAAAASUVORK5CYII=',
        'base64',
      ),
    });
  const input = page.getByLabel('Chat message input');
  await input.fill('Animate this image');
  await page.getByLabel('Send message').click();
  await expect(page.locator('video')).toHaveCount(1);
  expect(requests[0]).toMatchObject({
    model: 'gemini-omni-1.2-flash',
    input: [
      expect.objectContaining({ type: 'image', mime_type: 'image/png' }),
      { type: 'text', text: 'Animate this image' },
    ],
  });

  await input.fill('Make the background blue');
  await page.getByLabel('Send message').click();
  await expect(page.locator('video')).toHaveCount(2);
  expect(requests[1]).toMatchObject({ input: 'Make the background blue', previous_interaction_id: 'interaction-1' });
  await expect(page.locator('a[download^="generated-video-"]')).toHaveCount(2);

  await page.reload();
  await expect(page.locator('video')).toHaveCount(2);
  await input.fill('Add snow');
  await page.getByLabel('Send message').click();
  await expect(page.locator('video')).toHaveCount(3);
  expect(requests[2]).toMatchObject({ input: 'Add snow', previous_interaction_id: 'interaction-2' });
});

test('displays an Omni text answer and keeps the conversation for video generation', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/v1beta/interactions')) {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      const content =
        requests.length === 1
          ? [{ type: 'text', text: 'Hello, I am Gemini.' }]
          : [{ type: 'video', uri: 'files/omni-text-followup' }];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `interaction-${requests.length}`,
          status: 'completed',
          model: 'gemini-omni-1.2-flash',
          object: 'interaction',
          steps: [{ type: 'model_output', content }],
        }),
      });
      return;
    }
    if (url.pathname.includes('/v1beta/files/omni-text-followup')) {
      await route.fulfill(
        url.pathname.endsWith(':download')
          ? { status: 200, contentType: 'video/mp4', body: 'mock video bytes' }
          : { status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'ACTIVE' }) },
      );
      return;
    }
    if (url.hostname === 'generativelanguage.googleapis.com') {
      await route.abort();
      return;
    }
    await route.continue();
  });

  await seedAppState(page, {
    appSettings: { useCustomApiConfig: true, apiKey: 'e2e-key', isAutoTitleEnabled: false, language: 'en' },
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Current AI Model/ }).click();
  await page.getByRole('option', { name: /Gemini Omni 1\.2 Flash/ }).click();

  const input = page.getByLabel('Chat message input');
  await input.fill('Who are you?');
  await page.getByLabel('Send message').click();
  await expect(page.getByText('Hello, I am Gemini.')).toBeVisible();
  await expect(page.getByText(/Video generation returned no downloadable video/)).toHaveCount(0);

  await input.fill('Make a video of a red circle.');
  await page.getByLabel('Send message').click();
  await expect(page.locator('video')).toHaveCount(1);
  expect(requests[1]).toMatchObject({
    input: 'Make a video of a red circle.',
    previous_interaction_id: 'interaction-1',
  });
  await page.reload();
  await expect(page.getByText('Hello, I am Gemini.')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(1);
});
