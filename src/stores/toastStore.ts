import { create } from 'zustand';
import { toast } from 'sonner';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastEntry {
  id: number | string;
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
  showToast: (message: string, options?: ShowToastOptions) => number | string;
  dismissToast: (id: number | string) => void;
}

let nextToastId = 1;

const triggerSonner = (type: ToastType, message: string, id: number | string, durationMs: number) => {
  if (typeof window === 'undefined') return;
  const opts = { id, duration: durationMs };
  switch (type) {
    case 'success':
      toast.success(message, opts);
      break;
    case 'error':
      toast.error(message, opts);
      break;
    case 'warning':
      toast.warning(message, opts);
      break;
    case 'info':
    default:
      toast.info(message, opts);
      break;
  }
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  showToast: (message, options) => {
    const id = nextToastId++;
    const type = options?.type ?? 'info';
    const durationMs = options?.durationMs ?? DEFAULT_TOAST_DURATION_MS;

    triggerSonner(type, message, id, durationMs);

    const entry: ToastEntry = {
      id,
      type,
      message,
      durationMs,
    };
    set((state) => ({ toasts: [...state.toasts, entry].slice(-MAX_VISIBLE_TOASTS) }));
    return id;
  },
  dismissToast: (id) => {
    if (typeof window !== 'undefined') {
      toast.dismiss(id);
    }
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toastInfo = (message: string): number | string =>
  useToastStore.getState().showToast(message, { type: 'info' });

export const toastSuccess = (message: string): number | string =>
  useToastStore.getState().showToast(message, { type: 'success' });

export const toastWarning = (message: string): number | string =>
  useToastStore.getState().showToast(message, { type: 'warning' });

export const toastError = (message: string): number | string =>
  useToastStore.getState().showToast(message, { type: 'error' });

export { toast };
