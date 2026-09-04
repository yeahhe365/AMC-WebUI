import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render/providerRenderer';
import { DEFAULT_APP_SETTINGS, DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { ApiUsageTab } from './ApiUsageTab';

describe('ApiUsageTab', () => {
  it('lists keys as rows instead of KPI cards', () => {
    const { container } = renderWithProviders(
      <ApiUsageTab
        apiKeyUsage={new Map([['key-a', 3]])}
        appSettings={{ ...DEFAULT_APP_SETTINGS, apiKey: 'key-a' }}
        currentChatSettings={{ ...DEFAULT_CHAT_SETTINGS, lockedApiKey: 'key-a' }}
      />,
      { language: 'en' },
    );

    expect(container.innerHTML).not.toContain('lg:grid-cols-3');
    expect(container.innerHTML).not.toContain('bg-green-900');
    expect(container.innerHTML).not.toContain('text-2xl');
    expect(container.textContent).toContain('Active');
    expect(container.textContent).toContain('3');
  });
});
