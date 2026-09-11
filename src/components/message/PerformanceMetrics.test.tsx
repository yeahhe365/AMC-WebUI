import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { PerformanceMetrics } from './PerformanceMetrics';
import type { ChatMessage } from '@/types';

const createMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'message-1',
  role: 'model',
  content: 'Hello',
  timestamp: new Date('2026-04-17T00:00:00.000Z'),
  promptTokens: 120,
  cachedPromptTokens: 40,
  completionTokens: 80,
  totalTokens: 200,
  generationStartTime: new Date('2026-04-17T00:00:00.000Z'),
  generationEndTime: new Date('2026-04-17T00:00:01.000Z'),
  ...overrides,
});

describe('PerformanceMetrics', () => {
  const renderer = setupTestRenderer();

  beforeEach(() => {
    useSettingsStore.setState({ language: 'en' as SupportedLanguage });
  });

  it('shows a compact total instead of the full U/C/T/R/O row', () => {
    act(() => {
      renderer.root.render(<PerformanceMetrics message={createMessage()} />);
    });

    // 常态行：对标 Cherry Studio 的 "200 Tokens · 80.0 Tokens/s"
    expect(renderer.container.textContent).toContain('200 Tokens');
    expect(renderer.container.textContent).toContain('80.0 Tokens/s');
  });

  it('keeps the U/C breakdown inside the hover details card without ugly letter prefixes', () => {
    act(() => {
      renderer.root.render(<PerformanceMetrics message={createMessage()} />);
    });

    expect(renderer.container.textContent).toContain('Uncached80 Tokens');
    expect(renderer.container.textContent).toContain('Cache read40 Tokens');
    expect(renderer.container.textContent).toContain('Output80 Tokens');
  });

  it('shows tool-use and thought buckets in the details card with the stored total', () => {
    act(() => {
      renderer.root.render(
        <PerformanceMetrics
          message={createMessage({
            toolUsePromptTokens: 12,
            thoughtTokens: 7,
            totalTokens: 219,
          })}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('Tool use12 Tokens');
    expect(renderer.container.textContent).toContain('Reasoning7 Tokens');
    expect(renderer.container.textContent).toContain('219 Tokens');
  });

  it('shows TTFT inside the details card', () => {
    act(() => {
      renderer.root.render(<PerformanceMetrics message={createMessage({ firstTokenTimeMs: 320 })} />);
    });

    expect(renderer.container.textContent).toContain('0.32s');
  });

  it('shows the cumulative session total when available', () => {
    act(() => {
      renderer.root.render(<PerformanceMetrics message={createMessage({ cumulativeTotalTokens: 5000 })} />);
    });

    expect(renderer.container.textContent).toContain('5,000');
  });

  it('does not render phantom zeros for messages without usage', () => {
    act(() => {
      renderer.root.render(
        <PerformanceMetrics
          message={createMessage({
            promptTokens: undefined,
            cachedPromptTokens: undefined,
            completionTokens: undefined,
            toolUsePromptTokens: undefined,
            thoughtTokens: undefined,
            totalTokens: undefined,
            cumulativeTotalTokens: undefined,
          })}
        />,
      );
    });

    // 计时器仍在，但 token 按钮（含总数）不应出现
    expect(renderer.container.textContent).toContain('1.0s');
    expect(renderer.container.querySelector('button')).toBeNull();
  });

  it('renders nothing when there are neither tokens nor timing', () => {
    act(() => {
      renderer.root.render(
        <PerformanceMetrics
          message={{
            id: 'message-2',
            role: 'model',
            content: 'Hello',
            timestamp: new Date('2026-04-17T00:00:00.000Z'),
          }}
        />,
      );
    });

    expect(renderer.container.textContent).toBe('');
  });

  it('opens the details card with hover intent, not instantly', () => {
    act(() => {
      renderer.root.render(<PerformanceMetrics message={createMessage()} />);
    });

    const popup = renderer.container.querySelector('.group\\/tokens > div.absolute');
    expect(popup).not.toBeNull();
    // 命名 group 隔离：外层 Message 容器本身带 .group，不能用匿名 group-hover
    expect(renderer.container.querySelector('.group\\/tokens')).not.toBeNull();
    // 200ms 意图延迟防划过误弹；pb-2 桥接按钮与卡片之间的间隙防闪烁
    expect(popup?.className).toContain('group-hover/tokens:delay-200');
    expect(popup?.className).toContain('pb-2');
    expect(popup?.className).toContain('invisible');
  });

  it('renders a plain text button for user messages like Cherry Studio UserMessageTokens', () => {
    act(() => {
      renderer.root.render(
        <PerformanceMetrics
          message={{
            id: 'user-msg-1',
            role: 'user',
            content: 'User query',
            timestamp: new Date('2026-04-17T00:00:00.000Z'),
            promptTokens: 150,
            totalTokens: 150,
          }}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('150 Tokens');
    // User message does not have hover popup card
    expect(renderer.container.querySelector('.group\\/tokens')).toBeNull();
  });

  it('dismisses the details popup when clicking the button like Cherry Studio', () => {
    act(() => {
      renderer.root.render(<PerformanceMetrics message={createMessage()} />);
    });

    const button = renderer.container.querySelector('button');
    expect(button).not.toBeNull();

    // Before mousedown, details popup is present in DOM
    expect(renderer.container.querySelector('.group\\/tokens > div.absolute')).not.toBeNull();

    // Trigger mousedown (left click)
    act(() => {
      button?.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    });

    // After mousedown, details popup is dismissed
    expect(renderer.container.querySelector('.group\\/tokens > div.absolute')).toBeNull();
  });
});
