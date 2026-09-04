import React, { useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore, type ToastEntry, type ToastType } from '@/stores/toastStore';
import { Z_INDEX_TOAST_VIEWPORT } from '@/constants/layout';

const TOAST_TYPE_PRESENTATION: Record<ToastType, { icon: React.ReactNode; iconWrapClass: string }> = {
  error: {
    icon: <AlertTriangle size={16} strokeWidth={2} />,
    iconWrapClass: 'bg-[var(--theme-bg-danger)]/10 text-[var(--theme-icon-error)]',
  },
  success: {
    icon: <CheckCircle2 size={16} strokeWidth={2} />,
    iconWrapClass: 'bg-[var(--theme-bg-success)] text-[var(--theme-text-success)]',
  },
  info: {
    icon: <Info size={16} strokeWidth={2} />,
    iconWrapClass: 'bg-[var(--theme-bg-info)] text-[var(--theme-text-info)]',
  },
};

const ToastCard: React.FC<{ toast: ToastEntry }> = ({ toast }) => {
  const { t } = useI18n();
  const dismissToast = useToastStore((state) => state.dismissToast);
  const presentation = TOAST_TYPE_PRESENTATION[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [dismissToast, toast.durationMs, toast.id]);

  return (
    <div
      data-toast
      role={toast.type === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-4 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <span
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${presentation.iconWrapClass}`}
      >
        {presentation.icon}
      </span>
      <p className="min-w-0 flex-1 self-center text-sm leading-relaxed text-[var(--theme-text-primary)]">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label={t('close')}
        className="flex-shrink-0 rounded-md p-1 text-[var(--theme-text-tertiary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export const ToastViewport: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      data-toast-viewport
      aria-live="polite"
      aria-atomic="false"
      className={`fixed bottom-4 right-4 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 pointer-events-none ${Z_INDEX_TOAST_VIEWPORT}`}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
};
