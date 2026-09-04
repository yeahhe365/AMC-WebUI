import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it } from 'vitest';
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

  it('shows cached prompt token hits when available', () => {
    act(() => {
      renderer.root.render(<PerformanceMetrics message={createMessage()} />);
    });

    expect(renderer.container.textContent).toContain('C: 40');
    expect(renderer.container.textContent).toContain('U: 80');
    expect(renderer.container.textContent).toContain('O: 80');
  });

  it('shows tool-use and thought buckets when available', () => {
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

    expect(renderer.container.textContent).toContain('T: 12');
    expect(renderer.container.textContent).toContain('R: 7');
    expect(renderer.container.textContent).not.toContain('Σ: 219');
    expect(renderer.container.querySelectorAll('.w-px.h-3').length).toBe(4);
  });

  it('does not show TTFT in the footer', () => {
    act(() => {
      renderer.root.render(<PerformanceMetrics message={createMessage({ firstTokenTimeMs: 320 })} />);
    });

    expect(renderer.container.textContent).not.toContain('TTFT');
    expect(renderer.container.textContent).not.toContain('0.32s');
  });
});
