import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { HoverCard } from './HoverCard';

describe('HoverCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders anchor and does not show content immediately', () => {
    render(
      <HoverCard
        anchor={<button>Row Anchor</button>}
        content={<div>Hover Card Content</div>}
        openDelayMs={800}
      />,
    );

    expect(screen.getByText('Row Anchor')).not.toBeNull();
    expect(screen.queryByText('Hover Card Content')).toBeNull();
  });

  it('shows content after 800ms hover', async () => {
    const { container } = render(
      <HoverCard
        anchor={<button>Row Anchor</button>}
        content={<div>Hover Card Content</div>}
        openDelayMs={800}
      />,
    );

    const root = container.firstElementChild as HTMLElement;
    fireEvent.pointerEnter(root);

    // After 400ms, still closed
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByText('Hover Card Content')).toBeNull();

    // After 800ms, opens
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByText('Hover Card Content')).not.toBeNull();
  });

  it('dismisses when disabled becomes true', async () => {
    const { container, rerender } = render(
      <HoverCard
        anchor={<button>Row Anchor</button>}
        content={<div>Hover Card Content</div>}
        openDelayMs={800}
        disabled={false}
      />,
    );

    const root = container.firstElementChild as HTMLElement;
    fireEvent.pointerEnter(root);

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.queryByText('Hover Card Content')).not.toBeNull();

    rerender(
      <HoverCard
        anchor={<button>Row Anchor</button>}
        content={<div>Hover Card Content</div>}
        openDelayMs={800}
        disabled={true}
      />,
    );

    expect(screen.queryByText('Hover Card Content')).toBeNull();
  });

  it('copies text and shows copied label on click when copyText is provided', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const { container } = render(
      <HoverCard
        anchor={<button>Row Anchor</button>}
        content={<div>Card Body</div>}
        openDelayMs={800}
        copyText="Session Full Title"
        copyLabel="Copy"
        copiedLabel="Copied!"
      />,
    );

    const root = container.firstElementChild as HTMLElement;
    fireEvent.pointerEnter(root);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    const card = screen.getByRole('button', { name: /Copy: Session Full Title/i });
    expect(card).not.toBeNull();

    await act(async () => {
      fireEvent.click(card);
    });

    expect(writeTextMock).toHaveBeenCalledWith('Session Full Title');
    expect(screen.getByText('Copied!')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.queryByText('Copied!')).toBeNull();
    expect(screen.getByText('Card Body')).not.toBeNull();
  });

  it('positions card adjacent to the row on the right side using bounding client rect', () => {
    const { container } = render(
      <ul>
        <li>
          <HoverCard
            anchor={<button>Row Anchor</button>}
            content={<div>Card Body</div>}
            openDelayMs={800}
          />
        </li>
      </ul>,
    );

    const li = container.querySelector('li') as HTMLElement;
    vi.spyOn(li, 'getBoundingClientRect').mockReturnValue({
      top: 150,
      left: 10,
      right: 260,
      bottom: 186,
      width: 250,
      height: 36,
      x: 10,
      y: 150,
      toJSON: () => {},
    });

    const root = container.querySelector('.block') as HTMLElement;
    fireEvent.pointerEnter(root);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    const card = document.querySelector('[role="tooltip"]') as HTMLElement;
    expect(card).not.toBeNull();
    // 260 + ANCHOR_GAP (8) = 268
    expect(card.style.left).toBe('268px');
    expect(card.style.top).toBe('150px');
    expect(card.className).not.toContain('transition-all');
    expect(card.className).not.toContain('zoom-in-95');
    expect(card.className).toContain('transition-opacity');
  });
});

