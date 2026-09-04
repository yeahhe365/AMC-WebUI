import React, { useCallback } from 'react';
import { ChatInputToolbar } from './ChatInputToolbar';
import { ChatInputActions } from './ChatInputActions';
import { SlashCommandMenu } from './SlashCommandMenu';
import { ChatSuggestions } from './area/ChatSuggestions';
import { ChatQuoteDisplay } from './area/ChatQuoteDisplay';
import { ChatFilePreviewList } from './area/ChatFilePreviewList';
import { ChatTextArea } from './area/ChatTextArea';
import { LiveStatusBanner } from './LiveStatusBanner';
import { QueuedSubmissionList } from './QueuedSubmissionList';
import { HiddenFileInputs } from './files/HiddenFileInputs';
import { getChatInputAreaLayout } from './chatInputAreaLayout';
import { closeMediaNavPanel, openAudioNavPanel, openPdfNavPanel, openVideoNavPanel } from '@/stores/mediaNavStore';
import { CHAT_INPUT_MAX_WIDTH_CLASS, FOCUS_BLOCKING_SELECTOR } from '@/constants/layout';
import { useI18n } from '@/contexts/I18nContext';
import { useChatInputContext } from './ChatInputContext';
import { ChatInputExpandCorner } from './ChatInputExpandCorner';
import { useChatInputExpandSizing } from './useChatInputExpandSizing';
import { useCompactChatInputPresentation } from './useCompactChatInputPresentation';

export const ChatInputArea: React.FC = () => {
  const { t } = useI18n();
  const {
    chatInput,
    inputState,
    capabilities,
    liveApi,
    modalsState,
    localFileState,
    slashCommandState,
    handlers,
    inputDisabled,
    initialTextareaHeight,
    queuedSubmissionsView,
  } = useChatInputContext();

  const isFullscreen = inputState.isFullscreen;
  const isPipActive = chatInput.isPipActive;
  const { setCurrentChatSettings } = chatInput;
  const isPdfNavEnabled = !!chatInput.currentChatSettings.isPdfNavEnabled;
  const isVideoNavEnabled = !!chatInput.currentChatSettings.isVideoNavEnabled;
  const isAudioNavEnabled = !!chatInput.currentChatSettings.isAudioNavEnabled;
  const handleTogglePdfNav = useCallback(() => {
    const next = !isPdfNavEnabled;
    setCurrentChatSettings((prev) => ({ ...prev, isPdfNavEnabled: next }));
    if (next) {
      openPdfNavPanel();
    } else {
      closeMediaNavPanel();
    }
  }, [isPdfNavEnabled, setCurrentChatSettings]);
  const handleToggleVideoNav = useCallback(() => {
    const next = !isVideoNavEnabled;
    setCurrentChatSettings((prev) => ({ ...prev, isVideoNavEnabled: next }));
    if (next) {
      openVideoNavPanel();
    } else {
      closeMediaNavPanel();
    }
  }, [isVideoNavEnabled, setCurrentChatSettings]);
  const handleToggleAudioNav = useCallback(() => {
    const next = !isAudioNavEnabled;
    setCurrentChatSettings((prev) => ({ ...prev, isAudioNavEnabled: next }));
    if (next) {
      openAudioNavPanel();
    } else {
      closeMediaNavPanel();
    }
  }, [isAudioNavEnabled, setCurrentChatSettings]);
  const isAnimatingSend = inputState.isAnimatingSend;
  const isMobile = inputState.isMobile;
  const isConverting = localFileState.isConverting;
  const isExpanded = isFullscreen;

  const {
    wrapperClass,
    innerContainerClass,
    formClass,
    inputContainerClass,
    queuedSubmissionContainerClass,
    actionsContainerClass,
  } = getChatInputAreaLayout({
    isPipActive,
    isAnimatingSend,
  });

  const fontSize = chatInput.appSettings?.baseFontSize ?? 14;
  const minHeightProp = isMobile ? 26 : undefined;

  const {
    frameRef,
    frameStyle,
    compactFrameStyle,
    editorContentStyle,
    compactEditorContentStyle,
    editorElementStyle,
    isResizing,
    startResize,
    handleResizeKeyDown,
    handleTransitionEnd,
    toggleExpanded,
    restoreDefaultHeight,
    hasCustomHeight,
    maxHeight,
    minHeight,
    resizeHandleValue,
  } = useChatInputExpandSizing({
    fontSize,
    isExpanded,
    onExpandedChange: (next) => {
      if (next !== isExpanded) inputState.handleToggleFullscreen();
    },
    focusEditor: () => inputState.textareaRef.current?.focus(),
    minHeight: minHeightProp,
  });

  const handleExpandControlClick = useCallback(() => {
    if (hasCustomHeight) {
      restoreDefaultHeight();
      return;
    }

    toggleExpanded();
  }, [hasCustomHeight, restoreDefaultHeight, toggleExpanded]);

  const isComposingRef = React.useRef(false);
  const isComposingNow = useCallback(() => isComposingRef.current, []);
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
    handlers.onCompositionStart();
  }, [handlers]);
  const handleCompositionEnd = useCallback(
    (value: string) => {
      isComposingRef.current = false;
      handlers.onCompositionEnd(value);
    },
    [handlers],
  );

  const { isCompact, requestMeasurement } = useCompactChatInputPresentation({
    enabled: !hasCustomHeight && !isMobile,
    frameRef,
    isComposing: isComposingNow,
  });

  React.useEffect(() => {
    requestMeasurement();
  }, [inputState.inputText, requestMeasurement]);

  const handleInputShellClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest(FOCUS_BLOCKING_SELECTOR)) {
      return;
    }
    inputState.textareaRef.current?.focus();
  };

  const fileInputState: React.ComponentProps<typeof HiddenFileInputs>['fileInputs'] = {
    fileInputRef: modalsState.fileInputRef,
    imageInputRef: modalsState.imageInputRef,
    folderInputRef: modalsState.folderInputRef,
    zipInputRef: modalsState.zipInputRef,
    cameraInputRef: modalsState.cameraInputRef,
    handleFileChange: handlers.handleFileChange,
    handleFolderChange: handlers.handleFolderChange,
    handleZipChange: handlers.handleZipChange,
  };

  const currentFrameStyle = hasCustomHeight || !isCompact ? frameStyle : compactFrameStyle;
  const currentContentStyle = hasCustomHeight || !isCompact ? editorContentStyle : compactEditorContentStyle;

  return (
    <div className={wrapperClass}>
      {capabilities.isNativeAudioModel && (
        <video
          ref={liveApi.videoRef}
          autoPlay
          muted
          playsInline
          aria-hidden="true"
          className="fixed h-px w-px opacity-0 pointer-events-none"
        />
      )}
      <div className={`mx-auto w-full ${CHAT_INPUT_MAX_WIDTH_CLASS} px-2 sm:px-3`}>
        {chatInput.showEmptyStateSuggestions && capabilities.permissions.canGenerateSuggestions && !isExpanded && (
          <ChatSuggestions
            show={chatInput.showEmptyStateSuggestions}
            onSuggestionClick={chatInput.onSuggestionClick}
            onOrganizeInfoClick={chatInput.onOrganizeInfoClick}
            onToggleBBox={chatInput.onToggleBBox}
            isBBoxModeActive={chatInput.isBBoxModeActive}
            onToggleGuide={chatInput.onToggleGuide}
            isGuideModeActive={chatInput.isGuideModeActive}
            onTogglePdfNav={!capabilities.isGemmaModel ? handleTogglePdfNav : undefined}
            isPdfNavEnabled={isPdfNavEnabled}
            onToggleVideoNav={!capabilities.isGemmaModel ? handleToggleVideoNav : undefined}
            isVideoNavEnabled={isVideoNavEnabled}
            onToggleAudioNav={!capabilities.isGemmaModel ? handleToggleAudioNav : undefined}
            isAudioNavEnabled={isAudioNavEnabled}
            isFullscreen={isFullscreen}
          />
        )}
      </div>

      <div className={innerContainerClass}>
        <div className="relative z-50">
          <ChatInputToolbar />
        </div>

        <LiveStatusBanner
          isConnected={liveApi.isConnected}
          isSpeaking={liveApi.isSpeaking}
          isReconnecting={liveApi.isReconnecting}
          volume={liveApi.volume}
          error={liveApi.error}
          onDisconnect={liveApi.disconnect}
        />

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handlers.handleSubmit();
          }}
          className={formClass}
        >
          <SlashCommandMenu
            isOpen={slashCommandState.slashCommandState.isOpen}
            commands={slashCommandState.slashCommandState.filteredCommands}
            onSelect={slashCommandState.handleCommandSelect}
            selectedIndex={slashCommandState.slashCommandState.selectedIndex}
            query={slashCommandState.slashCommandState.query}
          />
          {queuedSubmissionsView && (
            <div className={queuedSubmissionContainerClass}>
              <QueuedSubmissionList view={queuedSubmissionsView} />
            </div>
          )}
          <div
            className={`${inputContainerClass} ${hasCustomHeight ? 'expanded' : ''}`}
            onClick={handleInputShellClick}
            data-composer-inputbar=""
          >
            {!isCompact && (
              <div
                data-composer-resize-handle=""
                data-resizing={isResizing || undefined}
                role="separator"
                aria-orientation="horizontal"
                aria-valuemin={minHeight}
                aria-valuemax={maxHeight}
                aria-valuenow={resizeHandleValue}
                aria-label={t('chatInputResizeHandleAria')}
                tabIndex={0}
                onMouseDown={startResize}
                onKeyDown={handleResizeKeyDown}
                onDoubleClick={restoreDefaultHeight}
                className="group/composer-resize-handle absolute top-0 right-4 left-4 z-30 h-2 cursor-row-resize [-webkit-app-region:no-drag] focus-visible:outline-none flex items-center justify-center"
              >
                <div className="mx-auto w-10 h-0.5 rounded-full bg-[var(--theme-border-secondary)] opacity-0 transition-all duration-200 group-hover/composer-resize-handle:opacity-100 group-hover/composer-resize-handle:w-16 group-hover/composer-resize-handle:bg-[var(--theme-bg-accent)] group-focus/composer-resize-handle:opacity-100 group-focus/composer-resize-handle:bg-[var(--theme-bg-accent)] group-data-[resizing=true]/composer-resize-handle:bg-[var(--theme-bg-accent)] group-data-[resizing=true]/composer-resize-handle:opacity-100 group-data-[resizing=true]/composer-resize-handle:w-20" />
              </div>
            )}
            {!isCompact && (
              <ChatInputExpandCorner hasCustomHeight={hasCustomHeight} onToggle={handleExpandControlClick} />
            )}
            <ChatFilePreviewList
              selectedFiles={chatInput.selectedFiles}
              onRemove={handlers.removeSelectedFile}
              onCancelUpload={chatInput.onCancelUpload}
              onConfigure={localFileState.handleConfigureFile}
              onMoveTextToInput={localFileState.handleMoveTextFileToInput}
              onPreview={localFileState.handlePreviewFile}
              isGemini3={capabilities.isGemini3}
            />

            <ChatQuoteDisplay
              quotes={inputState.quotes}
              onRemoveQuote={(index: number) => inputState.setQuotes((prev) => prev.filter((_, i) => i !== index))}
              themeId={chatInput.themeId}
            />

            <div
              ref={frameRef}
              data-composer-editor-frame=""
              className="min-w-0 overflow-hidden transition-[height] ease-out flex flex-col"
              onTransitionEnd={handleTransitionEnd}
              style={currentFrameStyle}
              onDoubleClick={restoreDefaultHeight}
            >
              <ChatTextArea
                textareaRef={inputState.textareaRef}
                value={inputState.inputText}
                onChange={handlers.handleInputChange}
                onKeyDown={handlers.handleKeyDown}
                onPaste={handlers.handlePaste}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                placeholder={
                  capabilities.isTranscribeModel ? t('chatInputPlaceholderTranscribe') : t('chatInputPlaceholder')
                }
                disabled={inputDisabled}
                isFullscreen={isFullscreen}
                hasCustomHeight={hasCustomHeight}
                isMobile={isMobile}
                initialTextareaHeight={initialTextareaHeight}
                isConverting={isConverting}
                editorContentStyle={currentContentStyle as React.CSSProperties}
                compactEditorContentStyle={compactEditorContentStyle as React.CSSProperties}
                editorElementStyle={editorElementStyle}
                isCompact={isCompact}
              />
            </div>

            <div className={actionsContainerClass}>
              <ChatInputActions />
              <HiddenFileInputs fileInputs={fileInputState} />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
