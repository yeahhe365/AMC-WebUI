import { useEffect, useState } from 'react';
import type { AppSettings } from '@/types';
import { logService } from '@/services/logService';
import { toastInfo } from '@/stores/toastStore';
import { getManualInstallMessage, getPwaInstallState } from '@/pwa/install';
import { loadRegisterSW } from '@/pwa/loadRegisterSw';
import { registerPwa, type UpdateServiceWorker } from '@/pwa/register';

interface UsePwaLifecycleProps {
  language: AppSettings['language'];
}

export const usePwaLifecycle = ({ language }: UsePwaLifecycleProps) => {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installState, setInstallState] = useState(() =>
    getPwaInstallState({
      installPromptEvent: null,
      win: window,
    }),
  );
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState<UpdateServiceWorker>(() => async () => undefined);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      logService.info('PWA install prompt available.');
      const nextPromptEvent = event as BeforeInstallPromptEvent;
      setInstallPromptEvent(nextPromptEvent);
      setInstallState(
        getPwaInstallState({
          installPromptEvent: nextPromptEvent,
          win: window,
        }),
      );
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    const handleAppInstalled = () => {
      logService.info('PWA installed successfully.');
      setInstallPromptEvent(null);
      setInstallState(
        getPwaInstallState({
          installPromptEvent: null,
          win: window,
        }),
      );
    };

    window.addEventListener('appinstalled', handleAppInstalled);
    return () => window.removeEventListener('appinstalled', handleAppInstalled);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const syncInstallState = () => {
      setInstallState(
        getPwaInstallState({
          installPromptEvent,
          win: window,
        }),
      );
    };

    mediaQuery.addEventListener?.('change', syncInstallState);
    return () => mediaQuery.removeEventListener?.('change', syncInstallState);
  }, [installPromptEvent]);

  useEffect(() => {
    let cancelled = false;

    const registerRuntimePwa = async () => {
      if (!import.meta.env.PROD) {
        return;
      }

      const registerSW = await loadRegisterSW();
      const nextUpdater = registerPwa({
        enabled: true,
        registerSWImpl: registerSW,
        onNeedRefresh: () => {
          if (cancelled) return;
          setNeedRefresh(true);
          setUpdateDismissed(false);
        },
        onOfflineReady: () => {
          if (cancelled) return;
          logService.info('PWA offline app shell is ready.');
        },
        onRegisterError: (registrationError) => {
          if (cancelled) return;
          logService.error('PWA registration failed.', { error: registrationError });
        },
      });

      if (!cancelled) {
        setUpdateServiceWorker(() => nextUpdater);
      }
    };

    void registerRuntimePwa();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleInstallPwa = async () => {
    if (installState.state === 'available' && installPromptEvent) {
      installPromptEvent.prompt();
      const { outcome } = await installPromptEvent.userChoice;
      logService.info(`PWA install prompt outcome: ${outcome}`);
      setInstallPromptEvent(null);
      setInstallState(
        getPwaInstallState({
          installPromptEvent: null,
          win: window,
        }),
      );
      return;
    }

    if (installState.state === 'manual') {
      const manualMessage = getManualInstallMessage(language);
      toastInfo(manualMessage);
      logService.info('PWA install instructions shown for manual-install browser.');
    }
  };

  const handleRefreshApp = async () => {
    await updateServiceWorker(true);
  };

  return {
    installPromptEvent,
    installState,
    handleInstallPwa,
    needRefresh,
    updateDismissed,
    dismissUpdateBanner: () => setUpdateDismissed(true),
    handleRefreshApp,
  };
};
