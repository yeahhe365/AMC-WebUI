import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'error';

export interface ToastEntry {
  id: number;
  type: ToastType;
  message: string;
  durationMs: number;
}

interface ShowToastOptions {
  type?: ToastType;
  durationMs?: number;
}

const DEFAULT_TOAST_DURATION_MS = 5000;
const MAX_VISIBLE_TOASTS = 4;

interface ToastState {
  toasts: ToastEntry[];
  showToast: (message: string, options?: ShowToastOptions) => number;
  dismissToast: (id: number) => void;
}

let nextToastId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  showToast: (message, options) => {
    const id = nextToastId++;
    const entry: ToastEntry = {
      id,
      type: options?.type ?? 'info',
      message,
      durationMs: options?.durationMs ?? DEFAULT_TOAST_DURATION_MS,
    };
    set((state) => ({ toasts: [...state.toasts, entry].slice(-MAX_VISIBLE_TOASTS) }));
    return id;
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export const toastInfo = (message: string): number => useToastStore.getState().showToast(message, { type: 'info' });

export const toastSuccess = (message: string): number =>
  useToastStore.getState().showToast(message, { type: 'success' });

export const toastError = (message: string): number => useToastStore.getState().showToast(message, { type: 'error' });
