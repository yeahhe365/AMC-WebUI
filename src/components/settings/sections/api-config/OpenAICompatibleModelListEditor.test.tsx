import { act, useState } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupStoreStateReset } from '@/test/stores/reset';
import type { ModelOption } from '@/types';
import { OpenAICompatibleModelListEditor } from './OpenAICompatibleModelListEditor';

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement | null | undefined, value: string) => {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input?.dispatchEvent(new Event('input', { bubbles: true }));
};

// A stateful parent harness: models/selectedModelId live in useState and are fed
// back through onModelsChange, exactly like the real settings flow. Without
// this, the editor never sees its own commits and the focus-loss regression
// (sourceModelsKey captured the pre-commit external key) cannot reproduce.
const StatefulEditorHarness = ({
  initialModels,
  initialSelectedModelId,
}: {
  initialModels: ModelOption[];
  initialSelectedModelId: string;
}) => {
  const [models, setModels] = useState(initialModels);
  const [selectedModelId, setSelectedModelId] = useState(initialSelectedModelId);

  return (
    <OpenAICompatibleModelListEditor
      models={models}
      selectedModelId={selectedModelId}
      onModelsChange={setModels}
      onSelectedModelChange={setSelectedModelId}
    />
  );
};

const typeIntoInput = (input: HTMLInputElement, nextValue: string) => {
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('OpenAICompatibleModelListEditor', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  setupStoreStateReset();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a blank row and saves typed model IDs as model options', () => {
    const onModelsChange = vi.fn();

    act(() => {
      renderer.root.render(
        <OpenAICompatibleModelListEditor
          models={[{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }]}
          selectedModelId="gpt-5.6-sol"
          onModelsChange={onModelsChange}
          onSelectedModelChange={vi.fn()}
        />,
      );
    });

    act(() => {
      const addButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Add Model'),
      );
      addButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const inputs = Array.from(
      renderer.container.querySelectorAll<HTMLInputElement>('input[data-openai-compatible-model-id-input="true"]'),
    );

    expect(inputs.map((input) => input.value)).toEqual(['gpt-5.6-sol', '']);

    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(inputs[1], 'deepseek-chat');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onModelsChange).toHaveBeenCalledWith([
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true },
      { id: 'deepseek-chat', name: 'deepseek-chat' },
    ]);
  });

  it('saves custom model names for the model picker display', () => {
    const onModelsChange = vi.fn();

    act(() => {
      renderer.root.render(
        <OpenAICompatibleModelListEditor
          models={[{ id: 'openrouter/deepseek-chat', name: 'openrouter/deepseek-chat', isPinned: true }]}
          selectedModelId="openrouter/deepseek-chat"
          onModelsChange={onModelsChange}
          onSelectedModelChange={vi.fn()}
        />,
      );
    });

    const nameInput = renderer.container.querySelector<HTMLInputElement>(
      'input[data-openai-compatible-model-name-input="true"]',
    );

    expect(nameInput?.value).toBe('openrouter/deepseek-chat');

    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(nameInput, 'DeepSeek Chat');
      nameInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onModelsChange).toHaveBeenLastCalledWith([
      { id: 'openrouter/deepseek-chat', name: 'DeepSeek Chat', isPinned: true },
    ]);
  });

  it('falls back to the model ID when the model name is blank', () => {
    const onModelsChange = vi.fn();

    act(() => {
      renderer.root.render(
        <OpenAICompatibleModelListEditor
          models={[{ id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', isPinned: true }]}
          selectedModelId="gpt-4.1-mini"
          onModelsChange={onModelsChange}
          onSelectedModelChange={vi.fn()}
        />,
      );
    });

    const nameInput = renderer.container.querySelector<HTMLInputElement>(
      'input[data-openai-compatible-model-name-input="true"]',
    );

    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(nameInput, '   ');
      nameInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onModelsChange).toHaveBeenLastCalledWith([{ id: 'gpt-4.1-mini', name: 'gpt-4.1-mini', isPinned: true }]);
  });

  it('deduplicates model IDs when rows are edited to the same ID', () => {
    const onModelsChange = vi.fn();

    act(() => {
      renderer.root.render(
        <OpenAICompatibleModelListEditor
          models={[
            { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true },
            { id: 'gpt-4.1', name: 'GPT-4.1' },
          ]}
          selectedModelId="gpt-5.6-sol"
          onModelsChange={onModelsChange}
          onSelectedModelChange={vi.fn()}
        />,
      );
    });

    const inputs = Array.from(
      renderer.container.querySelectorAll<HTMLInputElement>('input[data-openai-compatible-model-id-input="true"]'),
    );

    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(inputs[1], 'gpt-5.6-sol');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onModelsChange).toHaveBeenLastCalledWith([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }]);
  });

  it('selects the first remaining model when the active model is removed', () => {
    const onModelsChange = vi.fn();
    const onSelectedModelChange = vi.fn();

    act(() => {
      renderer.root.render(
        <OpenAICompatibleModelListEditor
          models={[
            { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true },
            { id: 'gpt-4.1', name: 'GPT-4.1' },
          ]}
          selectedModelId="gpt-5.6-sol"
          onModelsChange={onModelsChange}
          onSelectedModelChange={onSelectedModelChange}
        />,
      );
    });

    const removeButtons = Array.from(renderer.container.querySelectorAll('button')).filter((button) =>
      button.getAttribute('title')?.includes('Remove Model'),
    );

    act(() => {
      removeButtons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onModelsChange).toHaveBeenLastCalledWith([{ id: 'gpt-4.1', name: 'GPT-4.1', isPinned: true }]);
    expect(onSelectedModelChange).toHaveBeenCalledWith('gpt-4.1');
  });

  it('filters current models in the manager modal', () => {
    act(() => {
      renderer.root.render(
        <OpenAICompatibleModelListEditor
          models={[
            { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true },
            { id: 'deepseek-chat', name: 'DeepSeek Chat' },
            { id: 'qwen3.7-plus', name: 'Qwen3.7 Plus' },
          ]}
          selectedModelId="gpt-5.6-sol"
          onModelsChange={vi.fn()}
          onSelectedModelChange={vi.fn()}
        />,
      );
    });

    act(() => {
      Array.from(renderer.container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Manage Models'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const searchInput = document.body.querySelector<HTMLInputElement>(
      'input[data-openai-compatible-model-search-input="true"]',
    );

    act(() => {
      setInputValue(searchInput, 'deepseek');
    });

    const visibleModelInputs = Array.from(
      document.body.querySelectorAll<HTMLInputElement>('input[data-openai-compatible-manager-model-id-input="true"]'),
    );

    expect(visibleModelInputs.map((input) => input.value)).toEqual(['deepseek-chat']);
  });

  it('adds pasted model IDs and skips duplicates', () => {
    const onModelsChange = vi.fn();

    act(() => {
      renderer.root.render(
        <OpenAICompatibleModelListEditor
          models={[{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }]}
          selectedModelId="gpt-5.6-sol"
          onModelsChange={onModelsChange}
          onSelectedModelChange={vi.fn()}
        />,
      );
    });

    act(() => {
      Array.from(renderer.container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Manage Models'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const batchTextarea = document.body.querySelector<HTMLTextAreaElement>(
      'textarea[data-openai-compatible-batch-model-input="true"]',
    );

    act(() => {
      setInputValue(batchTextarea, 'gpt-5.6-sol\ndeepseek-chat, qwen3.7-plus; deepseek-chat');
    });

    act(() => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Add Pasted Models'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onModelsChange).toHaveBeenLastCalledWith([
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true },
      { id: 'deepseek-chat', name: 'deepseek-chat' },
      { id: 'qwen3.7-plus', name: 'qwen3.7-plus' },
    ]);
    expect(document.body.textContent).toContain('Added 2 models.');
  });

  it('previews fetched models before importing the selected new IDs', async () => {
    const onModelsChange = vi.fn();
    const onFetchModels = vi.fn().mockResolvedValue([
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
      { id: 'deepseek-chat', name: 'deepseek-chat' },
      { id: 'qwen3.7-plus', name: 'qwen3.7-plus' },
    ]);

    await act(async () => {
      renderer.root.render(
        <OpenAICompatibleModelListEditor
          models={[{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }]}
          selectedModelId="gpt-5.6-sol"
          onModelsChange={onModelsChange}
          onSelectedModelChange={vi.fn()}
          onFetchModelsForImportPreview={onFetchModels}
        />,
      );
    });

    await act(async () => {
      Array.from(renderer.container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Fetch Models'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('deepseek-chat');
      expect(document.body.textContent).toContain('qwen3.7-plus');
    });

    const fetchedCheckboxes = Array.from(
      document.body.querySelectorAll<HTMLInputElement>('input[data-openai-compatible-fetched-model-checkbox="true"]'),
    );
    expect(fetchedCheckboxes.map((checkbox) => checkbox.disabled)).toEqual([true, false, false]);
    expect(fetchedCheckboxes.map((checkbox) => checkbox.checked)).toEqual([false, true, true]);

    await act(async () => {
      fetchedCheckboxes[2].click();
    });

    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Import Selected'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onModelsChange).toHaveBeenLastCalledWith([
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true },
      { id: 'deepseek-chat', name: 'deepseek-chat' },
    ]);
    expect(document.body.textContent).toContain('Imported 1 models.');
  });

  it('explains why fetch is disabled when the connection is missing a key or URL', () => {
    act(() => {
      renderer.root.render(
        <OpenAICompatibleModelListEditor
          models={[{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }]}
          selectedModelId="gpt-5.6-sol"
          onModelsChange={vi.fn()}
          onSelectedModelChange={vi.fn()}
          onFetchModelsForImportPreview={vi.fn()}
          isFetchModelsDisabled
        />,
      );
    });

    const fetchButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Fetch Models'),
    );
    expect(fetchButton?.getAttribute('disabled')).not.toBeNull();
    expect(fetchButton?.getAttribute('title')).toBe('Add an API key and Base URL to fetch models.');
  });

  describe('focus retention during editing (regression)', () => {
    it('keeps focus on the Model ID input across consecutive keystrokes', () => {
      act(() => {
        renderer.root.render(
          <StatefulEditorHarness
            initialModels={[{ id: 'gpt-4', name: 'GPT-4', isPinned: true }]}
            initialSelectedModelId="gpt-4"
          />,
        );
      });

      const idInput = renderer.container.querySelector<HTMLInputElement>(
        'input[data-openai-compatible-model-id-input="true"]',
      );
      expect(idInput).not.toBeNull();
      const originalNode = idInput;

      typeIntoInput(idInput!, 'gpt-4');
      typeIntoInput(idInput!, 'gpt-4.');
      typeIntoInput(idInput!, 'gpt-4.5');

      // The input node must be the same element the whole time — a remount
      // (sourceModelsKey mismatch → fresh random rowId → new <input> node)
      // would detach focus and replace the node.
      const idInputAfter = renderer.container.querySelector<HTMLInputElement>(
        'input[data-openai-compatible-model-id-input="true"]',
      );
      expect(idInputAfter).toBe(originalNode);
      expect(idInputAfter?.value).toBe('gpt-4.5');
    });

    it('keeps focus on the Model Name input across consecutive keystrokes', () => {
      act(() => {
        renderer.root.render(
          <StatefulEditorHarness
            initialModels={[{ id: 'gpt-4', name: 'GPT', isPinned: true }]}
            initialSelectedModelId="gpt-4"
          />,
        );
      });

      const nameInput = renderer.container.querySelector<HTMLInputElement>(
        'input[data-openai-compatible-model-name-input="true"]',
      );
      expect(nameInput).not.toBeNull();
      const originalNode = nameInput;

      typeIntoInput(nameInput!, 'GPT-');
      typeIntoInput(nameInput!, 'GPT-4');
      typeIntoInput(nameInput!, 'GPT-4 Turbo');

      const nameInputAfter = renderer.container.querySelector<HTMLInputElement>(
        'input[data-openai-compatible-model-name-input="true"]',
      );
      expect(nameInputAfter).toBe(originalNode);
      expect(nameInputAfter?.value).toBe('GPT-4 Turbo');
    });

    it('retains focus on a new row after adding and keeps typing', () => {
      act(() => {
        renderer.root.render(
          <StatefulEditorHarness
            initialModels={[{ id: 'gpt-4', name: 'GPT-4', isPinned: true }]}
            initialSelectedModelId="gpt-4"
          />,
        );
      });

      act(() => {
        const addButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
          button.textContent?.includes('Add Model'),
        );
        addButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const idInputs = Array.from(
        renderer.container.querySelectorAll<HTMLInputElement>('input[data-openai-compatible-model-id-input="true"]'),
      );
      expect(idInputs.length).toBe(2);
      const secondRowInput = idInputs[1];
      const secondRowOriginal = secondRowInput;

      typeIntoInput(secondRowInput, 'd');
      typeIntoInput(secondRowInput, 'deepseek');
      typeIntoInput(secondRowInput, 'deepseek-chat');

      const idInputsAfter = Array.from(
        renderer.container.querySelectorAll<HTMLInputElement>('input[data-openai-compatible-model-id-input="true"]'),
      );
      expect(idInputsAfter.length).toBe(2);
      expect(idInputsAfter[1]).toBe(secondRowOriginal);
      expect(idInputsAfter[1].value).toBe('deepseek-chat');
    });

    it('retains focus when removing a non-active row and editing the remaining one', () => {
      act(() => {
        renderer.root.render(
          <StatefulEditorHarness
            initialModels={[
              { id: 'gpt-4', name: 'GPT-4', isPinned: true },
              { id: 'gpt-4.5', name: 'GPT-4.5' },
            ]}
            initialSelectedModelId="gpt-4"
          />,
        );
      });

      const removeButtons = Array.from(renderer.container.querySelectorAll('button')).filter((button) =>
        button.getAttribute('title')?.includes('Remove Model'),
      );
      expect(removeButtons.length).toBe(2);

      act(() => {
        // Remove the SECOND (non-active) row.
        removeButtons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const idInput = renderer.container.querySelector<HTMLInputElement>(
        'input[data-openai-compatible-model-id-input="true"]',
      );
      const originalNode = idInput;

      typeIntoInput(idInput!, 'gpt-');
      typeIntoInput(idInput!, 'gpt-4.5');

      const idInputAfter = renderer.container.querySelector<HTMLInputElement>(
        'input[data-openai-compatible-model-id-input="true"]',
      );
      expect(idInputAfter).toBe(originalNode);
      expect(idInputAfter?.value).toBe('gpt-4.5');
    });
  });
});
