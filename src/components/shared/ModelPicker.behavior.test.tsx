import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelOption } from '@/types';
import { ModelPicker } from './ModelPicker';
import { expectNoModelBadges } from '@/test/model-selector/assertions';

const renderPicker = ({
  models,
  selectedId,
  onSelect = vi.fn(),
}: {
  models: ModelOption[];
  selectedId: string;
  onSelect?: (modelId: string) => void;
}) => (
  <ModelPicker
    models={models}
    selectedId={selectedId}
    onSelect={onSelect}
    renderTrigger={({ isOpen, setIsOpen, selectedModel }) => (
      <button
        type="button"
        data-testid="model-picker-trigger"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedModel?.name ?? 'Select model'}
      </button>
    )}
  />
);

describe('ModelPicker behavior', () => {
  const renderer = setupTestRenderer();

  const models: ModelOption[] = [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isPinned: true },
    { id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT' },
    { id: 'gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS Preview' },
    { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview' },
  ];

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a plain model list without search, badges, or section labels', () => {
    act(() => {
      renderer.root.render(renderPicker({ models, selectedId: 'gemini-3-flash-preview' }));
    });

    act(() => {
      renderer.container
        .querySelector('[data-testid="model-picker-trigger"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(renderer.container.querySelector('input[placeholder="Search models..."]')).toBeNull();
    expectNoModelBadges(renderer.container);
    expect(renderer.container.querySelector('[data-provider-section="gemini-native"]')).toBeNull();
    expect(renderer.container.querySelector('[data-provider-section="openai-compatible"]')).toBeNull();
    expect(renderer.container.textContent).not.toContain('Pinned');
    expect(renderer.container.textContent).not.toContain('Speech');
    expect(renderer.container.textContent).toContain('Gemini 3.1 Flash TTS Preview');
  });

  it('groups models by provider when provider metadata is available', () => {
    act(() => {
      renderer.root.render(
        renderPicker({
          models: [
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', apiMode: 'gemini-native' },
            { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', apiMode: 'third-party' },
          ],
          selectedId: 'gemini-3-flash-preview',
        }),
      );
    });

    act(() => {
      renderer.container
        .querySelector('[data-testid="model-picker-trigger"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const geminiSection = renderer.container.querySelector('[data-provider-section="gemini-native"]');
    const openaiSection = renderer.container.querySelector('[data-provider-section="third-party"]');

    expect(geminiSection?.textContent).toContain('Gemini');
    expect(geminiSection?.textContent).toContain('Gemini 3 Flash Preview');
    // Third-party models render under the converged Third-Party section label.
    expect(openaiSection?.textContent).toContain('Third-Party');
    expect(openaiSection?.textContent).toContain('GPT-5.6 Sol');
  });

  it('supports keyboard navigation through model options', () => {
    const onSelect = vi.fn();

    act(() => {
      renderer.root.render(renderPicker({ models, selectedId: 'gemini-3-flash-preview', onSelect }));
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('[data-testid="model-picker-trigger"]');

    act(() => {
      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith('gemma-4-31b-it', undefined);
    expect(renderer.container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('links the open model list to an active option', () => {
    act(() => {
      renderer.root.render(renderPicker({ models, selectedId: 'gemini-3-flash-preview' }));
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('[data-testid="model-picker-trigger"]');

    act(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const listbox = renderer.container.querySelector('[role="listbox"]');
    const activeId = listbox?.getAttribute('aria-activedescendant');

    expect(listbox?.id).toBeTruthy();
    expect(activeId).toBeTruthy();
    const activeOption = Array.from(renderer.container.querySelectorAll('[role="option"]')).find(
      (option) => option.id === activeId,
    );
    expect(activeOption?.textContent).toContain('Gemini 3 Flash Preview');
  });

  it('renders third-party models grouped by provider with brand labels', () => {
    act(() => {
      renderer.root.render(
        renderPicker({
          models: [
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', apiMode: 'gemini-native' },
            { id: 'claude-fable-5', name: 'Claude Fable 5', apiMode: 'third-party', providerId: 'anthropic' },
            { id: 'qwen3.7-max', name: 'Qwen3.7 Max', apiMode: 'third-party', providerId: 'qwen' },
          ],
          selectedId: 'gemini-3-flash-preview',
        }),
      );
    });

    act(() => {
      renderer.container
        .querySelector('[data-testid="model-picker-trigger"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const thirdPartySections = renderer.container.querySelectorAll('[data-provider-section="third-party"]');
    expect(thirdPartySections.length).toBe(2);
    expect(thirdPartySections[0]?.textContent).toContain('Anthropic');
    expect(thirdPartySections[0]?.textContent).toContain('Claude Fable 5');
    expect(thirdPartySections[1]?.textContent).toContain('Qwen');
    expect(thirdPartySections[1]?.textContent).toContain('Qwen3.7 Max');
  });

  it('badges connections without a key and does not select unavailable models', () => {
    const onSelect = vi.fn();

    act(() => {
      renderer.root.render(
        renderPicker({
          models: [
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', apiMode: 'gemini-native' },
            {
              id: 'gpt-4o',
              name: 'GPT-4o',
              apiMode: 'third-party',
              providerId: 'openai',
              connectionName: 'OpenAI',
              missingApiKey: true,
            },
            {
              id: 'old-model',
              name: 'Old Model',
              apiMode: 'third-party',
              providerId: 'removed',
              connectionName: 'Removed',
              unavailable: true,
            },
          ],
          selectedId: 'gemini-3-flash-preview',
          onSelect,
        }),
      );
    });

    act(() => {
      renderer.container
        .querySelector('[data-testid="model-picker-trigger"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(renderer.container.textContent).toContain('No key');
    expect(renderer.container.textContent).toContain('Unavailable');
    expect(renderer.container.textContent).toContain('Pick another model');

    const unavailableOption = Array.from(renderer.container.querySelectorAll('[role="option"]')).find((option) =>
      option.textContent?.includes('Old Model'),
    );
    expect(unavailableOption?.getAttribute('aria-disabled')).toBe('true');

    act(() => {
      unavailableOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders hover card with model details when opened and updates on hover', () => {
    act(() => {
      renderer.root.render(renderPicker({ models, selectedId: 'gemini-3-flash-preview' }));
    });

    act(() => {
      renderer.container
        .querySelector('[data-testid="model-picker-trigger"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const hovercard = renderer.container.querySelector('[data-testid="model-picker-detail-hovercard"]');
    expect(hovercard).toBeTruthy();
    expect(hovercard?.textContent).toContain('Gemini 3 Flash Preview');

    const gemmaOption = Array.from(renderer.container.querySelectorAll('[role="option"]')).find((option) =>
      option.textContent?.includes('Gemma 4 31B IT'),
    );
    expect(gemmaOption).toBeTruthy();

    act(() => {
      gemmaOption?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      gemmaOption?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    });

    expect(hovercard?.textContent).toContain('Gemma 4 31B IT');
  });
});
