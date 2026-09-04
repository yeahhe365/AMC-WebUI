import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { QueuedSubmissionList, type QueuedSubmissionListView } from './QueuedSubmissionList';

const makeView = (overrides: Partial<QueuedSubmissionListView> = {}): QueuedSubmissionListView => ({
  title: 'Next up',
  items: [
    { id: 'a', previewText: 'first', fileCount: 0 },
    { id: 'b', previewText: 'second', fileCount: 2 },
    { id: 'c', previewText: 'third', fileCount: 0 },
  ],
  onEditItem: vi.fn(),
  onRemoveItem: vi.fn(),
  onReorderItem: vi.fn(),
  onClearAll: vi.fn(),
  ...overrides,
});

describe('QueuedSubmissionList', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('renders every queued item with preview text and file counts', async () => {
    const view = makeView();
    await act(async () => {
      renderer.root.render(<QueuedSubmissionList view={view} />);
    });

    const previews = renderer.container.querySelectorAll('[data-testid="queued-submission-preview"]');
    expect(previews).toHaveLength(3);
    expect(renderer.container.textContent).toContain('first');
    expect(renderer.container.textContent).toContain('second');
    expect(renderer.container.textContent).toContain('2 attachments');
    expect(renderer.container.textContent).toContain('third');
  });

  it('invokes edit and remove callbacks with the item id', async () => {
    const view = makeView();
    await act(async () => {
      renderer.root.render(<QueuedSubmissionList view={view} />);
    });

    const editButtons = renderer.container.querySelectorAll('button[aria-label="Edit queued message"]');
    const removeButtons = renderer.container.querySelectorAll('button[aria-label="Remove queued message"]');
    expect(editButtons).toHaveLength(3);
    expect(removeButtons).toHaveLength(3);

    await act(async () => {
      (removeButtons[1] as HTMLButtonElement).click();
    });
    expect(view.onRemoveItem).toHaveBeenCalledWith('b');
  });

  it('invokes clear-all when the clear button is clicked', async () => {
    const view = makeView();
    await act(async () => {
      renderer.root.render(<QueuedSubmissionList view={view} />);
    });

    const clearButton = renderer.container.querySelector<HTMLButtonElement>('button[aria-label="Clear all"]');
    expect(clearButton).not.toBeNull();
    await act(async () => {
      clearButton?.click();
    });
    expect(view.onClearAll).toHaveBeenCalled();
  });
});
