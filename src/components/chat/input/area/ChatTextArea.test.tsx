import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it } from 'vitest';
import { ChatTextArea } from './ChatTextArea';

describe('ChatTextArea', () => {
  const renderer = setupTestRenderer();

  it('focuses the textarea when the shell is clicked', () => {
    const textareaRef = { current: null } as React.RefObject<HTMLTextAreaElement>;

    act(() => {
      renderer.root.render(
        <ChatTextArea
          textareaRef={textareaRef}
          value=""
          onChange={() => {}}
          onKeyDown={() => {}}
          onPaste={() => {}}
          onCompositionStart={() => {}}
          onCompositionEnd={() => {}}
          placeholder="Ask anything"
          disabled={false}
          isFullscreen={false}
          isMobile={true}
          initialTextareaHeight={44}
          isConverting={false}
        />,
      );
    });

    const textarea = renderer.container.querySelector('textarea[data-chat-input-textarea="true"]');
    const shell = textarea?.parentElement;

    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
    expect(shell).toBeInstanceOf(HTMLDivElement);
    expect(document.activeElement).not.toBe(textarea);

    act(() => {
      shell?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.activeElement).toBe(textarea);
  });

  it('does not overwrite browser-managed composition text during parent renders', () => {
    const textareaRef = { current: null } as React.RefObject<HTMLTextAreaElement>;
    const renderTextArea = (value: string) =>
      renderer.root.render(
        <ChatTextArea
          textareaRef={textareaRef}
          value={value}
          onChange={() => {}}
          onKeyDown={() => {}}
          onPaste={() => {}}
          onCompositionStart={() => {}}
          onCompositionEnd={() => {}}
          placeholder="Ask anything"
          disabled={false}
          isFullscreen={false}
          isMobile={false}
          initialTextareaHeight={44}
          isConverting={false}
        />,
      );

    act(() => {
      renderTextArea('');
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('textarea[data-chat-input-textarea="true"]');
    expect(textarea).not.toBeNull();

    act(() => {
      textarea?.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      if (textarea) {
        textarea.value = 'ni';
      }
      renderTextArea('');
    });

    expect(textarea?.value).toBe('ni');
  });

  it('renders autosize textarea with proper padding nudging text away from the top edge', () => {
    const textareaRef = { current: null } as React.RefObject<HTMLTextAreaElement>;

    act(() => {
      renderer.root.render(
        <ChatTextArea
          textareaRef={textareaRef}
          value="A single line"
          onChange={() => {}}
          onKeyDown={() => {}}
          onPaste={() => {}}
          onCompositionStart={() => {}}
          onCompositionEnd={() => {}}
          placeholder="Ask anything"
          disabled={false}
          isFullscreen={false}
          isMobile={false}
          initialTextareaHeight={24}
          isConverting={false}
        />,
      );
    });

    const visibleTextarea = renderer.container.querySelector<HTMLTextAreaElement>(
      'textarea[data-chat-input-textarea="true"]',
    );

    expect(visibleTextarea).not.toBeNull();
    expect(visibleTextarea?.value).toBe('A single line');
    expect(visibleTextarea?.className).toContain('pt-0.5');
    expect(visibleTextarea?.className).toContain('pb-0');
    expect(visibleTextarea?.className).toContain('px-1');
    expect(visibleTextarea?.className).toContain('pr-9');
  });

  it('renders expanded textarea in fullscreen or custom height mode', () => {
    const textareaRef = { current: null } as React.RefObject<HTMLTextAreaElement>;

    act(() => {
      renderer.root.render(
        <ChatTextArea
          textareaRef={textareaRef}
          value="Expanded content"
          onChange={() => {}}
          onKeyDown={() => {}}
          onPaste={() => {}}
          onCompositionStart={() => {}}
          onCompositionEnd={() => {}}
          placeholder="Ask anything"
          disabled={false}
          isFullscreen={true}
          isMobile={false}
          initialTextareaHeight={24}
          isConverting={false}
        />,
      );
    });

    const visibleTextarea = renderer.container.querySelector<HTMLTextAreaElement>(
      'textarea[data-chat-input-textarea="true"]',
    );

    expect(visibleTextarea).not.toBeNull();
    expect(visibleTextarea?.className).toContain('h-full');
    expect(visibleTextarea?.className).toContain('overflow-y-auto');
  });

  it('preserves the caret when the parent writes a matching longer value back into the textarea', () => {
    const textareaRef = { current: null } as React.RefObject<HTMLTextAreaElement>;
    const renderTextArea = (value: string) =>
      renderer.root.render(
        <ChatTextArea
          textareaRef={textareaRef}
          value={value}
          onChange={() => {}}
          onKeyDown={() => {}}
          onPaste={() => {}}
          onCompositionStart={() => {}}
          onCompositionEnd={() => {}}
          placeholder="Ask anything"
          disabled={false}
          isFullscreen={false}
          isMobile={false}
          initialTextareaHeight={44}
          isConverting={false}
        />,
      );

    act(() => {
      renderTextArea('hello world');
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('textarea[data-chat-input-textarea="true"]');
    expect(textarea).not.toBeNull();

    act(() => {
      textarea?.setSelectionRange(5, 5);
      renderTextArea('hello world!');
    });

    expect(textarea?.selectionStart).toBe(5);
    expect(textarea?.selectionEnd).toBe(5);
    expect(textarea?.value).toBe('hello world!');
  });
});
