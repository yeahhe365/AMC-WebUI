import { act, screen } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import type { SavedChatSession } from '@/types';
import { createChatSettings } from '@/test/data/factories';
import { createHistorySidebarProps, createHistorySidebarSession } from '@/test/sidebar/historySidebar';
import { HistorySidebar } from './HistorySidebar';

vi.mock('@formkit/auto-animate/react', () => ({
  useAutoAnimate: () => [vi.fn()],
}));

const createSession = (index: number): SavedChatSession => createHistorySidebarSession(index, createChatSettings());

const renderer = setupTestRenderer({ providers: { language: 'en' } });

const renderSidebar = async (sessions: SavedChatSession[]) => {
  await act(async () => {
    renderer.root.render(<HistorySidebar {...createHistorySidebarProps({ sessions })} />);
  });
};

describe('HistorySidebar large history lists', () => {
  it('virtualizes large session lists using Virtuoso without manual pagination', async () => {
    await renderSidebar(Array.from({ length: 90 }, (_, index) => createSession(index)));

    expect(screen.getByText('Chat 0')).toBeInTheDocument();
    expect(screen.getByText('Chat 49')).toBeInTheDocument();
    expect(screen.queryByText('Chat 80')).toBeNull();
    expect(screen.queryByText('Chat 89')).toBeNull();
  });
});
