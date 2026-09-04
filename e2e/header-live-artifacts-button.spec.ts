import { expect, test } from '@playwright/test';

test('Live Artifacts helper toggles on from an edge tap after hover', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const liveArtifactsButton = page.getByRole('button', {
    name: /Load Live Artifacts prompt|加载 Live Artifacts 提示/,
  });

  await expect(liveArtifactsButton).toBeVisible();

  const box = await liveArtifactsButton.boundingBox();
  expect(box).not.toBeNull();

  if (!box) {
    return;
  }

  const centerY = box.y + box.height / 2;

  // Hover first so any hover-state transform is active, then tap near the edge.
  // Keep a small inset to avoid device-pixel rounding pushing the click outside.
  await page.mouse.move(box.x + box.width / 2, centerY);
  await page.waitForTimeout(50);
  await page.mouse.move(box.x + box.width - 2, centerY);
  await page.mouse.down();
  await page.waitForTimeout(20);
  await page.mouse.up();

  await expect(
    page.getByRole('button', {
      name: /Live Artifacts prompt is active\. Click to remove\.|Live Artifacts 提示已激活。点击移除。/,
    }),
  ).toBeVisible();
});
