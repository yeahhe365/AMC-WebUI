import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render/providerRenderer';
import { ThemeLanguageSelector } from './ThemeLanguageSelector';
import type { AppSettings } from '@/types';

const THEME_TRIGGER_SELECTOR = '#interface-theme-select';
const LANGUAGE_TRIGGER_SELECTOR = '#interface-language-select';

const openDropdown = (container: HTMLElement, selector: string) => {
  const trigger = container.querySelector<HTMLButtonElement>(selector);
  expect(trigger).not.toBeNull();
  fireEvent.click(trigger as HTMLButtonElement);
  return trigger as HTMLButtonElement;
};

describe('ThemeLanguageSelector', () => {
  it('renders theme dropdown with all options', () => {
    const onUpdate = vi.fn();
    const { container, getByRole } = renderWithProviders(
      <ThemeLanguageSelector settings={{ language: 'en', themeId: 'pearl' } as AppSettings} onUpdate={onUpdate} />,
      {
        language: 'en',
      },
    );

    const trigger = openDropdown(container, THEME_TRIGGER_SELECTOR);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(getByRole('option', { name: 'System' })).toBeInTheDocument();
    expect(getByRole('option', { name: 'Dark' })).toBeInTheDocument();
    expect(getByRole('option', { name: 'Gray' })).toBeInTheDocument();
    expect(getByRole('option', { name: 'Light' })).toBeInTheDocument();
    expect(getByRole('option', { name: 'Sepia' })).toBeInTheDocument();
    expect(trigger.textContent).toContain('Light');
  });

  it('switches to sepia on sepia option select', () => {
    const onUpdate = vi.fn();
    const { container } = renderWithProviders(
      <ThemeLanguageSelector settings={{ language: 'en', themeId: 'pearl' } as AppSettings} onUpdate={onUpdate} />,
      {
        language: 'en',
      },
    );

    openDropdown(container, THEME_TRIGGER_SELECTOR);
    const sepiaOption = Array.from(container.querySelectorAll('[role="option"]')).find((option) =>
      option.textContent?.includes('Sepia'),
    );
    expect(sepiaOption).not.toBeNull();
    fireEvent.click(sepiaOption as HTMLElement);

    expect(onUpdate).toHaveBeenCalledWith('themeId', 'sepia');
  });

  it('switches to onyx on dark option select', () => {
    const onUpdate = vi.fn();
    const { container } = renderWithProviders(
      <ThemeLanguageSelector settings={{ language: 'en', themeId: 'pearl' } as AppSettings} onUpdate={onUpdate} />,
      {
        language: 'en',
      },
    );

    openDropdown(container, THEME_TRIGGER_SELECTOR);
    const darkOption = Array.from(container.querySelectorAll('[role="option"]')).find((option) =>
      option.textContent?.includes('Dark'),
    );
    expect(darkOption).not.toBeNull();
    fireEvent.click(darkOption as HTMLElement);

    expect(onUpdate).toHaveBeenCalledWith('themeId', 'onyx');
  });

  it('keeps the theme control keyboard operable', () => {
    const onUpdate = vi.fn();
    const { container } = renderWithProviders(
      <ThemeLanguageSelector settings={{ language: 'en', themeId: 'pearl' } as AppSettings} onUpdate={onUpdate} />,
      {
        language: 'en',
      },
    );

    const trigger = openDropdown(container, THEME_TRIGGER_SELECTOR);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalled();
  });

  it('renders language dropdown with all registry options', () => {
    const onUpdate = vi.fn();
    const { container, getByRole } = renderWithProviders(
      <ThemeLanguageSelector settings={{ language: 'en', themeId: 'pearl' } as AppSettings} onUpdate={onUpdate} />,
      {
        language: 'en',
      },
    );

    const trigger = openDropdown(container, LANGUAGE_TRIGGER_SELECTOR);
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

    openDropdown(container, LANGUAGE_TRIGGER_SELECTOR);
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

    const trigger = openDropdown(container, LANGUAGE_TRIGGER_SELECTOR);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalled();
  });
});
