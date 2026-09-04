import type { Dispatch, SetStateAction } from 'react';
import { type AppSettings, type ChatSettings, type ModelOption, type ChatProviderId } from '@/types';
import { usePwaLifecycle } from './usePwaLifecycle';
import { useGlobalShortcuts } from './useGlobalShortcuts';

interface AppEventsProps {
  appSettings: AppSettings;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  startNewChat: () => void;
  currentChatSettings: ChatSettings;
  availableModels: ModelOption[];
  handleSelectModelInHeader: (modelId: string, providerId?: ChatProviderId) => void;
  setIsLogViewerOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
  onTogglePip: () => void;
  isPipSupported: boolean;
  pipWindow?: Window | null;
  isLoading: boolean;
  onStopGenerating: () => void;
}

/**
 * App event orchestration layer. Delegates the PWA lifecycle and global
 * keyboard shortcuts to dedicated hooks and forwards their combined state.
 */
export const useAppEvents = ({
  appSettings,
  setAppSettings,
  startNewChat,
  currentChatSettings,
  availableModels,
  handleSelectModelInHeader,
  setIsLogViewerOpen,
  onTogglePip,
  isPipSupported,
  pipWindow,
  isLoading,
  onStopGenerating,
}: AppEventsProps) => {
  const pwa = usePwaLifecycle({ language: appSettings.language });

  useGlobalShortcuts({
    appSettings,
    setAppSettings,
    startNewChat,
    currentChatSettings,
    availableModels,
    handleSelectModelInHeader,
    setIsLogViewerOpen,
    onTogglePip,
    isPipSupported,
    pipWindow,
    isLoading,
    onStopGenerating,
  });

  return pwa;
};
