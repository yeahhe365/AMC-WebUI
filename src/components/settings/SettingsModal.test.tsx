import { act, type ComponentProps } from 'react';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS, DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { ensureFeatureTranslations } from '@/i18n/featureTranslations';
import { setupStoreStateReset } from '@/test/stores/reset';
import { useSettingsUiStore } from '@/stores/settingsUiStore';
import { SettingsModal } from './SettingsModal';

describe('SettingsModal', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  setupStoreStateReset();

  const createSettingsModalProps = (
    overrides: Partial<ComponentProps<typeof SettingsModal>> = {},
  ): ComponentProps<typeof SettingsModal> => ({
    isOpen: true,
    onClose: vi.fn(),
    currentSettings: DEFAULT_APP_SETTINGS,
    currentThemeId: 'pearl',
    availableModels: [],
    onSave: vi.fn(),
    onClearAllHistory: vi.fn(),
    onClearCache: vi.fn(),
    onOpenLogViewer: vi.fn(),
    setAvailableModels: vi.fn(),
    onInstallPwa: vi.fn(),
    installState: 'installed',
    onImportSettings: vi.fn(),
    onExportSettings: vi.fn(),
    onImportHistory: vi.fn(),
    onExportHistory: vi.fn(),
    onImportScenarios: vi.fn(),
    onExportScenarios: vi.fn(),
    ...overrides,
  });

  const renderSettingsModal = async (overrides: Partial<ComponentProps<typeof SettingsModal>> = {}) => {
    await act(async () => {
      renderer.root.render(<SettingsModal {...createSettingsModalProps(overrides)} />);
    });
  };

  beforeEach(() => {
    localStorage.setItem('chatSettingsLastTab', 'api');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders the active desktop section title inside the scrollable content area', async () => {
    await renderSettingsModal();

    const fixedDesktopTitle = document.querySelector('main > header h2');
    const scrollingDesktopTitle = document.querySelector('main > div h2');

    expect(fixedDesktopTitle).toBeNull();
    expect(scrollingDesktopTitle?.textContent).toBe('API');
    expect(document.body.textContent).toContain('Test Connection');
  });

  it('opens the settings surface without any enter animation class', async () => {
    await renderSettingsModal();

    const settingsSurface = document.querySelector('[role="dialog"]');

    expect(settingsSurface).not.toBeNull();
    expect(settingsSurface?.className).not.toContain('modal-enter-animation');
    expect(settingsSurface?.className).not.toContain('settings-surface-enter-animation');
  });

  it('shows the granular settings navigation for each settings section', async () => {
    await renderSettingsModal();

    const tabLabels = Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent?.trim());

    expect(tabLabels).toEqual(['Models', 'API', 'MCP', 'Interface & Interaction', 'Data & App', 'Shortcuts', 'About']);
    expect(document.body.textContent).not.toContain('Chat');
  });

  it('renders shortcuts in its own sidebar group', async () => {
    await renderSettingsModal();

    const groupTabLabels = Array.from(document.querySelectorAll('[data-settings-group]')).map((group) =>
      Array.from(group.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent?.trim()),
    );

    expect(groupTabLabels).toEqual([
      ['Models', 'API', 'MCP', 'Interface & Interaction', 'Data & App'],
      ['Shortcuts'],
      ['About'],
    ]);

    const groupElements = Array.from(document.querySelectorAll('[data-settings-group]'));
    // Sidebar groups separate with spacing only — hairline dividers were removed
    // from the left menu by design.
    for (const group of groupElements) {
      expect(group.className).not.toContain('border-t');
    }
  });

  it('places the desktop close control in the content pane, not the sidebar', async () => {
    await renderSettingsModal();

    const closeButtons = Array.from(document.querySelectorAll('button[aria-label="Close"]'));
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);

    const contentClose = document.querySelector('main button[aria-label="Close"]');
    expect(contentClose).not.toBeNull();
    expect(contentClose?.className).toContain('md:inline-flex');
  });

  it('routes scoped chat changes to current chat settings', async () => {
    const onSave = vi.fn();
    const onSaveCurrentChatSettings = vi.fn();

    localStorage.setItem('chatSettingsLastTab', 'models');
    await renderSettingsModal({
      currentSettings: {
        ...DEFAULT_APP_SETTINGS,
        modelId: 'default-model',
      },
      currentChatSettings: {
        ...DEFAULT_CHAT_SETTINGS,
        modelId: 'current-model',
      },
      hasActiveSession: true,
      availableModels: [
        { id: 'current-model', name: 'Current Model' },
        { id: 'next-chat-model', name: 'Next Chat Model' },
      ],
      onSave,
      onSaveCurrentChatSettings,
    });

    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent === 'Current Chat')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      document
        .querySelector('[data-testid="settings-model-option-gemini-native:next-chat-model"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSaveCurrentChatSettings).toHaveBeenCalledWith(expect.objectContaining({ modelId: 'next-chat-model' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the scope toggle only on chat-scoped settings tabs', async () => {
    localStorage.setItem('chatSettingsLastTab', 'models');
    await renderSettingsModal({
      currentChatSettings: DEFAULT_CHAT_SETTINGS,
      hasActiveSession: true,
      onSaveCurrentChatSettings: vi.fn(),
    });

    expect(document.body.textContent).toContain('Current Chat');

    await act(async () => {
      Array.from(document.querySelectorAll('[role="tab"]'))
        .find((tab) => tab.textContent?.includes('Interface & Interaction'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).not.toContain('Current Chat');
  });

  it('searches settings and navigates to the matching section', async () => {
    await ensureFeatureTranslations('settings');
    localStorage.setItem('chatSettingsLastTab', 'api');
    await renderSettingsModal();

    const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
    expect(searchInput).not.toBeNull();

    await act(async () => {
      fireEvent.change(searchInput!, { target: { value: 'mermaid' } });
    });

    expect(searchInput?.value).toBe('mermaid');
    expect(document.body.textContent).toContain('Render Mermaid Diagrams');
    expect(document.body.textContent).toMatch(/result/i);

    const mermaidResult = Array.from(document.querySelectorAll('[role="option"]')).find((option) =>
      option.textContent?.includes('Render Mermaid Diagrams'),
    );
    expect(mermaidResult).toBeDefined();

    await act(async () => {
      fireEvent.click(mermaidResult!);
    });

    const clearedSearch = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
    expect(clearedSearch?.value).toBe('');
    expect(document.body.textContent).toContain('Rendering & Preview');
    expect(document.body.textContent).toContain('Render Mermaid Diagrams');
    expect(document.querySelector('[data-settings-item="interface-mermaid"]')).not.toBeNull();
  });
  it('shows a search results title on mobile while searching', async () => {
    await ensureFeatureTranslations('settings');
    await renderSettingsModal();

    const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
    expect(searchInput).not.toBeNull();

    await act(async () => {
      fireEvent.change(searchInput!, { target: { value: 'theme' } });
    });

    const title = document.querySelector('main h2');
    expect(title?.textContent).toBe('Search Results');
    // Visible on mobile too while searching (normally the title is desktop-only).
    expect(title?.className).not.toContain('hidden');
  });

  it('does not select a search result while an IME composition is confirming', async () => {
    await ensureFeatureTranslations('settings');
    await renderSettingsModal();

    const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
    await act(async () => {
      fireEvent.change(searchInput!, { target: { value: 'mermaid' } });
    });

    // Enter confirming a pinyin composition must not pick a result.
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', isComposing: true });
    });

    expect(searchInput?.value).toBe('mermaid');
    expect(document.querySelector('[data-settings-item="interface-mermaid"]')).toBeNull();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });

    expect(document.querySelector('[data-settings-item="interface-mermaid"]')).not.toBeNull();
  });

  it('exits search before closing the modal when Escape fires outside the input', async () => {
    await ensureFeatureTranslations('settings');
    const onClose = vi.fn();
    await renderSettingsModal({ onClose });

    const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
    await act(async () => {
      fireEvent.change(searchInput!, { target: { value: 'theme' } });
    });

    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(searchInput?.value).toBe('');
  });

  it('announces the search match count to screen readers', async () => {
    await ensureFeatureTranslations('settings');
    await renderSettingsModal();

    const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
    await act(async () => {
      fireEvent.change(searchInput!, { target: { value: 'theme' } });
    });

    const status = document.querySelector('[data-settings-search-status]');
    expect(status?.getAttribute('role')).toBe('status');
  });

  it('wires the search input to the results listbox', async () => {
    await ensureFeatureTranslations('settings');
    await renderSettingsModal();

    const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
    expect(searchInput?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      fireEvent.change(searchInput!, { target: { value: 'theme' } });
    });

    expect(searchInput?.getAttribute('aria-expanded')).toBe('true');
    expect(searchInput?.getAttribute('aria-controls')).toBe('settings-search-results');
    expect(searchInput?.getAttribute('aria-activedescendant')).toBe('settings-search-option-0');
  });

  it('keeps one mobile gutter across all sidebar rows', async () => {
    await renderSettingsModal();

    const aside = document.querySelector('aside');
    expect(aside).not.toBeNull();
    const rows = [aside?.children[0], aside?.children[1], aside?.querySelector('nav'), aside?.lastElementChild];
    for (const row of rows) {
      expect((row as HTMLElement)?.className.split(' ')).toContain('px-4');
    }
  });

  it('moves the mobile match count inline and hides the sidebar status while searching', async () => {
    await ensureFeatureTranslations('settings');
    await renderSettingsModal();

    const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
    await act(async () => {
      fireEvent.change(searchInput!, { target: { value: 'theme' } });
    });

    // Sidebar status (count + Esc hint) is desktop-only; touch devices lack Esc.
    const status = document.querySelector('[data-settings-search-status]');
    expect(status?.className.split(' ')).toContain('hidden');
    expect(status?.className.split(' ')).toContain('md:flex');

    // Mobile gets the count inline next to the results title instead.
    const count = document.querySelector('[data-settings-search-count]');
    expect(count?.className.split(' ')).toContain('md:hidden');
    expect(count?.textContent).toMatch(/\d/);
  });

  it('hides the advanced-mode footer on mobile while searching', async () => {
    await ensureFeatureTranslations('settings');
    await renderSettingsModal();

    const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
    await act(async () => {
      fireEvent.change(searchInput!, { target: { value: 'theme' } });
    });

    const advancedButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Advanced Mode'),
    );
    const footerRow = advancedButton?.closest('div.flex-shrink-0');
    expect(footerRow?.className.split(' ')).toContain('hidden');
    expect(footerRow?.className.split(' ')).toContain('md:block');
  });

  it('auto-enables advanced mode when selecting an advanced parameter search result', async () => {
    useSettingsUiStore.setState({ isAdvancedModeEnabled: false });
    await ensureFeatureTranslations('settings');
    await renderSettingsModal();

    expect(useSettingsUiStore.getState().isAdvancedModeEnabled).toBe(false);

    const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search settings"]');
    await act(async () => {
      fireEvent.change(searchInput!, { target: { value: 'Top K' } });
    });

    const topKResult = Array.from(document.querySelectorAll('[role="option"]')).find((opt) =>
      opt.textContent?.includes('Top K'),
    );
    expect(topKResult).not.toBeUndefined();

    await act(async () => {
      topKResult?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useSettingsUiStore.getState().isAdvancedModeEnabled).toBe(true);
  });
});
