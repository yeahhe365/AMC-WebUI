import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '@/types';
import { LibraryPickerGrid } from './LibraryPickerGrid';
import { LibraryPickerList } from './LibraryPickerList';

const item: LibraryItem = {
  id: 'file',
  name: 'note.txt',
  type: 'text/plain',
  size: 3,
  timestamp: 1,
  source: 'uploaded',
};

describe.each(['grid', 'list'])('library picker %s keyboard', (layout) => {
  it.each(['Enter', ' '])('leaves %s on the preview button to its native activation', (key) => {
    const toggleSelectItem = vi.fn();
    const handlePreviewItem = vi.fn();
    const props = {
      filteredItems: [item],
      selectedIds: new Set<string>(),
      toggleSelectItem,
      handlePreviewItem,
      handleItemDoubleClick: vi.fn(),
      t: (name: string) => name,
    };
    render(
      layout === 'grid' ? (
        <LibraryPickerGrid {...props} />
      ) : (
        <LibraryPickerList {...props} allFilteredSelected={false} handleSelectAllToggle={vi.fn()} language="en" />
      ),
    );
    const preview = screen.getByRole('button', { name: 'libraryPreview' });
    preview.focus();
    expect(fireEvent.keyDown(preview, { key })).toBe(true);
    expect(toggleSelectItem).not.toHaveBeenCalled();
    // jsdom does not synthesize keyboard clicks. Model the browser's default action.
    fireEvent.click(preview);
    expect(handlePreviewItem).toHaveBeenCalledWith(item);
    expect(toggleSelectItem).not.toHaveBeenCalled();
    const parent = layout === 'grid' ? screen.getByRole('button', { name: item.name }) : preview.closest('tr')!;
    fireEvent.keyDown(parent, { key });
    expect(toggleSelectItem).toHaveBeenCalledTimes(1);
  });
});
