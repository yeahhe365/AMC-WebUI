import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { LegacyGeminiMigration } from './LegacyGeminiMigration';

describe('LegacyGeminiMigration', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('offers the official replacement and switches only when clicked', async () => {
    const select = vi.fn();
    await act(async () =>
      renderer.root.render(<LegacyGeminiMigration modelId="models/gemini-2.5-pro" isGemini onSelectModel={select} />),
    );
    expect(renderer.container.textContent).toContain('2026-12-01');
    expect(renderer.container.textContent).toContain('gemini-3.8-flash');
    expect(select).not.toHaveBeenCalled();
    await act(async () => renderer.container.querySelector('button')?.click());
    expect(select).toHaveBeenCalledWith('gemini-3.8-flash', 'gemini-native');
  });

  it('does not affect third-party providers or Flash Lite', async () => {
    const select = vi.fn();
    await act(async () =>
      renderer.root.render(<LegacyGeminiMigration modelId="gemini-2.5-pro" isGemini={false} onSelectModel={select} />),
    );
    expect(renderer.container.textContent).toBe('');
    await act(async () =>
      renderer.root.render(<LegacyGeminiMigration modelId="gemini-2.5-flash-lite" isGemini onSelectModel={select} />),
    );
    expect(renderer.container.textContent).toBe('');
    await act(async () =>
      renderer.root.render(<LegacyGeminiMigration modelId="gemini-2.5-flash" isGemini onSelectModel={select} />),
    );
    expect(renderer.container.textContent).toContain('gemini-3.5-flash-lite');
  });
});
