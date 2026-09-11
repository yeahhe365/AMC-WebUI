import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

describe('Select', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  it('opens with ArrowDown and selects the highlighted option with Enter', () => {
    const onChange = vi.fn();

    act(() => {
      renderer.root.render(
        <Select id="quality-select" label="Quality" value="low" onChange={onChange}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>,
      );
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('#quality-select');
    expect(trigger).not.toBeNull();

    act(() => {
      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith({ target: { value: 'medium' } });
    expect(renderer.container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('exposes listbox relationships while open', () => {
    act(() => {
      renderer.root.render(
        <Select id="voice-select" label="Voice" value="a" onChange={vi.fn()}>
          <option value="a">Voice A</option>
          <option value="b">Voice B</option>
        </Select>,
      );
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('#voice-select');

    act(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const listbox = renderer.container.querySelector('[role="listbox"]');
    const selectedOption = renderer.container.querySelector('[role="option"][aria-selected="true"]');

    expect(trigger?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(trigger?.getAttribute('aria-controls')).toBe(listbox?.id);
    expect(selectedOption?.textContent).toContain('Voice A');
  });

  it('selects option on mouse click', () => {
    const onChange = vi.fn();

    act(() => {
      renderer.root.render(
        <Select id="theme-select" label="Theme" value="onyx" onChange={onChange}>
          <option value="onyx">Dark</option>
          <option value="sepia">Sepia</option>
        </Select>,
      );
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('#theme-select');
    act(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const sepiaOption = Array.from(renderer.container.querySelectorAll('[role="option"]')).find((el) =>
      el.textContent?.includes('Sepia'),
    );
    expect(sepiaOption).not.toBeNull();

    act(() => {
      sepiaOption?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      sepiaOption?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
    });

    expect(onChange).toHaveBeenCalledWith({ target: { value: 'sepia' } });
  });
});
