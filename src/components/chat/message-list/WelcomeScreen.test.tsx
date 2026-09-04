import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { setTestMatchMedia } from '@/test/browser/environment';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { WelcomeScreen } from './WelcomeScreen';

const advanceTypewriter = async (characterCount: number) => {
  for (let index = 0; index < characterCount; index += 1) {
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
  }
};

const setHoverCapablePointer = (matches: boolean) => {
  setTestMatchMedia((query) => query === '(hover: hover) and (pointer: fine)' && matches);
};

describe('WelcomeScreen', () => {
  const renderer = setupTestRenderer();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exposes the welcome greeting as an accessible button', async () => {
    await act(async () => {
      renderer.root.render(<WelcomeScreen />);
    });

    const trigger = renderer.container.querySelector('button');

    expect(trigger).not.toBeNull();
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('aria-live', 'polite');
    expect(trigger).toHaveTextContent('How can I help you today?');
  });

  it('does not render a decorative glow above the greeting', async () => {
    await act(async () => {
      renderer.root.render(<WelcomeScreen />);
    });

    expect(renderer.container.querySelector('.blur-2xl')).toBeNull();
    expect(renderer.container.innerHTML).not.toContain('radial-gradient');
  });

  it('keeps the default cursor so the desktop hover trigger feels hidden', async () => {
    await act(async () => {
      renderer.root.render(<WelcomeScreen />);
    });

    const trigger = renderer.container.querySelector('button');

    expect(trigger?.className).not.toContain('cursor-pointer');
  });

  it('switches to one easter egg quote when the mobile welcome greeting is clicked', async () => {
    setHoverCapablePointer(false);

    await act(async () => {
      renderer.root.render(<WelcomeScreen />);
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
    });
    await advanceTypewriter('Cogito, ergo sum.'.length);

    expect(trigger).toHaveTextContent('Cogito, ergo sum.');
    expect(trigger).not.toHaveTextContent('How can I help you today?');
  });

  it('types the easter egg quote after clicking the mobile welcome greeting', async () => {
    setHoverCapablePointer(false);

    await act(async () => {
      renderer.root.render(<WelcomeScreen />);
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
    });

    expect(trigger).not.toHaveTextContent('Cogito, ergo sum.');

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    expect(trigger).toHaveTextContent('C');
    expect(trigger).not.toHaveTextContent('Cogito, ergo sum.');

    await advanceTypewriter('Cogito, ergo sum.'.length - 1);

    expect(trigger).toHaveTextContent('Cogito, ergo sum.');
  });

  it('triggers the desktop easter egg only after hovering for three seconds', async () => {
    setHoverCapablePointer(true);

    await act(async () => {
      renderer.root.render(<WelcomeScreen />);
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
    });

    expect(trigger).toHaveTextContent('How can I help you today?');

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    await act(async () => {
      vi.advanceTimersByTime(2999);
    });

    expect(trigger).toHaveTextContent('How can I help you today?');

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(trigger).not.toHaveTextContent('Cogito, ergo sum.');

    await advanceTypewriter('Cogito, ergo sum.'.length);

    expect(trigger).toHaveTextContent('Cogito, ergo sum.');
  });

  it('cancels the desktop easter egg when hover ends before three seconds', async () => {
    setHoverCapablePointer(true);

    await act(async () => {
      renderer.root.render(<WelcomeScreen />);
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(2000);
      trigger?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      vi.advanceTimersByTime(1000);
    });

    expect(trigger).toHaveTextContent('How can I help you today?');
  });

  it('restores the welcome greeting when leaving after the desktop easter egg appears', async () => {
    setHoverCapablePointer(true);

    await act(async () => {
      renderer.root.render(<WelcomeScreen />);
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(3000);
    });
    await advanceTypewriter('Cogito, ergo sum.'.length);

    expect(trigger).toHaveTextContent('Cogito, ergo sum.');

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });

    expect(trigger).toHaveTextContent('How can I help you today?');
  });

  it('restores the welcome greeting when leaving while the desktop easter egg is typing', async () => {
    setHoverCapablePointer(true);

    await act(async () => {
      renderer.root.render(<WelcomeScreen />);
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(3000);
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    expect(trigger).toHaveTextContent('C');

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });

    expect(trigger).toHaveTextContent('How can I help you today?');
  });

  it('supports keyboard activation for the easter egg', async () => {
    await act(async () => {
      renderer.root.render(<WelcomeScreen />);
    });

    const trigger = renderer.container.querySelector<HTMLButtonElement>('button');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await advanceTypewriter('Cogito, ergo sum.'.length);

    expect(trigger).toHaveTextContent('Cogito, ergo sum.');
  });

  it('updates the displayed greeting when the translated welcome text changes', async () => {
    await act(async () => {
      renderer.root.render(<WelcomeScreen />);
    });

    expect(renderer.container.querySelector('button')).toHaveTextContent('How can I help you today?');

    await act(async () => {
      useSettingsStore.setState({ language: 'zh' });
      renderer.root.render(<WelcomeScreen />);
    });

    expect(renderer.container.querySelector('button')).toHaveTextContent('有什么可以帮忙的？');
  });
});
