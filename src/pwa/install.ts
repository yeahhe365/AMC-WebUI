import { resolveAppLanguage, type SupportedLanguage } from '@/i18n/languageRegistry';
import type { AppLanguage } from '@/types';

export type PwaInstallState = 'available' | 'manual' | 'installed';

interface PwaInstallSnapshot {
  state: PwaInstallState;
  canInstall: boolean;
}

const resolveLanguage = (language: AppLanguage, navigatorLanguage?: string): SupportedLanguage =>
  resolveAppLanguage(language, navigatorLanguage);

const isStandaloneMode = (win: Window = window) => {
  const displayModeStandalone = win.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const navigatorStandalone = Boolean((win.navigator as Navigator & { standalone?: boolean }).standalone);

  return displayModeStandalone || navigatorStandalone;
};

export const getPwaInstallState = ({
  installPromptEvent,
  win = window,
}: {
  installPromptEvent: BeforeInstallPromptEvent | null;
  win?: Window;
}): PwaInstallSnapshot => {
  if (isStandaloneMode(win)) {
    return {
      state: 'installed',
      canInstall: false,
    };
  }

  if (installPromptEvent) {
    return {
      state: 'available',
      canInstall: true,
    };
  }

  return {
    state: 'manual',
    canInstall: true,
  };
};

export const getManualInstallMessage = (
  language: AppLanguage = 'en',
  navigatorLanguage = typeof navigator !== 'undefined' ? navigator.language : 'en',
) => {
  const resolvedLanguage = resolveLanguage(language, navigatorLanguage);

  switch (resolvedLanguage) {
    case 'zh':
      return '请使用浏览器菜单将此应用安装到设备。';
    case 'ja':
      return 'ブラウザのメニューからこのアプリをインストールしてください。';
    case 'ko':
      return '브라우저 메뉴에서 이 앱을 설치하세요.';
    case 'es':
      return 'Usa el menú de tu navegador para instalar esta aplicación.';
    case 'fr':
      return 'Utilisez le menu de votre navigateur pour installer cette application.';
    case 'de':
      return 'Installieren Sie diese App über das Menü Ihres Browsers.';
    default:
      return 'Use your browser menu to install this app.';
  }
};
