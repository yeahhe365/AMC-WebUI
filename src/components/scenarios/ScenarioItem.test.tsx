import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render/providerRenderer';
import type { SavedScenario } from '@/types';
import { ScenarioItem } from './ScenarioItem';

const scenario: SavedScenario = {
  id: 'scenario-1',
  title: '示例场景',
  emoji: '⚡',
  description: 'A short summary',
  messages: [
    { id: 'message-1', role: 'user', content: '你好' },
    { id: 'message-2', role: 'model', content: '你好，有什么可以帮你？' },
  ],
};

describe('ScenarioItem', () => {
  it('localizes the message count in Chinese', () => {
    const { container } = renderWithProviders(
      <ScenarioItem scenario={scenario} isSystem={false} onLoad={vi.fn()} onDuplicate={vi.fn()} onExport={vi.fn()} />,
      { language: 'zh' },
    );

    expect(container.textContent).toContain('2 条消息');
    expect(container.textContent).not.toContain('2 msgs');
  });

  it('loads from the row instead of a marketplace Use CTA', () => {
    const onLoad = vi.fn();
    const { getByRole, queryByRole } = renderWithProviders(
      <ScenarioItem scenario={scenario} isSystem={false} onLoad={onLoad} onDuplicate={vi.fn()} onExport={vi.fn()} />,
      { language: 'en' },
    );

    expect(queryByRole('button', { name: 'Use' })).toBeNull();

    getByRole('button', { name: '示例场景. Load this scenario into chat' }).click();

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith(scenario);
  });

  it('does not decorate the row with emoji or a category color bar', () => {
    const { container } = renderWithProviders(
      <ScenarioItem scenario={scenario} isSystem={false} onLoad={vi.fn()} onDuplicate={vi.fn()} onExport={vi.fn()} />,
      { language: 'en' },
    );

    expect(container.textContent).not.toContain('⚡');
    expect(container.querySelector('.w-1')).toBeNull();
  });
});
