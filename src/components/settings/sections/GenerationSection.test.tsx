import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSettingsUiStore } from '@/stores/settingsUiStore';
import { setupStoreStateReset } from '@/test/stores/reset';
import { MediaResolution } from '@/types';
import { GenerationSection } from './GenerationSection';

vi.mock('@/components/modals/TextEditorModal', () => ({
  TextEditorModal: () => null,
}));

vi.mock('@/components/shared/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('GenerationSection', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  setupStoreStateReset();

  const baseSettings = {
    ...useSettingsStore.getState().appSettings,
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED,
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows system prompt status and clears the prompt through the current models panel', async () => {
    const onUpdateSetting = vi.fn();

    await act(async () => {
      renderer.root.render(
        <GenerationSection
          modelId="gemini-3-flash-preview"
          currentSettings={{ ...baseSettings, systemInstruction: 'Stay concise.' }}
          onUpdateSetting={onUpdateSetting}
        />,
      );
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('#system-prompt-input');
    const clearButton = renderer.container.querySelector<HTMLButtonElement>('[aria-label="Clear system prompt"]');
    const expandButton = renderer.container.querySelector<HTMLButtonElement>('[aria-label="Full editor"]');

    expect(renderer.container.textContent).toContain('Enabled');
    expect(textarea?.className).toContain('min-h-[112px]');
    expect(clearButton).not.toBeNull();
    expect(clearButton?.className).toContain('hover:text-[var(--theme-text-danger)]');
    expect(expandButton?.className).toContain('w-8');
    expect(expandButton?.className).toContain('h-8');
    expect(expandButton?.className).toContain('hover:text-[var(--theme-text-link)]');

    await act(async () => {
      clearButton?.click();
    });

    expect(onUpdateSetting).toHaveBeenCalledWith('systemInstruction', '');
    expect(textarea?.value).toBe('');
    expect(renderer.container.textContent).toContain('Not set');
    expect(renderer.container.querySelector<HTMLButtonElement>('[aria-label="Clear system prompt"]')).toBeNull();
  });

  it('does not expose ultra-high in the global media resolution setting', async () => {
    const ultraHighSettings = {
      ...baseSettings,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_ULTRA_HIGH,
    };

    await act(async () => {
      renderer.root.render(
        <GenerationSection modelId="gemini-2.5-flash" currentSettings={ultraHighSettings} onUpdateSetting={vi.fn()} />,
      );
    });

    expect(renderer.container.textContent).not.toContain('Ultra High');

    await act(async () => {
      renderer.root.render(
        <GenerationSection
          modelId="gemini-3-flash-preview"
          currentSettings={ultraHighSettings}
          onUpdateSetting={vi.fn()}
        />,
      );
    });

    expect(renderer.container.textContent).not.toContain('Ultra High');

    await act(async () => {
      renderer.root.render(
        <GenerationSection
          modelId="gemini-robotics-er-2-preview"
          currentSettings={ultraHighSettings}
          onUpdateSetting={vi.fn()}
        />,
      );
    });

    expect(renderer.container.textContent).not.toContain('Ultra High');
  });

  it('shows numeric parameter values as neutral badges instead of link-colored text', async () => {
    await act(async () => {
      renderer.root.render(
        <GenerationSection modelId="gemini-2.5-flash" currentSettings={baseSettings} onUpdateSetting={vi.fn()} />,
      );
    });

    const monoSpans = Array.from(renderer.container.querySelectorAll('span.font-mono'));
    expect(monoSpans.length).toBeGreaterThanOrEqual(2);
    for (const span of monoSpans) {
      expect(span.className).not.toContain('text-[var(--theme-text-link)]');
      expect(span.className).toContain('tabular-nums');
    }
  });

  it('gates advanced parameters behind the global advanced mode switch only', async () => {
    useSettingsUiStore.setState({ isAdvancedModeEnabled: false });

    await act(async () => {
      renderer.root.render(
        <GenerationSection modelId="gemini-2.5-flash" currentSettings={baseSettings} onUpdateSetting={vi.fn()} />,
      );
    });

    expect(renderer.container.querySelector('#top-k-slider')).toBeNull();
    expect(renderer.container.textContent).not.toContain('Show Advanced Parameters');

    await act(async () => {
      useSettingsUiStore.setState({ isAdvancedModeEnabled: true });
    });

    expect(renderer.container.querySelector('#top-k-slider')).not.toBeNull();
  });

  it('renders dedicated speech-to-text info banner for gemini-3.5-transcribe without regular sliders', async () => {
    const onUpdateSetting = vi.fn();

    await act(async () => {
      renderer.root.render(
        <GenerationSection
          modelId="gemini-3.5-transcribe"
          currentSettings={baseSettings}
          onUpdateSetting={onUpdateSetting}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('Gemini 3.5 Transcribe');
    expect(renderer.container.querySelector('#temperature-slider')).toBeNull();
    expect(renderer.container.querySelector('#system-prompt-input')).toBeNull();
  });

  it('renders dedicated speech-to-text info banner for gemini-3.5-transcribe-live without regular sliders', async () => {
    const onUpdateSetting = vi.fn();

    await act(async () => {
      renderer.root.render(
        <GenerationSection
          modelId="gemini-3.5-transcribe-live"
          currentSettings={baseSettings}
          onUpdateSetting={onUpdateSetting}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('Gemini 3.5 Transcribe');
    expect(renderer.container.querySelector('#temperature-slider')).toBeNull();
    expect(renderer.container.querySelector('#system-prompt-input')).toBeNull();
  });

  it('hides media resolution, raw mode, and thinking in context for TTS models', async () => {
    useSettingsUiStore.setState({ isAdvancedModeEnabled: true });

    await act(async () => {
      renderer.root.render(
        <GenerationSection
          modelId="gemini-3.1-flash-tts-preview"
          currentSettings={baseSettings}
          onUpdateSetting={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('#media-resolution-select')).toBeNull();
    expect(renderer.container.querySelector('[data-settings-item="models-raw-mode"]')).toBeNull();
    expect(renderer.container.querySelector('[data-settings-item="models-hide-thinking"]')).toBeNull();
  });

  it('updates advanced generation parameters (maxOutputTokens, stopSequences, penalties, seed)', async () => {
    useSettingsUiStore.setState({ isAdvancedModeEnabled: true });
    const onUpdateSetting = vi.fn();

    await act(async () => {
      renderer.root.render(
        <GenerationSection
          modelId="gemini-2.5-flash"
          currentSettings={{
            ...baseSettings,
            maxOutputTokens: 2048,
            stopSequences: ['STOP', 'END'],
            presencePenalty: 0.5,
            frequencyPenalty: -0.5,
            seed: 42,
          }}
          onUpdateSetting={onUpdateSetting}
        />,
      );
    });

    const maxTokensInput = renderer.container.querySelector<HTMLInputElement>('#max-output-tokens-input');
    const stopSequencesInput = renderer.container.querySelector<HTMLInputElement>('#stop-sequences-input');
    const presenceSlider = renderer.container.querySelector<HTMLInputElement>('#presence-penalty-slider');
    const frequencySlider = renderer.container.querySelector<HTMLInputElement>('#frequency-penalty-slider');
    const seedInput = renderer.container.querySelector<HTMLInputElement>('#seed-input');

    expect(maxTokensInput?.value).toBe('2048');
    expect(stopSequencesInput?.value).toBe('STOP, END');
    expect(presenceSlider?.value).toBe('0.5');
    expect(frequencySlider?.value).toBe('-0.5');
    expect(seedInput?.value).toBe('42');

    // Test updating maxOutputTokens
    await act(async () => {
      fireEvent.change(maxTokensInput!, { target: { value: '4096' } });
    });
    expect(onUpdateSetting).toHaveBeenCalledWith('maxOutputTokens', 4096);

    // Test updating stopSequences on blur
    await act(async () => {
      fireEvent.change(stopSequencesInput!, { target: { value: 'User:, Assistant:' } });
      fireEvent.blur(stopSequencesInput!);
    });
    expect(onUpdateSetting).toHaveBeenCalledWith('stopSequences', ['User:', 'Assistant:']);

    // Test updating seed
    await act(async () => {
      fireEvent.change(seedInput!, { target: { value: '100' } });
    });
    expect(onUpdateSetting).toHaveBeenCalledWith('seed', 100);
  });

  it('renders advanced generation parameters in third-party mode', async () => {
    useSettingsUiStore.setState({ isAdvancedModeEnabled: true });

    await act(async () => {
      renderer.root.render(
        <GenerationSection
          isThirdPartyMode={true}
          modelId="gpt-4o"
          currentSettings={baseSettings}
          onUpdateSetting={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('#top-k-slider')).not.toBeNull();
    expect(renderer.container.querySelector('#max-output-tokens-input')).not.toBeNull();
    expect(renderer.container.querySelector('#stop-sequences-input')).not.toBeNull();
    expect(renderer.container.querySelector('#presence-penalty-slider')).not.toBeNull();
    expect(renderer.container.querySelector('#frequency-penalty-slider')).not.toBeNull();
    expect(renderer.container.querySelector('#seed-input')).not.toBeNull();
    // Gemini-only media resolution and raw mode are hidden in third-party mode
    expect(renderer.container.querySelector('#media-resolution-select')).toBeNull();
    expect(renderer.container.querySelector('[data-settings-item="models-raw-mode"]')).toBeNull();
  });
});
