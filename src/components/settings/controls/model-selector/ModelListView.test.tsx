import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupStoreStateReset } from '@/test/stores/reset';
import { expectNoModelBadges } from '@/test/model-selector/assertions';
import { ModelListView } from './ModelListView';

describe('ModelListView', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  setupStoreStateReset();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a plain model list without search, badges, or section labels', () => {
    act(() => {
      renderer.root.render(
        <ModelListView
          availableModels={[
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true },
            { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT' },
            { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview' },
          ]}
          selectedModelId="gemini-3-flash-preview"
          onSelectModel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('input[placeholder="Search models..."]')).toBeNull();
    expect(renderer.container.textContent).toContain('Gemini 3 Pro Image Preview');
    expect(renderer.container.textContent).toContain('Gemma 4 31B IT');
    expectNoModelBadges(renderer.container);
    expect(renderer.container.textContent).not.toContain('Pinned');
    expect(renderer.container.textContent).not.toContain('Speech');
  });

  it('groups provider-tagged models and reports the selected provider', () => {
    const onSelectModel = vi.fn();

    act(() => {
      renderer.root.render(
        <ModelListView
          availableModels={[
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', apiMode: 'gemini-native' },
            { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', apiMode: 'third-party' },
          ]}
          selectedModelId="gemini-3-flash-preview"
          selectedApiMode="gemini-native"
          onSelectModel={onSelectModel}
        />,
      );
    });

    const geminiSection = renderer.container.querySelector('[data-provider-section="gemini-native"]');
    const openaiSection = renderer.container.querySelector('[data-provider-section="third-party"]');

    expect(geminiSection?.textContent).toContain('Gemini');
    expect(geminiSection?.textContent).toContain('Gemini 3 Flash Preview');
    expect(openaiSection?.textContent).toContain('Third-Party');
    expect(openaiSection?.textContent).toContain('GPT-5.6 Sol');

    act(() => {
      renderer.container
        .querySelector('[data-testid="settings-model-option-gemini-native:gpt-5.6-sol"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectModel).toHaveBeenCalledWith('gpt-5.6-sol', 'third-party');
  });

  it('labels the selected model with the provided scope-aware badge text', () => {
    act(() => {
      renderer.root.render(
        <ModelListView
          availableModels={[{ id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' }]}
          selectedModelId="gemini-3-flash-preview"
          onSelectModel={vi.fn()}
          activeBadgeLabel="New chat default"
        />,
      );
    });

    expect(renderer.container.textContent).toContain('New chat default');
    expect(renderer.container.textContent).not.toContain('Active');
  });

  it('does not select an unavailable third-party model', () => {
    const onSelectModel = vi.fn();

    act(() => {
      renderer.root.render(
        <ModelListView
          availableModels={[
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', apiMode: 'gemini-native' },
            {
              id: 'old-model',
              name: 'Old Model',
              apiMode: 'third-party',
              providerId: 'removed',
              connectionName: 'Removed',
              unavailable: true,
            },
          ]}
          selectedModelId="gemini-3-flash-preview"
          onSelectModel={onSelectModel}
        />,
      );
    });

    act(() => {
      renderer.container
        .querySelector('[data-testid="settings-model-option-removed:old-model"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectModel).not.toHaveBeenCalled();
  });
});
