import React, { useMemo, useRef } from 'react';
import { Header } from '@/components/header/Header';
import { MessageList } from '@/components/chat/message-list/MessageList';
import { ChatInput } from '@/components/chat/input/ChatInput';
import { ChatWidthControls } from '@/components/chat/width/ChatWidthControls';
import { DragDropOverlay } from '@/components/chat/overlays/DragDropOverlay';
import { ModelsErrorDisplay } from '@/components/chat/overlays/ModelsErrorDisplay';
import { useChatArea } from './useChatArea';
import { getShortcutDisplay } from '@/utils/platform/keyboardShortcuts';
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
  const hasActiveMessages = useChatStore((state) => state.activeMessages.some((msg) => !msg.isInternalToolMessage));
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
  const chatAreaRef = useRef<HTMLDivElement>(null);

  const newChatShortcut = useMemo(() => getShortcutDisplay('general.newChat', appSettings), [appSettings]);
  const pipShortcut = useMemo(() => getShortcutDisplay('general.togglePip', appSettings), [appSettings]);

  return (
    <div
      ref={chatAreaRef}
      className="flex flex-col flex-grow min-w-0 h-full overflow-hidden relative chat-bg-enhancement"
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

      <ChatWidthControls containerRef={chatAreaRef} enabled={hasActiveMessages && !isPipActive} />

      <div ref={chatInputContainerRef} className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
        <div
          className={`pointer-events-auto ${isPipActive ? '' : 'mx-auto w-full max-w-[var(--chat-content-width,44.35rem)]'}`}
          style={isPipActive ? undefined : { maxWidth: 'var(--chat-content-width, 44.35rem)' }}
        >
          <ChatInput />
        </div>
      </div>
    </div>
  );
};
