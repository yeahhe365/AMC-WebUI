import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it } from 'vitest';
import { ThinkingStrip } from './ThinkingStrip';
import { THINKING_STRIP_CONTENT_HEIGHT_REM } from './thinkingStripMetrics';

describe('ThinkingStrip', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('renders nothing when there is no thought tail', () => {
    act(() => {
      renderer.render(<ThinkingStrip thoughtsTail="" />);
    });

    expect(renderer.container.querySelector('[data-thinking-strip="true"]')).toBeNull();
  });

  it('renders a 5-line-capped viewport containing the tail text', () => {
    act(() => {
      renderer.render(<ThinkingStrip thoughtsTail={'Line one\nLine two\nLine three\nLine four\nLine five'} />);
    });

    const strip = renderer.container.querySelector('[data-thinking-strip="true"]');
    const viewport = renderer.container.querySelector('[data-thinking-strip-viewport="true"]');

    expect(strip).not.toBeNull();
    expect(viewport).not.toBeNull();
    // Max height — short content shrinks to its natural height while longer
    // content locks to the cap and scrolls.
    expect((viewport as HTMLElement).style.maxHeight).toBe(`${THINKING_STRIP_CONTENT_HEIGHT_REM}rem`);
    expect(strip?.textContent).toContain('Line five');
    // Bottom-anchored scroll window: flex-col-reverse + overflow-y-auto.
    expect(viewport?.getAttribute('class')).toContain('flex-col-reverse');
    expect(viewport?.getAttribute('class')).toContain('overflow-y-auto');
  });

  it('renders no title row — only the plain-text tail', () => {
    act(() => {
      renderer.render(<ThinkingStrip thoughtsTail="Plan details" />);
    });

    const strip = renderer.container.querySelector('[data-thinking-strip="true"]');
    expect(strip?.textContent).toContain('Plan details');
    // The flat strip has no title row — no bold title span anywhere.
    expect(strip?.querySelector('.truncate.font-semibold')).toBeNull();
    expect(strip?.querySelector('.font-semibold')).toBeNull();
  });

  it('marks flat tails with data-thinking-mode="flat"', () => {
    act(() => {
      renderer.render(<ThinkingStrip thoughtsTail="Plan details" />);
    });

    expect(renderer.container.querySelector('[data-thinking-strip="true"]')?.getAttribute('data-thinking-mode')).toBe(
      'flat',
    );
  });

  it('keeps Gemini flat tails scrollable but locks third-party tails to the latest lines', () => {
    act(() => {
      renderer.render(<ThinkingStrip thoughtsTail="Line one\nLine two\nLine three" />);
    });
    const geminiViewport = renderer.container.querySelector('[data-thinking-strip-viewport="true"]');
    expect(geminiViewport?.getAttribute('class')).toContain('overflow-y-auto');
    expect(geminiViewport?.getAttribute('class')).not.toContain('overflow-hidden');

    act(() => {
      renderer.render(<ThinkingStrip thoughtsTail="Line one\nLine two\nLine three" thinkingSource="third-party" />);
    });
    const thirdPartyViewport = renderer.container.querySelector('[data-thinking-strip-viewport="true"]');
    // Third-party thinking is locked to the latest lines — no manual scroll up.
    expect(thirdPartyViewport?.getAttribute('class')).toContain('overflow-hidden');
    expect(thirdPartyViewport?.getAttribute('class')).not.toContain('overflow-y-auto');
  });

  it('routes sectioned input to the sectioned strip', () => {
    act(() => {
      renderer.render(
        <ThinkingStrip
          thoughtsTail=""
          sections={[
            { title: 'Interpreting the Query', body: 'The user asks about X.' },
            { title: 'Final Answer', body: 'Done.' },
          ]}
        />,
      );
    });

    const strip = renderer.container.querySelector('[data-thinking-strip="true"]');
    expect(strip).not.toBeNull();
    expect(strip?.getAttribute('data-thinking-mode')).toBe('sections');
    // Current (last) title is shown.
    expect(strip?.textContent).toContain('Final Answer');
    // Section counter renders.
    expect(strip?.textContent).toContain('Section 2');
    // The body window caps at the 5-line height.
    const body = renderer.container.querySelector('[data-thinking-section-body="true"]') as HTMLElement | null;
    expect(body?.style.maxHeight).toBe(`${THINKING_STRIP_CONTENT_HEIGHT_REM}rem`);
    expect(body?.textContent).toContain('Done.');
  });

  it('forces flat mode for third-party thinking even with sectioned content', () => {
    act(() => {
      renderer.render(
        <ThinkingStrip
          thoughtsTail="**Interpreting the Query**\nThe user asks about X."
          thinkingSource="third-party"
          sections={[
            { title: 'Interpreting the Query', body: 'The user asks about X.' },
            { title: 'Final Answer', body: 'Done.' },
          ]}
        />,
      );
    });

    const strip = renderer.container.querySelector('[data-thinking-strip="true"]');
    expect(strip).not.toBeNull();
    // Third-party thinking never renders as a sectioned, titled strip — markdown
    // headers in its reasoning are just flat text.
    expect(strip?.getAttribute('data-thinking-mode')).toBe('flat');
    expect(strip?.textContent).not.toContain('Section 2');
    expect(strip?.textContent).not.toContain('Final Answer');
    expect(renderer.container.querySelector('[data-thinking-section-body="true"]')).toBeNull();
  });

  it('falls back to the flat tail when sections is null or empty', () => {
    act(() => {
      renderer.render(<ThinkingStrip thoughtsTail="Flat text" sections={null} />);
    });

    expect(renderer.container.querySelector('[data-thinking-strip="true"]')?.getAttribute('data-thinking-mode')).toBe(
      'flat',
    );
  });
});
