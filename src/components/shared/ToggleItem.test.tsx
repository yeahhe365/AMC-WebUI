import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { ToggleItem } from './ToggleItem';

describe('ToggleItem', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  it('toggles from the row with keyboard activation', () => {
    const onChange = vi.fn();

    act(() => {
      renderer.root.render(<ToggleItem label="Show thoughts" checked={false} onChange={onChange} />);
    });

    const row = renderer.container.querySelector<HTMLElement>('[role="switch"]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('tabindex')).toBe('0');
    expect(row?.getAttribute('aria-checked')).toBe('false');
    expect(row?.className).toContain('py-3');
    expect(row?.className).not.toContain('py-${');

    act(() => {
      row?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders Radix Switch primitive with silky styling and data-state', () => {
    act(() => {
      renderer.root.render(<ToggleItem label="Streaming" checked={true} onChange={vi.fn()} />);
    });

    const switchBtn = renderer.container.querySelector('button[role="switch"]');
    expect(switchBtn).not.toBeNull();
    expect(switchBtn?.getAttribute('data-state')).toBe('checked');
    expect(switchBtn?.className).toContain('active:scale-95');

    const thumb = switchBtn?.querySelector('span[data-state]');
    expect(thumb?.className).toContain('will-change-transform');
  });

  it('allows clicking the Radix switch directly', () => {
    const onChange = vi.fn();

    act(() => {
      renderer.root.render(<ToggleItem label="Auto scroll" checked={false} onChange={onChange} />);
    });

    const switchBtn = renderer.container.querySelector('button[role="switch"]');
    expect(switchBtn).not.toBeNull();

    act(() => {
      fireEvent.click(switchBtn!);
    });

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('keeps tooltip icons spaced from the label', () => {
    act(() => {
      renderer.root.render(<ToggleItem label="Paste button" checked={true} onChange={vi.fn()} tooltip="Help text" />);
    });

    const labelRow = renderer.container.querySelector('[role="switch"] > div');
    expect(labelRow?.className).toContain('gap-1.5');
  });
});
