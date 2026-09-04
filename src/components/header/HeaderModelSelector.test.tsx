import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeaderModelSelector } from './HeaderModelSelector';

describe('HeaderModelSelector', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not render the header lightning toggle - thinking is controlled via input toolbar', async () => {
    await act(async () => {
      renderer.root.render(
        <HeaderModelSelector
          currentModelName="Gemma 4 31B IT"
          availableModels={[{ id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT' }]}
          selectedModelId="gemma-4-31b-it"
          onSelectModel={vi.fn()}
          isSwitchingModel={false}
          isLoading={false}
        />,
      );
    });

    expect(renderer.container.querySelector('button[aria-label="Toggle reasoning mode"]')).toBeNull();
    expect(renderer.container.querySelector('button[aria-label="Toggle thinking level"]')).toBeNull();
  });

  it('affords clickability with exactly one chevron in the collapsed trigger', async () => {
    await act(async () => {
      renderer.root.render(
        <HeaderModelSelector
          currentModelName="Custom Model"
          availableModels={[{ id: 'custom-model', name: 'Custom Model' }]}
          selectedModelId="custom-model"
          onSelectModel={vi.fn()}
          isSwitchingModel={false}
          isLoading={false}
        />,
      );
    });

    const triggerButton = renderer.container.querySelector('button[aria-haspopup="listbox"]');
    expect(triggerButton?.querySelectorAll('svg')).toHaveLength(1);
    // Collapsed chevron points down — no residual rotation class.
    expect(triggerButton?.querySelector('svg')?.getAttribute('class')).not.toContain('rotate-180');
  });

  it('rotates the selector chevron while the model menu is expanded', async () => {
    await act(async () => {
      renderer.root.render(
        <HeaderModelSelector
          currentModelName="Custom Model"
          availableModels={[{ id: 'custom-model', name: 'Custom Model' }]}
          selectedModelId="custom-model"
          onSelectModel={vi.fn()}
          isSwitchingModel={false}
          isLoading={false}
        />,
      );
    });

    const triggerButton = renderer.container.querySelector('button[aria-haspopup="listbox"]');

    await act(async () => {
      triggerButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(triggerButton?.getAttribute('aria-expanded')).toBe('true');
    expect(triggerButton?.querySelector('svg')?.getAttribute('class')).toContain('rotate-180');
  });

  it('keeps compact header controls stable by avoiding scale transforms', async () => {
    await act(async () => {
      renderer.root.render(
        <HeaderModelSelector
          currentModelName="Gemini 3 Flash Preview"
          availableModels={[{ id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' }]}
          selectedModelId="gemini-3-flash-preview"
          onSelectModel={vi.fn()}
          isSwitchingModel={false}
          isLoading={false}
        />,
      );
    });

    const triggerButton = renderer.container.querySelector('button[aria-haspopup="listbox"]');

    expect(triggerButton?.className).toContain('min-h-9');
    expect(triggerButton?.className).not.toContain('scale');
    // lightning toggle no longer exists
    expect(renderer.container.querySelector('button[aria-label="Toggle thinking level"]')).toBeNull();
  });

  it('renders the collapsed model name with stronger emphasis', async () => {
    await act(async () => {
      renderer.root.render(
        <HeaderModelSelector
          currentModelName="Gemini Robotics-ER 2 Preview"
          availableModels={[{ id: 'gemini-robotics-er-2-preview', name: 'Gemini Robotics-ER 2 Preview' }]}
          selectedModelId="gemini-robotics-er-2-preview"
          onSelectModel={vi.fn()}
          isSwitchingModel={false}
          isLoading={false}
        />,
      );
    });

    const label = Array.from(renderer.container.querySelectorAll('span')).find(
      (node) => node.textContent === 'Robotics-ER 2',
    );
    expect(label?.className).toContain('font-semibold');
  });

  it('does not show the thinking fast toggle for any model - relies on input toolbar control', async () => {
    await act(async () => {
      renderer.root.render(
        <HeaderModelSelector
          currentModelName="Gemini Robotics-ER 2 Preview"
          availableModels={[{ id: 'gemini-robotics-er-2-preview', name: 'Gemini Robotics-ER 2 Preview' }]}
          selectedModelId="gemini-robotics-er-2-preview"
          onSelectModel={vi.fn()}
          isSwitchingModel={false}
          isLoading={false}
        />,
      );
    });

    expect(renderer.container.querySelector('button[aria-label="Toggle thinking level"]')).toBeNull();
    expect(renderer.container.querySelector('button[aria-label="Toggle reasoning mode"]')).toBeNull();
  });

  it('does not show the thinking fast toggle for Gemini 3.1 Flash TTS Preview', async () => {
    await act(async () => {
      renderer.root.render(
        <HeaderModelSelector
          currentModelName="Gemini 3.1 Flash TTS Preview"
          availableModels={[{ id: 'gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS Preview' }]}
          selectedModelId="gemini-3.1-flash-tts-preview"
          onSelectModel={vi.fn()}
          isSwitchingModel={false}
          isLoading={false}
        />,
      );
    });

    expect(renderer.container.querySelector('button[aria-label="Toggle thinking level"]')).toBeNull();
    expect(renderer.container.querySelector('button[aria-label="Toggle reasoning mode"]')).toBeNull();
  });
});
