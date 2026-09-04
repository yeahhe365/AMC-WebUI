import { act } from 'react';
import { createProviderTestRenderer as createTestRenderer } from '@/test/render/providerRenderer';
import type { TestRenderer } from '@/test/render/renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTextFileEditor } from './CreateTextFileEditor';

describe('CreateTextFileEditor extension preference', () => {
  let root: TestRenderer | null = null;
  const storage = (() => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
      clear: () => {
        values.clear();
      },
    };
  })();

  const renderEditor = async (props: Partial<React.ComponentProps<typeof CreateTextFileEditor>> = {}) => {
    root = createTestRenderer();

    await act(async () => {
      root!.render(
        <CreateTextFileEditor
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isProcessing={false}
          isLoading={false}
          themeId="pearl"
          {...props}
        />,
      );
    });
  };

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    window.localStorage.clear();
  });

  it('remembers the last selected extension for new files', async () => {
    await renderEditor();

    let select = document.body.querySelector('select') as HTMLSelectElement | null;
    expect(select?.value).toBe('.md');

    await act(async () => {
      select!.value = '.txt';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    act(() => {
      root?.unmount();
    });
    root = null;

    await renderEditor();

    select = document.body.querySelector('select') as HTMLSelectElement | null;
    expect(select?.value).toBe('.txt');
  });

  it('prefers the existing file extension when editing a file', async () => {
    window.localStorage.setItem('createTextFileEditorLastExtension', '.txt');

    await renderEditor({ initialFilename: 'notes.py' });

    const select = document.body.querySelector('select') as HTMLSelectElement | null;
    expect(select?.value).toBe('.py');
  });

  it('still changes the extension when localStorage cannot persist the preference', async () => {
    const setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        ...storage,
        setItem,
      },
    });

    await renderEditor();

    const select = document.body.querySelector('select') as HTMLSelectElement | null;
    await act(async () => {
      select!.value = '.json';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(select?.value).toBe('.json');
    expect(setItem).toHaveBeenCalled();
  });
});
