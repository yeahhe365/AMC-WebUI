import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render/providerRenderer';
import { ThemeLanguageSelector } from './ThemeLanguageSelector';
import type { AppSettings } from '@/types';

const TRIGGER_SELECTOR = '#interface-language-select';

const openDropdown = (container: HTMLElement) => {
  const trigger = container.querySelector<HTMLButtonElement>(TRIGGER_SELECTOR);
  expect(trigger).not.toBeNull();
  fireEvent.click(trigger as HTMLButtonElement);
  return trigger as HTMLButtonElement;
};

describe('ThemeLanguageSelector', () => {
  it('renders language dropdown with all registry options', () => {
    const onUpdate = vi.fn();
    const { container, getByRole } = renderWithProviders(
      <ThemeLanguageSelector settings={{ language: 'en', themeId: 'pearl' } as AppSettings} onUpdate={onUpdate} />,
      {
        language: 'en',
      },
    );

    const trigger = openDropdown(container);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(getByRole('option', { name: 'System Default' })).toBeInTheDocument();
    expect(getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(getByRole('option', { name: '中文' })).toBeInTheDocument();
    expect(getByRole('option', { name: '日本語' })).toBeInTheDocument();
    // Trigger shows the current selection.
    expect(trigger.textContent).toContain('English');
  });

  it('switches to ja on option select', () => {
    const onUpdate = vi.fn();
    const { container } = renderWithProviders(
      <ThemeLanguageSelector settings={{ language: 'en', themeId: 'pearl' } as AppSettings} onUpdate={onUpdate} />,
      {
        language: 'en',
      },
    );

    openDropdown(container);
    const jaOption = Array.from(container.querySelectorAll('[role="option"]')).find((option) =>
      option.textContent?.includes('日本語'),
    );
    expect(jaOption).not.toBeNull();
    fireEvent.click(jaOption as HTMLElement);

    expect(onUpdate).toHaveBeenCalledWith('language', 'ja');
  });

  it('keeps the language control keyboard operable', () => {
    const onUpdate = vi.fn();
    const { container } = renderWithProviders(
      <ThemeLanguageSelector settings={{ language: 'en', themeId: 'pearl' } as AppSettings} onUpdate={onUpdate} />,
      {
        language: 'en',
      },
    );

    const trigger = openDropdown(container);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalled();
  });
});
