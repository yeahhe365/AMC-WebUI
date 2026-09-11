import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { Slider } from './Slider';

describe('Slider', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  it('renders with accessibility attributes and initial value', () => {
    act(() => {
      renderer.root.render(
        <Slider id="test-slider" value={0.7} min={0} max={2} step={0.05} onChange={vi.fn()} ariaLabel="Temperature" />,
      );
    });

    const hiddenInput = renderer.container.querySelector<HTMLInputElement>('#test-slider');
    expect(hiddenInput).not.toBeNull();
    expect(hiddenInput?.value).toBe('0.7');
    expect(hiddenInput?.min).toBe('0');
    expect(hiddenInput?.max).toBe('2');

    const thumb = renderer.container.querySelector('[role="slider"]');
    expect(thumb).not.toBeNull();
    expect(thumb?.getAttribute('aria-valuenow')).toBe('0.7');
    expect(thumb?.getAttribute('aria-valuemin')).toBe('0');
    expect(thumb?.getAttribute('aria-valuemax')).toBe('2');
    expect(thumb?.getAttribute('aria-label')).toBe('Temperature');
  });

  it('calls onChange when native input is triggered', () => {
    const onChange = vi.fn();

    act(() => {
      renderer.root.render(<Slider id="test-slider" value={0.7} min={0} max={2} step={0.05} onChange={onChange} />);
    });

    const hiddenInput = renderer.container.querySelector<HTMLInputElement>('#test-slider');
    act(() => {
      fireEvent.change(hiddenInput!, { target: { value: '1.2' } });
    });

    expect(onChange).toHaveBeenCalledWith(1.2);
  });

  it('supports keyboard navigation via arrow keys', () => {
    const onChange = vi.fn();

    act(() => {
      renderer.root.render(<Slider value={1} min={0} max={10} step={1} onChange={onChange} />);
    });

    const thumb = renderer.container.querySelector('[role="slider"]');
    expect(thumb).not.toBeNull();

    act(() => {
      thumb?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(2);

    act(() => {
      thumb?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('respects disabled state', () => {
    const onChange = vi.fn();

    act(() => {
      renderer.root.render(
        <Slider id="disabled-slider" value={5} min={0} max={10} disabled={true} onChange={onChange} />,
      );
    });

    const hiddenInput = renderer.container.querySelector<HTMLInputElement>('#disabled-slider');
    expect(hiddenInput?.disabled).toBe(true);

    const thumb = renderer.container.querySelector('[role="slider"]');
    expect(thumb?.getAttribute('aria-disabled')).toBe('true');
  });
});
