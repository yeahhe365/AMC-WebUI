import { expect, test } from '@playwright/test';
import { seedAppState } from './helpers/appHarness';

// Full MCP tool-loop e2e: the real API server (started by the playwright
// webServer config with ENABLE_MCP_STDIO) spawns the real stdio MCP fixture;
// only the Gemini endpoint is mocked. The mock answers the discovery turn
// with a functionCall for the first MCP declaration the app sends, and echoes
// the real tool output in the final turn so the assertion proves the loop.

const JSON_HEADERS = { 'access-control-allow-origin': '*', 'cache-control': 'no-cache' };

test('executes a real MCP tool inside the Gemini tool loop', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = route.request().url().toLowerCase();
    if (!url.includes('generatecontent')) {
      await route.continue();
      return;
    }
    const body = route.request().postData() ?? '';

    if (body.includes('functionResponse')) {
      const match = body.match(/echo: loop-test[^"\\]*/) ?? ['TOOL_RESULT_MISSING'];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: `FINAL_TOOL_OUTPUT>> ${match[0]} <<END` }] } }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
        }),
      });
      return;
    }

    const decl = body.match(/"name":"(mcp_[a-z0-9_]+)"/);
    const fnName = decl ? decl[1] : 'mcp_UNKNOWN';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ functionCall: { name: fnName, args: { text: 'loop-test' } } }] } }],
        usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
      }),
    });
  });

  await seedAppState(page, {
    appSettings: {
      useCustomApiConfig: true,
      apiKey: 'e2e-key',
      isStreamingEnabled: false,
      isAutoTitleEnabled: false,
      language: 'en',
      mcpServers: [
        {
          id: 'e2e-stdio',
          name: 'E2E StdIO',
          enabled: true,
          transport: 'stdio',
          command: 'node',
          args: ['e2e/fixtures/mcp-test-server.mjs'],
          env: { MCP_TEST_MARKER: 'loop-env-ok' },
        },
      ],
    },
  });

  await page.goto('/');

  const input = page.getByLabel('Chat message input');
  await expect(input).toBeVisible();
  await input.fill('Please call the echo tool with text loop-test');
  await page.getByLabel('Send message').click();
  await page.waitForURL(/\/chat\//);

  const messageList = page.locator('[data-testid="virtuoso-item-list"]');
  await expect(messageList.getByText('FINAL_TOOL_OUTPUT>>')).toBeVisible({ timeout: 30_000 });
  // The final answer must embed the REAL stdio MCP server's output, including
  // the environment variable only the real child process could see.
  await expect(messageList.getByText('echo: loop-test (env=loop-env-ok)')).toBeVisible();
});
