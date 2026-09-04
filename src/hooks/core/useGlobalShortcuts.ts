import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { CHAT_INPUT_TEXTAREA_SELECTOR, FOCUS_HISTORY_SEARCH_EVENT } from '@/constants/layout';
import { useFullscreen } from '@/hooks/ui/useFullscreen';
import type { AppSettings, ChatSettings, ModelOption, ChatProviderId } from '@/types';
import { isShortcutPressed } from '@/utils/keyboardShortcuts';
import { getTabCycleModelIds } from '@/utils/model/modelCatalog';
import { resolveChatApiRoute } from '@/utils/chatApiRoute';
import { buildProviderAwareModelList } from '@/utils/thirdPartyApiProviders';
import { isEditableElement } from '@/utils/chat-input/focus';

interface UseGlobalShortcutsProps {
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

const buildTabCycleAvailableModels = (appSettings: AppSettings, availableModels: ModelOption[]): ModelOption[] =>
  buildProviderAwareModelList(appSettings, availableModels);

export const useGlobalShortcuts = ({
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
}: UseGlobalShortcutsProps) => {
  const { toggleFullscreen } = useFullscreen();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const targetDocument = event.view?.document || document;
      const activeElement = targetDocument.activeElement as HTMLElement;

      const isGenerallyInputFocused = activeElement instanceof HTMLElement && isEditableElement(activeElement);

      if (isShortcutPressed(event, 'global.stopCancel', appSettings)) {
        if (isLoading) {
          event.preventDefault();
          onStopGenerating();
          return;
        }
      }

      if (isShortcutPressed(event, 'general.newChat', appSettings)) {
        event.preventDefault();
        startNewChat();
        return;
      }

      if (isShortcutPressed(event, 'general.searchChats', appSettings)) {
        event.preventDefault();
        targetDocument.dispatchEvent(new Event(FOCUS_HISTORY_SEARCH_EVENT));
        return;
      }

      if (isShortcutPressed(event, 'general.openLogs', appSettings)) {
        event.preventDefault();
        setIsLogViewerOpen((prev) => !prev);
        return;
      }

      if (isShortcutPressed(event, 'general.togglePip', appSettings)) {
        if (isPipSupported) {
          event.preventDefault();
          onTogglePip();
        }
        return;
      }

      if (isShortcutPressed(event, 'general.toggleFullscreen', appSettings)) {
        event.preventDefault();
        toggleFullscreen(document.documentElement);
        return;
      }

      if (isShortcutPressed(event, 'input.cycleModels', appSettings)) {
        const isChatTextareaFocused =
          activeElement instanceof Element && activeElement.matches(CHAT_INPUT_TEXTAREA_SELECTOR);
        if (isChatTextareaFocused || !isGenerallyInputFocused) {
          event.preventDefault();
          // Follow the active session's routing decision — the modelId we cycle
          // is whatever the session is currently routed to, not a global mode.
          const currentRoute = resolveChatApiRoute(appSettings, currentChatSettings);
          const currentModelId = currentRoute.modelId || currentChatSettings.modelId;
          const tabCycleModels = buildTabCycleAvailableModels(appSettings, availableModels);
          const cycleModels = getTabCycleModelIds(tabCycleModels, appSettings.tabModelCycleIds);
          if (cycleModels.length === 0) {
            return;
          }
          const currentIndex = cycleModels.indexOf(currentModelId);
          const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % cycleModels.length;
          const newModelId = cycleModels[nextIndex];
          if (newModelId) {
            handleSelectModelInHeader(newModelId);
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    if (pipWindow && pipWindow.document) {
      pipWindow.document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (pipWindow && pipWindow.document) {
        pipWindow.document.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [
    appSettings,
    setAppSettings,
    startNewChat,
    currentChatSettings,
    availableModels,
    handleSelectModelInHeader,
    setIsLogViewerOpen,
    isPipSupported,
    onTogglePip,
    pipWindow,
    isLoading,
    onStopGenerating,
    toggleFullscreen,
  ]);
};
