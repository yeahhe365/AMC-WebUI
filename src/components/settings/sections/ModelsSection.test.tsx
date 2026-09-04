import { act, type ComponentProps, useState } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { setupStoreStateReset } from '@/test/stores/reset';
import { ModelsSection } from './ModelsSection';
import type { ApiMode, AppSettings } from '@/types';
import type { ModelSelector } from '@/components/settings/controls/ModelSelector';
import type { LanguageVoiceSection } from './LanguageVoiceSection';
import type { SafetySection } from './SafetySection';

type ModelSelectorProps = ComponentProps<typeof ModelSelector>;
type LanguageVoiceSectionProps = ComponentProps<typeof LanguageVoiceSection>;
type SafetySectionProps = ComponentProps<typeof SafetySection>;

const mockSafetySection = vi.hoisted(() => ({
  renderCount: 0,
  lastProps: null as SafetySectionProps | null,
}));

const mockLanguageVoiceSection = vi.hoisted(() => ({
  lastProps: null as LanguageVoiceSectionProps | null,
}));

const mockModelSelector = vi.hoisted(() => ({
  lastProps: null as ModelSelectorProps | null,
}));

vi.mock('@/components/settings/controls/ModelSelector', () => ({
  ModelSelector: (props: ModelSelectorProps) => {
    mockModelSelector.lastProps = props;
    return <div data-testid="model-selector">model selector</div>;
  },
}));

vi.mock('./LanguageVoiceSection', () => ({
  LanguageVoiceSection: (props: LanguageVoiceSectionProps) => {
    mockLanguageVoiceSection.lastProps = props;
    return <div data-testid="language-voice-section">language voice section</div>;
  },
}));

vi.mock('./SafetySection', () => ({
  SafetySection: (props: SafetySectionProps) => {
    mockSafetySection.renderCount += 1;
    mockSafetySection.lastProps = props;
    return <div data-testid="safety-section">safety section</div>;
  },
}));

describe('ModelsSection', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  setupStoreStateReset();

  const renderModelsSection = async (overrides: Partial<ComponentProps<typeof ModelsSection>> = {}) => {
    await act(async () => {
      renderer.root.render(
        <ModelsSection
          modelId="gemini-3.1-pro-preview"
          setModelId={vi.fn()}
          availableModels={[{ id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', isPinned: true }]}
          setAvailableModels={vi.fn()}
          currentSettings={useSettingsStore.getState().appSettings}
          currentThemeId="pearl"
          onUpdateSettings={vi.fn()}
          {...overrides}
        />,
      );
    });
  };

  afterEach(() => {
    mockSafetySection.renderCount = 0;
    mockSafetySection.lastProps = null;
    mockLanguageVoiceSection.lastProps = null;
    mockModelSelector.lastProps = null;
    vi.clearAllMocks();
  });

  it('keeps tab cycle model settings out of models settings', async () => {
    const onUpdateSettings = vi.fn();

    await renderModelsSection({
      availableModels: [
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', isPinned: true },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true },
        { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', isPinned: true },
      ],
      currentSettings: {
        ...useSettingsStore.getState().appSettings,
        tabModelCycleIds: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
      },
      onUpdateSettings,
    });

    expect(renderer.container.querySelector('[data-testid="model-selector"]')).not.toBeNull();
    expect(renderer.container.textContent).not.toContain('Models Included In Tab Cycle');
    expect(renderer.container.textContent).not.toContain('2 models selected');
    expect(renderer.container.textContent).not.toContain('Gemini 3.5 Flash-Lite');
    expect(
      renderer.container.querySelector<HTMLButtonElement>('button[aria-label="Toggle Tab cycle model panel"]'),
    ).toBeNull();
    expect(onUpdateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({
        tabModelCycleIds: expect.anything(),
      }),
    );
  });

  it('keeps safety settings inside models settings and collapsed by default', async () => {
    const onUpdateSettings = vi.fn();
    const safetySettings = useSettingsStore.getState().appSettings.safetySettings;

    await renderModelsSection({
      currentSettings: {
        ...useSettingsStore.getState().appSettings,
        safetySettings,
      },
      onUpdateSettings,
    });

    const toggleButton = renderer.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Toggle safety settings"]',
    );

    expect(toggleButton).not.toBeNull();
    expect(toggleButton?.getAttribute('aria-expanded')).toBe('false');
    expect(renderer.container.textContent).toContain('Safety Settings');
    expect(renderer.container.querySelector('[data-testid="safety-section"]')).toBeNull();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(toggleButton?.getAttribute('aria-expanded')).toBe('true');
    expect(renderer.container.querySelector('[data-testid="safety-section"]')).not.toBeNull();
    expect(mockSafetySection.lastProps!.safetySettings).toBe(safetySettings);

    mockSafetySection.lastProps!.setSafetySettings([]);

    expect(onUpdateSettings).toHaveBeenCalledWith({ safetySettings: [] });
  });

  it('keeps Live Artifacts settings inside models settings', async () => {
    const onUpdateSettings = vi.fn();
    const initialSettings = {
      ...useSettingsStore.getState().appSettings,
      liveArtifactsPromptMode: 'inline',
      liveArtifactsSystemPrompts: {
        inline: 'Inline custom Live Artifacts prompt',
      },
    } as AppSettings;

    const StatefulModelsSection = () => {
      const [settings, setSettings] = useState(initialSettings);
      const handleUpdateSettings = (updates: Partial<AppSettings>) => {
        onUpdateSettings(updates);
        setSettings((previous) => ({ ...previous, ...updates }));
      };

      return (
        <ModelsSection
          modelId="gemini-3.1-pro-preview"
          setModelId={vi.fn()}
          availableModels={[{ id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', isPinned: true }]}
          setAvailableModels={vi.fn()}
          currentSettings={settings}
          currentThemeId="pearl"
          onUpdateSettings={handleUpdateSettings}
        />
      );
    };

    await act(async () => {
      renderer.root.render(<StatefulModelsSection />);
    });

    expect(renderer.container.textContent).toContain('Live Artifacts');
    expect(renderer.container.textContent).not.toContain('Auto-open Live Artifacts');
    expect(renderer.container.textContent).not.toContain('Live Artifacts Model');
    expect(renderer.container.textContent).not.toContain('Live Artifacts Prompt Version');
    expect(renderer.container.textContent).not.toContain('Inline HTML Only');
    expect(renderer.container.textContent).not.toContain('Full or Inline HTML');
    expect(renderer.container.textContent).not.toContain('Complete HTML Only');
    expect(renderer.container.textContent).toContain('Live Artifacts Prompt');

    const promptToggle = renderer.container.querySelector<HTMLButtonElement>('#live-artifacts-prompt-toggle');
    expect(promptToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(renderer.container.querySelector<HTMLTextAreaElement>('#live-artifacts-prompt-input')).toBeNull();
    expect(renderer.container.querySelector<HTMLButtonElement>('#live-artifacts-prompt-reset')).toBeNull();

    const toggleLabel = Array.from(renderer.container.querySelectorAll('span')).find(
      (element) => element.textContent?.trim() === 'Auto-open Live Artifacts',
    );
    expect(toggleLabel).toBeUndefined();

    expect(renderer.container.querySelector('#live-artifacts-prompt-mode-select')).toBeNull();
    expect(renderer.container.querySelector('#live-artifacts-prompt-mode-label')).toBeNull();

    await act(async () => {
      renderer.container
        .querySelector<HTMLButtonElement>('#live-artifacts-prompt-toggle')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const expandedPromptToggle = renderer.container.querySelector<HTMLButtonElement>('#live-artifacts-prompt-toggle');
    expect(expandedPromptToggle?.getAttribute('aria-expanded')).toBe('true');
    const promptTextarea = renderer.container.querySelector<HTMLTextAreaElement>('#live-artifacts-prompt-input');
    expect(promptTextarea?.value).toBe('Inline custom Live Artifacts prompt');
    const promptPanel = renderer.container.querySelector<HTMLElement>('#live-artifacts-prompt-panel');
    const promptReset = renderer.container.querySelector<HTMLButtonElement>('#live-artifacts-prompt-reset');
    expect(promptReset).not.toBeNull();
    expect(promptPanel?.contains(promptReset)).toBe(true);

    await act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      descriptor?.set?.call(promptTextarea, 'Use product-dashboard HTML artifacts.');
      promptTextarea?.dispatchEvent(new Event('input', { bubbles: true }));
      promptTextarea?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onUpdateSettings).toHaveBeenCalledWith({ liveArtifactsSystemPrompt: '' });
    expect(onUpdateSettings).toHaveBeenCalledWith({
      liveArtifactsSystemPrompts: {
        inline: 'Use product-dashboard HTML artifacts.',
      },
    });
  });

  it('shows the selected built-in Live Artifacts prompt in the prompt editor when there is no custom prompt', async () => {
    await renderModelsSection({
      currentSettings: {
        ...useSettingsStore.getState().appSettings,
        liveArtifactsPromptMode: 'inline',
        liveArtifactsSystemPrompt: '',
        liveArtifactsSystemPrompts: {
          inline: '',
        },
      } as AppSettings,
    });

    await act(async () => {
      renderer.container
        .querySelector<HTMLButtonElement>('#live-artifacts-prompt-toggle')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      const promptValue = renderer.container.querySelector<HTMLTextAreaElement>('#live-artifacts-prompt-input')?.value;
      expect(promptValue).toContain('[Live Artifacts Inline Protocol - en]');
      expect(promptValue).not.toContain('Current Page Theme');
      expect(promptValue).not.toContain('light theme');
    });
  });

  it('keeps language, voice, and translation settings inside models settings', async () => {
    const onUpdateSettings = vi.fn();

    await renderModelsSection({
      availableModels: [
        { id: 'gemini-custom-input-translator', name: 'Input Translator' },
        { id: 'gemini-custom-thought-translator', name: 'Thought Translator' },
      ],
      currentSettings: {
        ...useSettingsStore.getState().appSettings,
        transcriptionModelId: 'gemini-3-flash-preview',
        translationTargetLanguage: 'Japanese',
        inputTranslationModelId: 'gemini-custom-input-translator',
        thoughtTranslationTargetLanguage: 'Korean',
        thoughtTranslationModelId: 'gemini-custom-thought-translator',
      },
      onUpdateSettings,
    });

    expect(renderer.container.querySelector('[data-testid="language-voice-section"]')).not.toBeNull();
    expect(mockLanguageVoiceSection.lastProps!.currentSettings.transcriptionModelId).toBe('gemini-3-flash-preview');
    expect(mockLanguageVoiceSection.lastProps!.currentSettings.translationTargetLanguage).toBe('Japanese');
    expect(mockLanguageVoiceSection.lastProps!.currentSettings.inputTranslationModelId).toBe(
      'gemini-custom-input-translator',
    );
    expect(mockLanguageVoiceSection.lastProps!.currentSettings.thoughtTranslationTargetLanguage).toBe('Korean');
    expect(mockLanguageVoiceSection.lastProps!.currentSettings.thoughtTranslationModelId).toBe(
      'gemini-custom-thought-translator',
    );

    act(() => {
      mockLanguageVoiceSection.lastProps!.onUpdateSetting('transcriptionModelId', 'gemini-3.5-flash-lite');
      mockLanguageVoiceSection.lastProps!.onUpdateSetting('translationTargetLanguage', 'Simplified Chinese');
      mockLanguageVoiceSection.lastProps!.onUpdateSetting('inputTranslationModelId', 'gemini-3-flash-preview');
      mockLanguageVoiceSection.lastProps!.onUpdateSetting('thoughtTranslationTargetLanguage', 'English');
      mockLanguageVoiceSection.lastProps!.onUpdateSetting('thoughtTranslationModelId', 'gemini-3.1-pro-preview');
    });

    expect(onUpdateSettings).toHaveBeenCalledWith({ transcriptionModelId: 'gemini-3.5-flash-lite' });
    expect(onUpdateSettings).toHaveBeenCalledWith({ translationTargetLanguage: 'Simplified Chinese' });
    expect(onUpdateSettings).toHaveBeenCalledWith({ inputTranslationModelId: 'gemini-3-flash-preview' });
    expect(onUpdateSettings).toHaveBeenCalledWith({ thoughtTranslationTargetLanguage: 'English' });
    expect(onUpdateSettings).toHaveBeenCalledWith({ thoughtTranslationModelId: 'gemini-3.1-pro-preview' });
  });

  it('keeps third-party models out of Gemini language and voice controls', async () => {
    await renderModelsSection({
      availableModels: [
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', apiMode: 'gemini-native' },
        { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', apiMode: 'third-party' as ApiMode },
      ],
    });

    expect(mockLanguageVoiceSection.lastProps!.availableModels).toEqual([
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
    ]);
  });

  it('shows only third-party model and chat controls in a third-party session', async () => {
    const onUpdateSettings = vi.fn();
    const defaultModels = [
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
    ];

    await renderModelsSection({
      modelId: 'gpt-5.6-sol',
      availableModels: defaultModels,
      defaultModels,
      isThirdPartyMode: true,
      currentSettings: {
        ...useSettingsStore.getState().appSettings,
        providerId: 'openai',
      },
      onUpdateSettings,
    });

    expect(renderer.container.querySelector('[data-testid="model-selector"]')).not.toBeNull();
    expect(mockModelSelector.lastProps!.defaultModels).toBe(defaultModels);
    expect(renderer.container.textContent).toContain('Default System Prompt');
    expect(renderer.container.textContent).toContain('Temperature');
    expect(renderer.container.textContent).toContain('Top P');
    expect(renderer.container.textContent).not.toContain('Top K');
    expect(renderer.container.textContent).not.toContain('Live Artifacts');
    expect(renderer.container.textContent).not.toContain('Safety Settings');
    expect(renderer.container.querySelector('[data-testid="language-voice-section"]')).toBeNull();
    expect(
      renderer.container.querySelector<HTMLButtonElement>('button[aria-label="Toggle safety settings"]'),
    ).toBeNull();
  });
});
