import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { SettingsSearchBar } from './SettingsSearchBar';

describe('SettingsSearchBar', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  const renderBar = async (props: { value?: string; onChange?: (value: string) => void } = {}) => {
    const { value = '', onChange = vi.fn() } = props;
    await act(async () => {
      renderer.root.render(<SettingsSearchBar value={value} onChange={onChange} compact />);
    });
  };

  it('offers a slash shortcut hint that stays out of the layout', async () => {
    await renderBar();

    const kbd = renderer.container.querySelector('kbd');
    expect(kbd).not.toBeNull();
    expect(kbd?.textContent).toBe('/');
    expect(kbd?.getAttribute('aria-hidden')).toBe('true');
    // Hidden at rest, revealed on hover/focus without reserving space.
    expect(kbd?.className).toContain('hidden');
    expect(kbd?.className).toContain('group-hover:block');
    expect(kbd?.className).toContain('group-focus-within:block');
  });

  it('replaces the slash hint with the clear button once a query exists', async () => {
    await renderBar({ value: 'theme' });

    expect(renderer.container.querySelector('kbd')).toBeNull();
    expect(renderer.container.querySelector('button[aria-label="Clear search"]')).not.toBeNull();
  });

  it('clears the query on Escape without bubbling further up', async () => {
    const onChange = vi.fn();
    await renderBar({ value: 'theme', onChange });

    const input = renderer.container.querySelector('input');
    expect(input).not.toBeNull();

    await act(async () => {
      fireEvent.keyDown(input!, { key: 'Escape' });
    });

    expect(onChange).toHaveBeenCalledWith('');
  });
});
