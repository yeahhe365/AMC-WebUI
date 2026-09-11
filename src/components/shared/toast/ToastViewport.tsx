import React from 'react';
import { Toaster as SonnerToaster } from 'sonner';
import { useSettingsStore } from '@/stores/settingsStore';

export const ToastViewport: React.FC = () => {
  const isDark = useSettingsStore((state) => state.currentTheme?.isDark ?? true);

  return (
    <SonnerToaster
      position="bottom-right"
      theme={isDark ? 'dark' : 'light'}
      richColors
      closeButton
      expand={false}
      visibleToasts={4}
      duration={5000}
      toastOptions={{
        className:
          'amc-sonner-toast font-sans text-sm rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xl',
      }}
    />
  );
};
