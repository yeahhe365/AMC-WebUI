import { logService } from '@/services/logService';
import React, { useEffect, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Message } from '@/components/message/Message';
import { WelcomeScreen } from './WelcomeScreen';
import { TurnNavigator } from './TurnNavigator';
import { useTurnNavigation } from './hooks/useTurnNavigation';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import { SelectionAskPanel } from './text-selection/SelectionAskPanel';
import { useMessageListUi } from './hooks/useMessageListUi';
import { useMessageListScroll } from './hooks/useMessageListScroll';
import { useExpandedUserMessages } from './hooks/useExpandedUserMessages';
import { MessageListFooter } from './MessageListFooter';
import { MessageListModals } from './MessageListModals';
import { isGemini3Model } from '@/utils/model/modelCapabilities';
import { getMcpToolPairs, getVisibleChatMessages } from '@/utils/chat/visibility';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { getCachedModelCapabilities } from '@/stores/modelCapabilitiesStore';
import { useUIStore } from '@/stores/uiStore';
import { useChatState } from '@/hooks/chat/useChatState';
import { useChatInputRuntime, useChatMessageListRuntime } from '@/components/layout/chat-runtime/ChatRuntimeContext';
import { useI18n } from '@/contexts/I18nContext';
import { formatLiveArtifactFollowupPrompt, type LiveArtifactFollowupPayload } from '@/utils/live-ui/liveUiFollowup';

const MessageListComponent: React.FC = () => {
  const appSettings = useSettingsStore((state) => state.appSettings);
  const { language, t } = useI18n();
  const messages = useChatStore((state) => state.activeMessages);
  const setCommandedInput = useChatStore((state) => state.setCommandedInput);
  const { activeSessionId, currentChatSettings, isLoading } = useChatState(appSettings);
  const chatInputHeight = useUIStore((state) => state.chatInputHeight);
  const { onSendMessage } = useChatInputRuntime();
  const {
    sessionTitle,
    setScrollContainerRef,
    onEditMessage,
    onDeleteMessage,
    onRetryMessage,
    onUpdateMessageFile,
    onFollowUpSuggestionClick,
    onFollowUpSuggestionFill,
    onContinueGeneration,
    onForkMessage,
    onSwitchVariant,
    onQuickTTS,
    onOpenSidePanel,
  } = useChatMessageListRuntime();
  const handleQuote = React.useCallback(
    (text: string) => {
      setCommandedInput({ text, id: Date.now(), mode: 'quote' });
    },
    [setCommandedInput],
  );
  const handleInsert = React.useCallback(
    (text: string) => {
      setCommandedInput({ text, id: Date.now(), mode: 'insert' });
    },
    [setCommandedInput],
  );
  const [selectionAskState, setSelectionAskState] = React.useState<{ text: string; rect: DOMRect | null } | null>(null);
  const handleAsk = React.useCallback((text: string, rect: DOMRect | null) => {
    if (!text.trim()) return;
    setSelectionAskState({ text, rect });
  }, []);
  const handleLiveArtifactFollowUp = React.useCallback(
    (payload: LiveArtifactFollowupPayload) => {
      const followupPrompt = formatLiveArtifactFollowupPrompt(payload, language);
      if (!followupPrompt) {
        logService.warn('Ignored invalid Live Artifact follow-up payload.');
        return;
      }

      onSendMessage(followupPrompt);
    },
    [language, onSendMessage],
  );
  const visibleMessages = useMemo(() => getVisibleChatMessages(messages), [messages]);
  const mcpPairs = useMemo(() => getMcpToolPairs(messages), [messages]);
  const mcpPairMap = useMemo(() => new Map(mcpPairs.map((pair) => [pair.parentId, pair])), [mcpPairs]);
  const userMessageCollapse = useExpandedUserMessages(activeSessionId);

  // Warm the lazily-loaded renderer/diagram chunks at mount so a message's
  // first render doesn't have to wait on a chunk download (fallback→real DOM
  // swaps and their height changes are what makes Virtuoso jump).
  useEffect(() => {
    void import('@/components/message/MathMarkdownRenderer').catch(() => {});
    void import('@/components/message/blocks/MermaidBlock').catch(() => {});
    void import('@/components/message/blocks/GraphvizBlock').catch(() => {});
  }, []);

  const {
    previewFile,
    isHtmlPreviewModalOpen,
    htmlPreview,
    configuringFile,
    setConfiguringFile,
    handleFileClick,
    closeFilePreviewModal,
    allImages,
    currentImageIndex,
    handlePrevImage,
    handleNextImage,
    handleOpenHtmlPreview,
    handleCloseHtmlPreview,
    handleConfigureFile,
    handleSaveFileConfig,
  } = useMessageListUi({ messages: visibleMessages, onUpdateMessageFile });

  const {
    virtuosoRef,
    handleScrollerRef,
    atBottom,
    setAtBottom,
    onRangeChanged,
    handleTotalListHeightChanged,
    scrollToTurn,
    scrollerRef,
    handleScroll,
  } = useMessageListScroll({ messages: visibleMessages, setScrollContainerRef, activeSessionId });

  const { turnItems, activeTurn, busyTurn, messageTurnMap, handleNavigateTurn } = useTurnNavigation({
    messages: visibleMessages,
    scroller: scrollerRef,
    atBottom,
    scrollToTurn,
  });

  const isGemini3 = useMemo(() => isGemini3Model(currentChatSettings.modelId), [currentChatSettings.modelId]);
  const followOutput = React.useCallback((isAtBottom: boolean) => (isAtBottom ? 'auto' : false), []);
  const VirtuosoFooter = React.useCallback(
    () => <MessageListFooter chatInputHeight={chatInputHeight} />,
    [chatInputHeight],
  );
  const virtuosoComponents = React.useMemo(
    () => ({
      Footer: VirtuosoFooter,
    }),
    [VirtuosoFooter],
  );
  const renderMessageItem = React.useCallback(
    (index: number, message: (typeof visibleMessages)[number]) => {
      const pair = mcpPairMap.get(message.id);
      const turn = messageTurnMap.get(message.id);
      return (
        // flow-root contains the message's top margins inside the item wrapper;
        // collapsed-through margins otherwise create gaps Virtuoso never
        // measures, shifting every scroll target (incl. the true bottom) short.
        <div
          className="flow-root pl-2 pr-2 sm:pl-2.5 sm:pr-3 mx-auto w-full"
          style={{ maxWidth: 'var(--chat-content-width, 80rem)' }}
          data-chat-turn={turn}
          data-message-index={index}
        >
          <Message
            key={message.id}
            message={message}
            sessionTitle={sessionTitle}
            prevMessage={index > 0 ? visibleMessages[index - 1] : undefined}
            messageIndex={index}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
            onRetryMessage={onRetryMessage}
            onImageClick={handleFileClick}
            onOpenHtmlPreview={handleOpenHtmlPreview}
            onLiveArtifactFollowUp={handleLiveArtifactFollowUp}
            showThoughts={currentChatSettings.showThoughts}
            onContinueGeneration={onContinueGeneration}
            onForkMessage={onForkMessage}
            onSwitchVariant={onSwitchVariant}
            onSuggestionClick={onFollowUpSuggestionClick}
            onSuggestionFill={onFollowUpSuggestionFill}
            onOpenSidePanel={onOpenSidePanel}
            onConfigureFile={message.role === 'user' ? handleConfigureFile : undefined}
            isGemini3={isGemini3}
            userMessageCollapse={userMessageCollapse}
            mcpPair={pair}
            isTurnActive={isLoading}
          />
        </div>
      );
    },
    [
      currentChatSettings.showThoughts,
      handleConfigureFile,
      handleFileClick,
      handleLiveArtifactFollowUp,
      handleOpenHtmlPreview,
      isGemini3,
      isLoading,
      mcpPairMap,
      messageTurnMap,
      onContinueGeneration,
      onDeleteMessage,
      onEditMessage,
      onFollowUpSuggestionClick,
      onFollowUpSuggestionFill,
      onForkMessage,
      onOpenSidePanel,
      onRetryMessage,
      onSwitchVariant,
      sessionTitle,
      userMessageCollapse,
      visibleMessages,
    ],
  );

  return (
    <>
      <div className="relative flex-1 min-h-0 bg-[var(--theme-bg-primary)]">
        {visibleMessages.length === 0 ? (
          <div className="h-full" style={{ paddingBottom: chatInputHeight }}>
            <WelcomeScreen
              activeSessionId={activeSessionId}
              showStarterPrompts={
                !isLoading && getCachedModelCapabilities(currentChatSettings.modelId).permissions.canGenerateSuggestions
              }
              onSelectPrompt={onFollowUpSuggestionFill}
            />
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={visibleMessages}
            scrollerRef={handleScrollerRef}
            atBottomStateChange={setAtBottom}
            atBottomThreshold={40}
            followOutput={followOutput}
            computeItemKey={(_, message) => message.id}
            rangeChanged={onRangeChanged}
            totalListHeightChanged={handleTotalListHeightChanged}
            increaseViewportBy={{ top: 1200, bottom: 800 }}
            className="custom-scrollbar chat-message-list-scroller"
            onScroll={handleScroll}
            components={virtuosoComponents}
            itemContent={renderMessageItem}
          />
        )}

        <TextSelectionToolbar
          onQuote={handleQuote}
          onInsert={handleInsert}
          onAsk={handleAsk}
          onTTS={onQuickTTS}
          containerRef={scrollerRef}
        />
        {selectionAskState && (
          <SelectionAskPanel
            selectedText={selectionAskState.text}
            anchorRect={selectionAskState.rect}
            onClose={() => setSelectionAskState(null)}
            onInsert={handleInsert}
            onQuote={handleQuote}
          />
        )}

        <TurnNavigator
          items={turnItems}
          activeTurn={activeTurn}
          busyTurn={busyTurn}
          onNavigate={handleNavigateTurn}
          chatInputHeight={chatInputHeight}
          t={t}
        />
      </div>

      <MessageListModals
        previewFile={previewFile}
        closeFilePreviewModal={closeFilePreviewModal}
        handlePrevImage={handlePrevImage}
        handleNextImage={handleNextImage}
        currentImageIndex={currentImageIndex}
        imageCount={allImages.length}
        isHtmlPreviewModalOpen={isHtmlPreviewModalOpen}
        htmlPreview={htmlPreview}
        handleCloseHtmlPreview={handleCloseHtmlPreview}
        handleLiveArtifactFollowUp={handleLiveArtifactFollowUp}
        configuringFile={configuringFile}
        setConfiguringFile={setConfiguringFile}
        handleSaveFileConfig={handleSaveFileConfig}
        isGemini3={isGemini3}
        onImageClick={handleFileClick}
      />
    </>
  );
};

export const MessageList = React.memo(MessageListComponent);
