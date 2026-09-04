import { act, type MouseEvent } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageThoughts } from './MessageThoughts';
import { createAppSettings } from '@/test/data/factories';

const { mockUseMessageStream, mockTranslateText } = vi.hoisted(() => ({
  mockUseMessageStream: vi.fn(() => ({
    streamContent: '',
    streamThoughts: '',
  })),
  mockTranslateText: vi.fn(),
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getKeyForRequest: vi.fn(() => ({ key: 'api-key', isNewKey: false })),
  getGeminiKeyForRequest: vi.fn(() => ({ key: 'api-key', isNewKey: false })),
}));

vi.mock('@/services/api/generation/textApi', () => ({
  translateTextApi: mockTranslateText,
}));

vi.mock('@/hooks/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({
    isCopied: false,
    copyToClipboard: vi.fn(),
  }),
}));

vi.mock('@/hooks/ui/useMessageStream', () => ({
  useMessageStream: mockUseMessageStream,
}));

vi.mock('./thoughts/ThinkingHeader', () => ({
  ThinkingHeader: () => <div data-testid="thinking-header" />,
}));

vi.mock('./thoughts/ThinkingActions', () => ({
  ThinkingActions: ({ onTranslate }: { onTranslate: (event: MouseEvent) => void }) => (
    <button type="button" data-testid="thinking-translate" onClick={onTranslate}>
      translate
    </button>
  ),
}));

vi.mock('./thoughts/ThoughtContent', () => ({
  ThoughtContent: ({ content }: { content: string }) => <div data-testid="thought-content">{content}</div>,
}));

const expandThoughts = (container: HTMLElement) => {
  act(() => {
    container
      .querySelector<HTMLElement>('[role="button"][aria-expanded="false"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
};

describe('MessageThoughts', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    mockUseMessageStream.mockReturnValue({
      streamContent: '',
      streamThoughts: '',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the configured thought translation model when translating thoughts', async () => {
    mockTranslateText.mockResolvedValue('已翻译的思维链');

    await act(async () => {
      renderer.render(
        <MessageThoughts
          message={{
            id: 'message-thought-translation',
            role: 'model',
            content: '',
            thoughts: 'Plan carefully.',
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings({ thoughtTranslationModelId: 'gemini-custom-thought-translator' })}
          themeId="pearl"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    await act(async () => {
      renderer.container.querySelector<HTMLButtonElement>('[data-testid="thinking-translate"]')?.click();
      await Promise.resolve();
    });

    expect(mockTranslateText).toHaveBeenCalledWith(
      'api-key',
      'Plan carefully.',
      'Simplified Chinese',
      'gemini-custom-thought-translator',
    );
  });

  it('uses the configured thought translation target language when translating thoughts', async () => {
    mockTranslateText.mockResolvedValue('翻訳済みの思考');

    await act(async () => {
      renderer.render(
        <MessageThoughts
          message={{
            id: 'message-thought-translation-language',
            role: 'model',
            content: '',
            thoughts: 'Plan carefully.',
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings({ thoughtTranslationTargetLanguage: 'Japanese' })}
          themeId="pearl"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    await act(async () => {
      renderer.container.querySelector<HTMLButtonElement>('[data-testid="thinking-translate"]')?.click();
      await Promise.resolve();
    });

    expect(mockTranslateText).toHaveBeenCalledWith('api-key', 'Plan carefully.', 'Japanese', 'gemini-3.5-flash-lite');
  });

  it('renders the strip while thinking, hides it on expand, and drops it once thinking ends', () => {
    mockUseMessageStream.mockReturnValue({
      streamContent: '',
      streamThoughts: '',
    });

    act(() => {
      renderer.render(
        <MessageThoughts
          message={{
            id: 'message-strip-toggle',
            role: 'model',
            content: '',
            thoughts: '## Step one\nFirst thought',
            isLoading: true,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings()}
          themeId="pearl"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    const strip = renderer.container.querySelector('[data-thinking-strip="true"]');
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain('Step one');

    act(() => {
      renderer.container
        .querySelector<HTMLElement>('[role="button"][aria-expanded="false"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(renderer.container.querySelector('[data-thinking-strip="true"]')).toBeNull();
  });

  it('hides the strip once thinkingTimeMs is set, even if the reply is still streaming', () => {
    mockUseMessageStream.mockReturnValue({
      streamContent: '',
      streamThoughts: '',
    });

    act(() => {
      renderer.render(
        <MessageThoughts
          message={{
            id: 'message-strip-thinking-settled',
            role: 'model',
            content: 'Response text',
            thoughts: '## Step one\nFirst thought',
            isLoading: true,
            thinkingActive: false,
            thinkingTimeMs: 4500,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings()}
          themeId="pearl"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-thinking-strip="true"]')).toBeNull();
  });

  it('hides the strip once the message finishes loading', () => {
    mockUseMessageStream.mockReturnValue({
      streamContent: '',
      streamThoughts: '',
    });

    act(() => {
      renderer.render(
        <MessageThoughts
          message={{
            id: 'message-strip-finished',
            role: 'model',
            content: 'Response text',
            thoughts: '## Step one\nFirst thought',
            isLoading: false,
            thinkingActive: false,
            thinkingTimeMs: 4500,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings()}
          themeId="pearl"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-thinking-strip="true"]')).toBeNull();
  });

  it('re-shows the strip when the model re-enters thinking after a content switch', () => {
    mockUseMessageStream.mockReturnValue({
      streamContent: '',
      streamThoughts: '',
    });

    act(() => {
      renderer.render(
        <MessageThoughts
          message={{
            id: 'message-strip-rethink',
            role: 'model',
            content: 'Interleaved answer',
            thoughts: '## Step one\nRe-entered reasoning',
            isLoading: true,
            thinkingActive: true,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings()}
          themeId="pearl"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    // thinkingActive flips back on → strip comes back even though the message is still loading
    expect(renderer.container.querySelector('[data-thinking-strip="true"]')).not.toBeNull();
  });

  it('renders raw thinking blocks using the normal thought panel', () => {
    act(() => {
      renderer.render(
        <MessageThoughts
          message={{
            id: 'message-raw',
            role: 'model',
            content: '<thinking>Plan carefully.</thinking>\nFinal answer.',
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings()}
          themeId="pearl"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('.message-thoughts-block')).not.toBeNull();
    expect(renderer.container.querySelector('[data-testid="thought-content"]')).toBeNull();

    expandThoughts(renderer.container);

    expect(renderer.container.querySelector('[data-testid="thought-content"]')?.textContent).toBe('Plan carefully.');
  });

  it('renders live unclosed raw thinking from the stream store', () => {
    mockUseMessageStream.mockReturnValue({
      streamContent: 'Drafting the answer',
      streamThoughts: '',
    });

    act(() => {
      renderer.render(
        <MessageThoughts
          message={{
            id: 'message-live-raw',
            role: 'model',
            content: '<thinking>',
            isLoading: true,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings()}
          themeId="pearl"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="thought-content"]')).toBeNull();

    expandThoughts(renderer.container);

    expect(renderer.container.querySelector('[data-testid="thought-content"]')?.textContent).toBe(
      'Drafting the answer',
    );
  });

  it('does not mount thought markdown until the panel is expanded', () => {
    act(() => {
      renderer.render(
        <MessageThoughts
          message={{
            id: 'message-lazy-thoughts',
            role: 'model',
            content: '',
            thoughts: 'Plan carefully.',
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings()}
          themeId="pearl"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="thought-content"]')).toBeNull();

    expandThoughts(renderer.container);

    expect(renderer.container.querySelector('[data-testid="thought-content"]')?.textContent).toBe('Plan carefully.');
  });

  it('renders third-party thinking as a flat strip even when thoughts contain sectioned headers', () => {
    mockUseMessageStream.mockReturnValue({
      streamContent: '',
      streamThoughts: '',
    });

    act(() => {
      renderer.render(
        <MessageThoughts
          message={{
            id: 'message-third-party-strip',
            role: 'model',
            content: '',
            thoughts: '**Step one**\nReasoning detail',
            isLoading: true,
            thinkingActive: true,
            thinkingSource: 'third-party',
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings()}
          themeId="pearl"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    // thinkingSource='third-party' forces the flat strip even though the
    // thoughts look like a Gemini sectioned stream (a `**Title**` line).
    const strip = renderer.container.querySelector('[data-thinking-strip="true"]');
    expect(strip).not.toBeNull();
    expect(strip?.getAttribute('data-thinking-mode')).toBe('flat');
    expect(strip?.textContent).not.toContain('Section');
    expect(renderer.container.querySelector('[data-thinking-section-body="true"]')).toBeNull();
  });

  it('expands and collapses the thought panel from keyboard activation', () => {
    act(() => {
      renderer.render(
        <MessageThoughts
          message={{
            id: 'message-keyboard-thoughts',
            role: 'model',
            content: '',
            thoughts: 'Plan carefully.',
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings()}
          themeId="pearl"
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    const thoughtToggle = renderer.container.querySelector<HTMLElement>('[role="button"][aria-expanded="false"]');
    expect(thoughtToggle).not.toBeNull();
    expect(thoughtToggle?.getAttribute('tabindex')).toBe('0');

    act(() => {
      thoughtToggle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(thoughtToggle?.getAttribute('aria-expanded')).toBe('true');
  });
});
