import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThoughtContent } from './ThoughtContent';

const { mockLazyMarkdownRenderer } = vi.hoisted(() => ({
  mockLazyMarkdownRenderer: vi.fn(() => <div data-testid="thought-markdown" />),
}));

vi.mock('@/components/message/LazyMarkdownRenderer', () => ({
  LazyMarkdownRenderer: mockLazyMarkdownRenderer,
}));

vi.mock('@/hooks/ui/useMessageStream', () => ({
  useMessageStream: () => ({
    streamContent: '',
    streamThoughts: '',
  }),
}));

describe('ThoughtContent', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders thoughts as lightweight markdown without HTML or diagrams', () => {
    act(() => {
      renderer.render(
        <ThoughtContent
          messageId="thought-lightweight"
          isLoading={false}
          content="Reasoning step"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={true}
          themeId="pearl"
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(mockLazyMarkdownRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        allowHtml: false,
        isMermaidRenderingEnabled: false,
        isGraphvizRenderingEnabled: false,
      }),
      expect.anything(),
    );
  });
});
