import React, { useMemo } from 'react';
import { Header } from '@/components/header/Header';
import { MessageList } from '@/components/chat/message-list/MessageList';
import { ChatInput } from '@/components/chat/input/ChatInput';
import { DragDropOverlay } from '@/components/chat/overlays/DragDropOverlay';
import { ModelsErrorDisplay } from '@/components/chat/overlays/ModelsErrorDisplay';
import { useChatArea } from './useChatArea';
import { getShortcutDisplay } from '@/utils/keyboardShortcuts';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUIStore } from '@/stores/uiStore';
import { useChatState } from '@/hooks/chat/useChatState';
import { useChatHeaderRuntime } from './chat-runtime/ChatRuntimeContext';

export const ChatArea: React.FC = () => {
  const appSettings = useSettingsStore((state) => state.appSettings);
  const themeId = useSettingsStore((state) => state.currentTheme.id);
  const { isLoading } = useChatState(appSettings);
  const isSwitchingModel = useChatStore((state) => state.isSwitchingModel);
  const isHistorySidebarOpen = useUIStore((state) => state.isHistorySidebarOpen);
  const {
    isAppDraggingOver,
    modelsLoadingError,
    handleAppDragEnter,
    handleAppDragOver,
    handleAppDragLeave,
    handleAppDrop,
    currentModelName,
    availableModels,
    selectedModelId,
    isLiveArtifactsPromptActive,
    isLiveArtifactsPromptBusy,
    isPipSupported,
    isPipActive,
    onNewChat,
    newChatHref,
    onOpenScenariosModal,
    onToggleHistorySidebar,
    onLoadLiveArtifactsPrompt,
    onSelectModel,
    onTogglePip,
  } = useChatHeaderRuntime();
  const { chatInputContainerRef } = useChatArea();

  const newChatShortcut = useMemo(() => getShortcutDisplay('general.newChat', appSettings), [appSettings]);
  const pipShortcut = useMemo(() => getShortcutDisplay('general.togglePip', appSettings), [appSettings]);

  return (
    <div
      className="flex flex-col flex-grow h-full overflow-hidden relative chat-bg-enhancement"
      onDragEnter={handleAppDragEnter}
      onDragOver={handleAppDragOver}
      onDragLeave={handleAppDragLeave}
      onDrop={handleAppDrop}
    >
      <DragDropOverlay isDraggingOver={isAppDraggingOver} />

      <Header
        onNewChat={onNewChat}
        newChatHref={newChatHref}
        onOpenScenariosModal={onOpenScenariosModal}
        onToggleHistorySidebar={onToggleHistorySidebar}
        isLoading={isLoading}
        currentModelName={currentModelName}
        availableModels={availableModels}
        selectedModelId={selectedModelId}
        onSelectModel={onSelectModel}
        isSwitchingModel={isSwitchingModel}
        isHistorySidebarOpen={isHistorySidebarOpen}
        onLoadLiveArtifactsPrompt={onLoadLiveArtifactsPrompt}
        isLiveArtifactsPromptActive={isLiveArtifactsPromptActive}
        isLiveArtifactsPromptBusy={isLiveArtifactsPromptBusy}
        isPipSupported={isPipSupported}
        isPipActive={isPipActive}
        onTogglePip={onTogglePip}
        themeId={themeId}
        newChatShortcut={newChatShortcut}
        pipShortcut={pipShortcut}
      />

      <ModelsErrorDisplay error={modelsLoadingError} />

      <MessageList />

      <div ref={chatInputContainerRef} className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
        <div className={`pointer-events-auto ${isPipActive ? '' : 'mx-auto w-full max-w-[44.35rem]'}`}>
          <ChatInput />
        </div>
      </div>
    </div>
  );
};
