import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render/providerRenderer';
import { ExportModal } from './ExportModal';

describe('ExportModal', () => {
  it('uses a primary heading instead of link-colored chrome', () => {
    const { getByRole } = renderWithProviders(
      <ExportModal isOpen onClose={vi.fn()} onExport={vi.fn()} exportingType={null} />,
      { language: 'en' },
    );

    const heading = getByRole('heading', { name: 'Export Message' });

    expect(heading.className).toContain('text-[var(--theme-text-primary)]');
    expect(heading.className).not.toContain('text-[var(--theme-text-link)]');
  });

  it('renders a compact bordered picker instead of a wide titled wizard', () => {
    const { getByRole } = renderWithProviders(
      <ExportModal isOpen onClose={vi.fn()} onExport={vi.fn()} exportingType={null} />,
      { language: 'en' },
    );

    const dialog = getByRole('dialog');
    const heading = getByRole('heading', { name: 'Export Message' });

    expect(dialog.className).toContain('max-w-sm');
    expect(dialog.className).toContain('border-[var(--theme-border-primary)]');
    expect(dialog.className).not.toContain('max-w-lg');
    expect(heading.querySelector('svg')).toBeNull();
  });
});
