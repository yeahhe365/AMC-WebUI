import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelOption } from '@/types';
import { ModelSyncModal } from './ModelSyncModal';

describe('ModelSyncModal', () => {
  const renderer = setupTestRenderer({ providers: { language: 'zh' } });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const existingModels: ModelOption[] = [
    {
      id: 'gpt-4o',
      name: 'GPT-4o (Local)',
      contextWindow: 128000,
    },
    {
      id: 'stale-model',
      name: 'Deprecated Model',
    },
  ];

  const remoteModels: ModelOption[] = [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      contextWindow: 128000,
      capabilities: { vision: true, tools: true },
    },
    {
      id: 'deepseek-r1',
      name: 'DeepSeek R1',
      contextWindow: 64000,
      capabilities: { thinking: true },
    },
  ];

  it('renders modal with correct stats when open', () => {
    act(() => {
      renderer.root.render(
        <ModelSyncModal
          isOpen={true}
          onClose={vi.fn()}
          connectionName="OpenAI"
          remoteModels={remoteModels}
          existingModels={existingModels}
          onApply={vi.fn()}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('同步模型列表');
    expect(renderer.container.textContent).toContain('远端发现 2 个模型');
    expect(renderer.container.textContent).toContain('新增');
    expect(renderer.container.textContent).toContain('已失效');
    expect(renderer.container.textContent).toContain('DeepSeek R1');
    expect(renderer.container.textContent).toContain('Thinking');
  });

  it('does not render anything when isOpen is false', () => {
    act(() => {
      renderer.root.render(
        <ModelSyncModal
          isOpen={false}
          onClose={vi.fn()}
          connectionName="OpenAI"
          remoteModels={remoteModels}
          existingModels={existingModels}
          onApply={vi.fn()}
        />,
      );
    });

    expect(renderer.container.textContent).toBe('');
  });

  it('calls onApply with reconciled models when clicking confirm button', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    act(() => {
      renderer.root.render(
        <ModelSyncModal
          isOpen={true}
          onClose={onClose}
          connectionName="OpenAI"
          remoteModels={remoteModels}
          existingModels={existingModels}
          onApply={onApply}
        />,
      );
    });

    // Find and click the apply button
    const applyButton = Array.from(renderer.container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('应用变更'),
    );
    expect(applyButton).toBeDefined();

    act(() => {
      applyButton?.click();
    });

    expect(onApply).toHaveBeenCalledTimes(1);
    const appliedModels: ModelOption[] = onApply.mock.calls[0][0];
    expect(appliedModels.some((m) => m.id === 'deepseek-r1')).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
