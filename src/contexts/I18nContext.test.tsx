import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setupStoreStateReset } from '@/test/stores/reset';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { I18nProvider, useI18n } from './I18nContext';

const TranslationProbe = () => {
  const { t } = useI18n();
  return <div data-testid="translation-probe">{t('newChat')}</div>;
};

describe('I18nContext', () => {
  setupStoreStateReset();

  it('updates translated text when the language in the settings store changes', async () => {
    useSettingsStore.setState({ language: 'en' as SupportedLanguage });
    const view = render(
      <I18nProvider>
        <TranslationProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId('translation-probe').textContent).toBe('New Chat');

    await act(async () => {
      useSettingsStore.setState({ language: 'zh' as SupportedLanguage });
    });

    await waitFor(() => expect(screen.getByTestId('translation-probe').textContent).toBe('新聊天'));

    await act(async () => {
      useSettingsStore.setState({ language: 'ja' as SupportedLanguage });
    });

    await waitFor(() => expect(screen.getByTestId('translation-probe').textContent).toBe('新しいチャット'));

    view.unmount();
  });
});
