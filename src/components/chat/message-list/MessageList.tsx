import { logService } from '@/services/logService';
import React, { useEffect, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Message } from '@/components/message/Message';
import { WelcomeScreen } from './WelcomeScreen';
import { ScrollNavigation } from './ScrollNavigation';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import { SelectionAskPanel } from './text-selection/SelectionAskPanel';
import { useMessageListUi } from './hooks/useMessageListUi';
import { useMessageListScroll } from './hooks/useMessageListScroll';
import { useExpandedUserMessages } from './hooks/useExpandedUserMessages';
import { MessageListFooter } from './MessageListFooter';
import { MessageListModals } from './MessageListModals';
import { isGemini3Model } from '@/utils/model/modelCapabilities';
import { getMcpToolPairs, getVisibleChatMessages } from '@/utils/chat/visibility';
import { McpToolCallGroup } from '@/components/mcp/McpToolCallGroup';
import { isMarkdownFile } from '@/utils/file/fileTypeClassification';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import { useChatState } from '@/hooks/chat/useChatState';
import { useChatInputRuntime, useChatMessageListRuntime } from '@/components/layout/chat-runtime/ChatRuntimeContext';
import { useI18n } from '@/contexts/I18nContext';
import {
  formatLiveArtifactFollowupPrompt,
  type LiveArtifactFollowupPayload,
} from '@/utils/live-artifacts/liveArtifactFollowup';

const MessageListComponent: React.FC = () => {
  const appSettings = useSettingsStore((state) => state.appSettings);
  const themeId = useSettingsStore((state) => state.currentTheme.id);
  const { language } = useI18n();
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
    setAtBottom,
    onRangeChanged,
    handleTotalListHeightChanged,
    scrollToPrevTurn,
    scrollToNextTurn,
    scrollToTop,
    scrollToBottom,
    showScrollDown,
    showScrollUp,
    scrollerRef,
    handleScroll,
  } = useMessageListScroll({ messages: visibleMessages, setScrollContainerRef, activeSessionId });

  const isGemini3 = useMemo(() => isGemini3Model(currentChatSettings.modelId), [currentChatSettings.modelId]);
  const markdownPreviewFile = previewFile && isMarkdownFile(previewFile) ? previewFile : null;
  const genericPreviewFile = previewFile && !isMarkdownFile(previewFile) ? previewFile : null;
  const followOutput = React.useCallback((isAtBottom: boolean) => (isAtBottom ? 'auto' : false), []);
  const VirtuosoFooter = React.useCallback(
    () => <MessageListFooter messages={visibleMessages} chatInputHeight={chatInputHeight} />,
    [chatInputHeight, visibleMessages],
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
      return (
        // flow-root contains the message's top margins inside the item wrapper;
        // collapsed-through margins otherwise create gaps Virtuoso never
        // measures, shifting every scroll target (incl. the true bottom) short.
        <div className="flow-root px-1.5 sm:px-2 md:px-3 max-w-7xl mx-auto w-full">
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
            onSuggestionClick={onFollowUpSuggestionClick}
            onSuggestionFill={onFollowUpSuggestionFill}
            onOpenSidePanel={onOpenSidePanel}
            onConfigureFile={message.role === 'user' ? handleConfigureFile : undefined}
            isGemini3={isGemini3}
            userMessageCollapse={userMessageCollapse}
          />
          {pair ? <McpToolCallGroup calls={pair.calls} responses={pair.responses} turnActive={isLoading} /> : null}
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
      onContinueGeneration,
      onDeleteMessage,
      onEditMessage,
      onFollowUpSuggestionClick,
      onFollowUpSuggestionFill,
      onForkMessage,
      onOpenSidePanel,
      onRetryMessage,
      sessionTitle,
      userMessageCollapse,
      visibleMessages,
    ],
  );

  return (
    <>
      <div
        className={`relative flex-grow h-full ${themeId === 'pearl' ? 'bg-[var(--theme-bg-primary)]' : 'bg-[var(--theme-bg-secondary)]'}`}
      >
        {visibleMessages.length === 0 ? (
          <WelcomeScreen />
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

        <ScrollNavigation
          showUp={showScrollUp}
          showDown={showScrollDown}
          onScrollToPrev={scrollToPrevTurn}
          onScrollToNext={scrollToNextTurn}
          onScrollToTop={scrollToTop}
          onScrollToBottom={scrollToBottom}
          bottomOffset={chatInputHeight}
        />
      </div>

      <MessageListModals
        genericPreviewFile={genericPreviewFile}
        markdownPreviewFile={markdownPreviewFile}
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
      />
    </>
  );
};

export const MessageList = React.memo(MessageListComponent);
