import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render/providerRenderer';
import { ExportOptions } from './ExportOptions';

describe('ExportOptions', () => {
  it('renders a quiet list instead of a marketplace card grid', () => {
    const { container, getByRole } = renderWithProviders(<ExportOptions onExport={vi.fn()} />, { language: 'en' });

    expect(container.innerHTML).not.toContain('lg:grid-cols-4');
    expect(container.innerHTML).not.toContain('grid-cols-2');
    expect(container.innerHTML).not.toContain('hover:-translate-y');
    expect(container.innerHTML).not.toContain('text-green-500');
    expect(container.innerHTML).not.toContain('text-blue-500');
    expect(container.innerHTML).not.toContain('text-orange-500');
    expect(getByRole('button', { name: /PNG Image/ })).not.toBeNull();
    expect(getByRole('button', { name: /HTML File/ })).not.toBeNull();
  });

  it('anchors each row with a format badge instead of a decorative file icon', () => {
    const { container, getByRole } = renderWithProviders(<ExportOptions onExport={vi.fn()} />, { language: 'en' });
    const pngRow = getByRole('button', { name: /PNG Image/ });

    expect(pngRow.textContent).toContain('PNG');
    expect(pngRow.textContent).toContain('Visual snapshot');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('exports from the row', () => {
    const onExport = vi.fn();
    const { getByRole } = renderWithProviders(<ExportOptions onExport={onExport} />, { language: 'en' });

    getByRole('button', { name: /PNG Image/ }).click();

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith('png');
  });
});
