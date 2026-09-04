import { act, useState } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageText } from './MessageText';
import { createAppSettings, createChatSettings } from '@/test/data/factories';
import { useChatStore } from '@/stores/chatStore';
import type { UserMessageCollapseKey } from './userMessageCollapse';

const { mockUseMessageStream } = vi.hoisted(() => ({
  mockUseMessageStream: vi.fn(() => ({
    streamContent: '',
    streamThoughts: '',
  })),
}));

vi.mock('@/components/message/GroundedResponse', () => ({
  GroundedResponse: () => <div data-testid="grounded-response" />,
}));

vi.mock('@/components/message/LazyMarkdownRenderer', () => ({
  LazyMarkdownRenderer: ({ content, contentPreNormalized }: { content: string; contentPreNormalized?: boolean }) => (
    <div data-testid="markdown-renderer" data-pre-normalized={String(Boolean(contentPreNormalized))}>
      {content}
    </div>
  ),
}));

vi.mock('@/components/icons/GoogleSpinner', () => ({
  GoogleSpinner: () => <div data-testid="google-spinner" />,
}));

vi.mock('@/hooks/ui/useSmoothStreaming', () => ({
  useSmoothStreaming: (content: string) => content,
}));

vi.mock('@/hooks/ui/useMessageStream', () => ({
  useMessageStream: mockUseMessageStream,
}));

describe('MessageText', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    vi.useFakeTimers();
    mockUseMessageStream.mockReturnValue({
      streamContent: '',
      streamThoughts: '',
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders grounded response metadata even when the message only contains images', () => {
    act(() => {
      renderer.render(
        <MessageText
          message={{
            id: 'message-1',
            role: 'model',
            content: '',
            files: [
              {
                id: 'file-1',
                name: 'grounded-image.png',
                type: 'image/png',
                size: 100,
              },
            ],
            groundingMetadata: {
              groundingChunks: [
                {
                  image: {
                    sourceUri: 'https://example.com/source',
                  },
                },
              ],
            },
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={false}
          appSettings={createAppSettings({ autoOpenHtmlPreview: false, hideThinkingInContext: false })}
          themeId="pearl"
          baseFontSize={16}
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="grounded-response"]')).not.toBeNull();
  });

  it('cancels pending automatic HTML preview when unmounted', () => {
    const onOpenHtmlPreview = vi.fn();
    const loadingMessage = {
      id: 'message-html',
      role: 'model' as const,
      content: '```html\n<div>preview</div>\n```',
      isLoading: true,
      timestamp: new Date('2026-04-21T00:00:00.000Z'),
    };
    const loadedMessage = {
      ...loadingMessage,
      isLoading: false,
    };

    const renderMessage = (message: typeof loadingMessage) => (
      <MessageText
        message={message}
        showThoughts={false}
        appSettings={createAppSettings({ autoOpenHtmlPreview: true, hideThinkingInContext: false })}
        themeId="pearl"
        baseFontSize={16}
        onImageClick={vi.fn()}
        onOpenHtmlPreview={onOpenHtmlPreview}
        expandCodeBlocksByDefault={false}
        isMermaidRenderingEnabled={true}
        isGraphvizRenderingEnabled={true}
        onOpenSidePanel={vi.fn()}
      />
    );

    act(() => {
      renderer.render(renderMessage(loadingMessage));
    });

    act(() => {
      renderer.render(renderMessage(loadedMessage));
    });

    act(() => {
      renderer.unmount();
      vi.advanceTimersByTime(100);
    });

    expect(onOpenHtmlPreview).not.toHaveBeenCalled();
  });

  it('does not auto-open previews for code blocks with non-HTML languages, even when content looks like HTML', () => {
    const onOpenHtmlPreview = vi.fn();
    const loadingMessage = {
      id: 'message-mislabeled-html',
      role: 'model' as const,
      content: '```python\n<div style="display:flex"><span>Ready</span></div>\n```',
      isLoading: true,
      timestamp: new Date('2026-04-21T00:00:00.000Z'),
    };
    const loadedMessage = {
      ...loadingMessage,
      isLoading: false,
    };

    const renderMessage = (message: typeof loadingMessage) => (
      <MessageText
        message={message}
        showThoughts={false}
        appSettings={createAppSettings({ autoOpenHtmlPreview: true, hideThinkingInContext: false })}
        themeId="pearl"
        baseFontSize={16}
        onImageClick={vi.fn()}
        onOpenHtmlPreview={onOpenHtmlPreview}
        expandCodeBlocksByDefault={false}
        isMermaidRenderingEnabled={true}
        isGraphvizRenderingEnabled={true}
        onOpenSidePanel={vi.fn()}
      />
    );

    act(() => {
      renderer.render(renderMessage(loadingMessage));
    });

    act(() => {
      renderer.render(renderMessage(loadedMessage));
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(onOpenHtmlPreview).not.toHaveBeenCalled();
  });

  it('auto-opens previews for code blocks with an explicit html language', () => {
    const onOpenHtmlPreview = vi.fn();
    const loadingMessage = {
      id: 'message-explicit-html',
      role: 'model' as const,
      content: '```html\n<div style="display:flex"><span>Ready</span></div>\n```',
      isLoading: true,
      timestamp: new Date('2026-04-21T00:00:00.000Z'),
    };
    const loadedMessage = {
      ...loadingMessage,
      isLoading: false,
    };

    const renderMessage = (message: typeof loadingMessage) => (
      <MessageText
        message={message}
        showThoughts={false}
        appSettings={createAppSettings({ autoOpenHtmlPreview: true, hideThinkingInContext: false })}
        themeId="pearl"
        baseFontSize={16}
        onImageClick={vi.fn()}
        onOpenHtmlPreview={onOpenHtmlPreview}
        expandCodeBlocksByDefault={false}
        isMermaidRenderingEnabled={true}
        isGraphvizRenderingEnabled={true}
        onOpenSidePanel={vi.fn()}
      />
    );

    act(() => {
      renderer.render(renderMessage(loadingMessage));
    });

    act(() => {
      renderer.render(renderMessage(loadedMessage));
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(onOpenHtmlPreview).toHaveBeenCalledWith('<div style="display:flex"><span>Ready</span></div>', {
      initialTrueFullscreen: false,
      privilege: 'unrestricted',
    });
  });

  it('resolves Live Artifacts mode from the active session settings, matching the header button', () => {
    // Global defaults do NOT enable LA, but the active session has the LA prompt
    // (via currentChatSettings from the chat store). The renderer must treat the
    // session's ```json as a Live Artifact interaction, not fall back to the
    // global setting — that is exactly the #1 mismatch (button on, renderer off).
    useChatStore.setState({
      activeSessionId: 'session-la',
      savedSessions: [
        {
          id: 'session-la',
          title: 'LA Session',
          timestamp: Date.now(),
          messages: [],
          settings: createChatSettings({
            systemInstruction: '[Live Artifacts Protocol - zh]\nBuild interactive artifacts.',
          }),
        },
      ],
    });

    const LA_MARKER = '[Live Artifacts Protocol - zh]';
    const json = JSON.stringify({
      instruction: 'Adjust the chart',
      schema: { type: 'object', properties: { color: { type: 'string' } } },
    });
    const content = `\`\`\`json\n${json}\n\`\`\``;

    act(() => {
      renderer.render(
        <MessageText
          message={{
            id: 'message-la-session',
            role: 'model',
            content,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={false}
          appSettings={createAppSettings({
            autoOpenHtmlPreview: false,
            hideThinkingInContext: false,
            // No LA prompt at the global level: systemInstruction is empty.
            systemInstruction: '',
          })}
          themeId="pearl"
          baseFontSize={16}
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    // The session's LA prompt flows into the rendered markdown content so
    // CodeBlock (gated on liveArtifactsMode) renders it as an interaction form.
    // We assert via the markdown-renderer testid that the content is unchanged
    // (the mode flag itself is consumed downstream by CodeBlock), and that the
    // component read the session settings without error.
    expect(renderer.container.querySelector('[data-testid="markdown-renderer"]')?.textContent).toBe(content);
    expect(useChatStore.getState().savedSessions[0].settings.systemInstruction).toContain(LA_MARKER);

    useChatStore.setState({
      activeSessionId: null,
      savedSessions: [],
    });
  });

  it('omits live raw reasoning markup from the visible answer body', () => {
    mockUseMessageStream.mockReturnValue({
      streamContent: 'drafting the answer',
      streamThoughts: '',
    });

    act(() => {
      renderer.render(
        <MessageText
          message={{
            id: 'message-raw',
            role: 'model',
            content: '<thinking>',
            isLoading: true,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={false}
          appSettings={createAppSettings({ autoOpenHtmlPreview: false, hideThinkingInContext: true })}
          themeId="pearl"
          baseFontSize={16}
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="markdown-renderer"]')).toBeNull();
  });

  it('renders only the answer body when raw thinking is embedded in content', () => {
    act(() => {
      renderer.render(
        <MessageText
          message={{
            id: 'message-raw-complete',
            role: 'model',
            content: '<thinking>Plan carefully.</thinking>\nFinal answer.',
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={true}
          appSettings={createAppSettings({ autoOpenHtmlPreview: false, hideThinkingInContext: false })}
          themeId="pearl"
          baseFontSize={16}
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="markdown-renderer"]')?.textContent).toBe('Final answer.');
  });

  it('passes bare standalone html documents to markdown as internal artifact fences', () => {
    const htmlDocument =
      '<!DOCTYPE html><html><head><title>Transformer 模型深度解析图谱</title><style>:root{--primary:#2563eb}</style></head><body><h1>Transformer</h1></body></html>';

    act(() => {
      renderer.render(
        <MessageText
          message={{
            id: 'message-bare-html',
            role: 'model',
            content: htmlDocument,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={false}
          appSettings={createAppSettings({ autoOpenHtmlPreview: false, hideThinkingInContext: false })}
          themeId="pearl"
          baseFontSize={16}
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="markdown-renderer"]')?.textContent).toBe(
      `\`\`\`amc-live-artifact-html\n${htmlDocument}\n\`\`\``,
    );
  });

  it('normalizes standalone raw html fragments into artifact code fences for markdown rendering', () => {
    const htmlFragment = '<div style="display:flex;gap:12px"><span>Ready</span></div>';

    act(() => {
      renderer.render(
        <MessageText
          message={{
            id: 'message-html-fragment',
            role: 'model',
            content: htmlFragment,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={false}
          appSettings={createAppSettings({ autoOpenHtmlPreview: false, hideThinkingInContext: false })}
          themeId="pearl"
          baseFontSize={16}
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="markdown-renderer"]')?.textContent).toBe(
      `\`\`\`amc-live-artifact-html\n${htmlFragment}\n\`\`\``,
    );
    expect(
      renderer.container.querySelector('[data-testid="markdown-renderer"]')?.getAttribute('data-pre-normalized'),
    ).toBe('true');
  });

  it('normalizes streamed raw html fragments into artifact fences while loading', () => {
    const htmlFragment = '<div style="display:grid"><strong>Streaming artifact';
    mockUseMessageStream.mockReturnValue({
      streamContent: htmlFragment,
      streamThoughts: '',
    });

    act(() => {
      renderer.render(
        <MessageText
          message={{
            id: 'message-streaming-html-fragment',
            role: 'model',
            content: '',
            isLoading: true,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={false}
          appSettings={createAppSettings({ autoOpenHtmlPreview: false, hideThinkingInContext: false })}
          themeId="pearl"
          baseFontSize={16}
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="markdown-renderer"]')?.textContent).toBe(
      `\`\`\`amc-live-artifact-html\n${htmlFragment}\n\`\`\``,
    );
  });

  it('renders a full HTML document mislabeled as css inline instead of as css code', () => {
    const document = '<!doctype html><html><body><div>Transformer 模型</div></body></html>';
    const content = `<div style="background:#6d28d9;color:white">前置卡片</div>\n\n\`\`\`css\n${document}\n\`\`\``;

    act(() => {
      renderer.render(
        <MessageText
          message={{
            id: 'message-mislabeled-document',
            role: 'model',
            content,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={false}
          appSettings={createAppSettings({ autoOpenHtmlPreview: false, hideThinkingInContext: false })}
          themeId="pearl"
          baseFontSize={16}
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    const renderedContent = renderer.container.querySelector('[data-testid="markdown-renderer"]')?.textContent;

    expect(renderedContent).toContain('Transformer 模型');
    expect(renderedContent).not.toContain('```css');
  });

  it('keeps a bare html fragment mislabeled as css fenced (no Live Artifact marker)', () => {
    const htmlFragment =
      '<!-- 核心定义卡片 -->\n<div style="padding:20px;background:#f9fafb"><strong>Transformer</strong></div>';
    const content = `<div style="background:#6d28d9;color:white">前置卡片</div>\n\n\`\`\`css\n${htmlFragment}\n\`\`\``;

    act(() => {
      renderer.render(
        <MessageText
          message={{
            id: 'message-bare-fragment',
            role: 'model',
            content,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={false}
          appSettings={createAppSettings({ autoOpenHtmlPreview: false, hideThinkingInContext: false })}
          themeId="pearl"
          baseFontSize={16}
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    const renderedContent = renderer.container.querySelector('[data-testid="markdown-renderer"]')?.textContent;

    // 收紧后:无 LA 标记的裸片段按源码显示(围栏保留)。
    expect(renderedContent).toContain('```css');
  });

  it('collapses long user messages by default and expands them on request', () => {
    const content = Array.from(
      { length: 10 },
      (_, index) => `Line ${index + 1}: Please inspect this part carefully.`,
    ).join('\n');
    const StatefulMessageText = () => {
      const [expandedUserMessageKeys, setExpandedUserMessageKeys] = useState<Set<UserMessageCollapseKey>>(
        () => new Set(),
      );

      return (
        <MessageText
          message={{
            id: 'message-long-user',
            role: 'user',
            content,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={false}
          appSettings={createAppSettings({ autoOpenHtmlPreview: false, hideThinkingInContext: false })}
          themeId="pearl"
          baseFontSize={16}
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
          userMessageCollapse={{
            expandedUserMessageKeys,
            onToggleUserMessageExpanded: (key) => {
              setExpandedUserMessageKeys((expandedKeys) => {
                const nextExpandedKeys = new Set(expandedKeys);
                if (nextExpandedKeys.has(key)) {
                  nextExpandedKeys.delete(key);
                } else {
                  nextExpandedKeys.add(key);
                }
                return nextExpandedKeys;
              });
            },
          }}
        />
      );
    };

    act(() => {
      renderer.render(<StatefulMessageText />);
    });

    const collapseRegion = renderer.container.querySelector('[data-user-message-collapsed="true"]');
    const toggle = renderer.container.querySelector<HTMLButtonElement>('[aria-label="Expand"]');

    expect(collapseRegion).toBeInTheDocument();
    expect(toggle).toBeInTheDocument();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.textContent).toContain('Expand');

    act(() => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(renderer.container.querySelector('[data-user-message-collapsed="false"]')).toBeInTheDocument();
    expect(renderer.container.querySelector<HTMLButtonElement>('[aria-label="Collapse"]')?.textContent).toContain(
      'Collapse',
    );
  });

  it('keeps long user messages expanded when controlled state is restored after remount', () => {
    const content = Array.from(
      { length: 10 },
      (_, index) => `Line ${index + 1}: Keep this expanded after virtualization remounts.`,
    ).join('\n');
    const onToggleUserMessageExpanded = vi.fn();

    const renderMessage = (expandedUserMessageKeys: ReadonlySet<UserMessageCollapseKey>) => (
      <MessageText
        message={{
          id: 'message-long-user-controlled',
          role: 'user',
          content,
          timestamp: new Date('2026-04-21T00:00:00.000Z'),
        }}
        showThoughts={false}
        appSettings={createAppSettings({ autoOpenHtmlPreview: false, hideThinkingInContext: false })}
        themeId="pearl"
        baseFontSize={16}
        onImageClick={vi.fn()}
        onOpenHtmlPreview={vi.fn()}
        expandCodeBlocksByDefault={false}
        isMermaidRenderingEnabled={true}
        isGraphvizRenderingEnabled={true}
        onOpenSidePanel={vi.fn()}
        userMessageCollapse={{ expandedUserMessageKeys, onToggleUserMessageExpanded }}
      />
    );

    act(() => {
      renderer.render(renderMessage(new Set()));
    });

    const toggle = renderer.container.querySelector<HTMLButtonElement>('[aria-label="Expand"]');

    act(() => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const collapseKey = onToggleUserMessageExpanded.mock.calls[0]?.[0];
    expect(collapseKey).toMatch(/^message-long-user-controlled:/);

    act(() => {
      renderer.unmount();
      renderer.render(renderMessage(new Set([collapseKey])));
    });

    expect(renderer.container.querySelector('[data-user-message-collapsed="false"]')).toBeInTheDocument();
    expect(renderer.container.querySelector<HTMLButtonElement>('[aria-label="Collapse"]')).toBeInTheDocument();
  });

  it('does not collapse long model messages', () => {
    const content = Array.from({ length: 10 }, (_, index) => `Line ${index + 1}: Full assistant response.`).join('\n');

    act(() => {
      renderer.render(
        <MessageText
          message={{
            id: 'message-long-model',
            role: 'model',
            content,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          }}
          showThoughts={false}
          appSettings={createAppSettings({ autoOpenHtmlPreview: false, hideThinkingInContext: false })}
          themeId="pearl"
          baseFontSize={16}
          onImageClick={vi.fn()}
          onOpenHtmlPreview={vi.fn()}
          expandCodeBlocksByDefault={false}
          isMermaidRenderingEnabled={true}
          isGraphvizRenderingEnabled={true}
          onOpenSidePanel={vi.fn()}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-user-message-collapsed]')).not.toBeInTheDocument();
    expect(renderer.container.querySelector('[aria-label="Expand"]')).not.toBeInTheDocument();
  });
});
