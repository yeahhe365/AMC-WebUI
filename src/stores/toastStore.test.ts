import { afterEach, describe, expect, it } from 'vitest';
import { toastError, toastInfo, toastSuccess, toastWarning, useToastStore } from './toastStore';

describe('toastStore', () => {
  afterEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('adds a toast with sensible defaults', () => {
    const id = useToastStore.getState().showToast('Something happened');

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ id, type: 'info', message: 'Something happened', durationMs: 5000 });
  });

  it('honors type and duration overrides', () => {
    useToastStore.getState().showToast('Export failed', { type: 'error', durationMs: 9000 });

    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error', durationMs: 9000 });
  });

  it('dismisses a toast by id', () => {
    const firstId = useToastStore.getState().showToast('first');
    useToastStore.getState().showToast('second');

    useToastStore.getState().dismissToast(firstId);

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('second');
  });

  it('caps the visible stack and drops the oldest toasts', () => {
    for (let index = 0; index < 6; index += 1) {
      useToastStore.getState().showToast(`toast-${index}`);
    }

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(4);
    expect(toasts[0].message).toBe('toast-2');
    expect(toasts[3].message).toBe('toast-5');
  });

  it('exposes typed helpers for non-React call sites', () => {
    toastError('boom');
    toastSuccess('done');
    toastInfo('note');
    toastWarning('caution');

    const types = useToastStore.getState().toasts.map((toast) => toast.type);
    expect(types).toEqual(['error', 'success', 'info', 'warning']);
  });
});
