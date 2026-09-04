import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/stores/toastStore';
import { ToastViewport } from './ToastViewport';

describe('ToastViewport', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  const renderViewport = () => {
    act(() => {
      renderer.render(<ToastViewport />);
    });
  };

  const renderedToasts = () => Array.from(document.body.querySelectorAll('[data-toast]'));

  const findCloseButton = (toast: Element) =>
    Array.from(toast.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Close');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    useToastStore.setState({ toasts: [] });
  });

  it('renders live-region toasts with semantics matching their severity', () => {
    renderViewport();

    act(() => {
      useToastStore.getState().showToast('saved', { type: 'success' });
      useToastStore.getState().showToast('exploded', { type: 'error' });
      useToastStore.getState().showToast('fyi', { type: 'info' });
    });

    const toasts = renderedToasts();
    expect(toasts).toHaveLength(3);
    expect(toasts[0].getAttribute('role')).toBe('status');
    expect(toasts[1].getAttribute('role')).toBe('alert');
    expect(toasts[2].getAttribute('role')).toBe('status');
    expect(document.body.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(toasts[1].textContent).toContain('exploded');
  });

  it('dismisses a toast from its close button', () => {
    renderViewport();

    act(() => {
      useToastStore.getState().showToast('stuck around', { durationMs: 60_000 });
    });
    const toast = renderedToasts()[0];
    expect(toast).toBeTruthy();

    act(() => {
      findCloseButton(toast!)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(renderedToasts()).toHaveLength(0);
  });

  it('auto-dismisses each toast after its duration', () => {
    renderViewport();

    act(() => {
      useToastStore.getState().showToast('brief', { durationMs: 3000 });
    });
    expect(renderedToasts()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(renderedToasts()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(renderedToasts()).toHaveLength(0);
  });

  it('does not block pointer events on the page below the stack', () => {
    renderViewport();

    act(() => {
      useToastStore.getState().showToast('hovering', { durationMs: 60_000 });
    });

    const container = document.body.querySelector('[data-toast-viewport]');
    expect(container).not.toBeNull();
    expect(container!.className).toContain('pointer-events-none');
  });
});
