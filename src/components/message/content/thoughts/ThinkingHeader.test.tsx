import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it } from 'vitest';
import { ThinkingHeader } from './ThinkingHeader';

describe('ThinkingHeader', () => {
  const renderer = setupTestRenderer();

  it('renders the loading spinner without accent background chrome', async () => {
    await act(async () => {
      renderer.root.render(<ThinkingHeader isLoading isExpanded={false} />);
    });

    const spinner = renderer.container.querySelector('svg.google-spinner');
    const spinnerWrapper = spinner?.parentElement;

    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute('width')).toBe('14');
    expect(spinnerWrapper).not.toBeNull();
    expect(spinnerWrapper?.className).not.toContain('rounded-lg');
    expect(spinnerWrapper?.className).not.toContain('bg-[var(--theme-bg-accent)]/10');
    expect(spinnerWrapper?.className).not.toContain('w-7');
    expect(spinnerWrapper?.className).not.toContain('h-7');
  });

  it('shows the settled thinking time once loading finishes', async () => {
    await act(async () => {
      renderer.root.render(<ThinkingHeader isLoading={false} thinkingTimeMs={12000} isExpanded={false} />);
    });

    expect(renderer.container.querySelector('svg.lucide-check')).toBeNull();
    expect(renderer.container.textContent).toContain('12s');
  });

  it('keeps the THINKING label during loading instead of a step title', async () => {
    await act(async () => {
      renderer.root.render(<ThinkingHeader isLoading isExpanded={false} />);
    });

    expect(renderer.container.textContent).toContain('Thinking');
  });

  it('shows the settled duration once thinkingTimeMs is set, even while the reply is still streaming', async () => {
    await act(async () => {
      renderer.root.render(
        <ThinkingHeader
          isLoading
          thinkingTimeMs={4200}
          generationStartTime={new Date('2026-04-21T00:00:00.000Z')}
          firstTokenTimeMs={200}
          isExpanded={false}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('4s');
    expect(renderer.container.textContent).not.toContain('Thinking');
    expect(renderer.container.textContent).toContain('TTFT');
    expect(renderer.container.textContent).toContain('0.20s');
  });

  it('does not show TTFT next to the live THINKING label', async () => {
    await act(async () => {
      renderer.root.render(
        <ThinkingHeader
          isLoading
          generationStartTime={new Date('2026-04-21T00:00:00.000Z')}
          firstTokenTimeMs={200}
          isExpanded={false}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('Thinking');
    expect(renderer.container.textContent).not.toContain('TTFT');
    expect(renderer.container.textContent).not.toContain('0.20s');
  });

  it('does not show TTFT when firstTokenTimeMs is zero', async () => {
    await act(async () => {
      renderer.root.render(
        <ThinkingHeader isLoading={false} thinkingTimeMs={12000} firstTokenTimeMs={0} isExpanded={false} />,
      );
    });

    expect(renderer.container.textContent).toContain('12s');
    expect(renderer.container.textContent).not.toContain('TTFT');
    expect(renderer.container.textContent).not.toContain('0.00s');
  });
});
