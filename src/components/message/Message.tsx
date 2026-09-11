import React from 'react';
import type { FunctionCall, Part } from '@google/genai';
import { type ChatMessage, type UploadedFile, type MessageAppSettings, type SideViewContent } from '@/types';
import type { OpenHtmlPreviewHandler } from '@/utils/html-preview/previewPrivilege';
import { MessageContent } from './MessageContent';
import { MessageActions } from './MessageActions';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { useShallow } from 'zustand/react/shallow';
import { CHAT_USER_MESSAGE_INSET_CLASS } from '@/constants/layout';
import type { LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import type { UserMessageCollapseController } from './content/userMessageCollapse';

interface MessageProps {
  message: ChatMessage;
  sessionTitle: string;
  prevMessage?: ChatMessage;
  messageIndex: number;
  onEditMessage: (messageId: string, mode: 'update' | 'resend') => void;
  onDeleteMessage: (messageId: string) => void;
  onRetryMessage: (messageId: string) => void;
  onImageClick: (file: UploadedFile) => void;
  onOpenHtmlPreview: OpenHtmlPreviewHandler;
  onLiveArtifactFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
  showThoughts: boolean;
  onContinueGeneration: (messageId: string) => void;
  onForkMessage: (messageId: string) => void;
  onSuggestionClick?: (suggestion: string) => void;
  onSuggestionFill?: (suggestion: string) => void;
  onOpenSidePanel: (content: SideViewContent) => void;
  onConfigureFile?: (file: UploadedFile, messageId: string) => void;
  isGemini3?: boolean;
  userMessageCollapse?: UserMessageCollapseController;
  mcpPair?: { calls: FunctionCall[]; responses: Part[] };
  isTurnActive?: boolean;
}

export const Message: React.FC<MessageProps> = React.memo((props) => {
  const { message, prevMessage } = props;
  const appSettings = useSettingsStore(
    useShallow((state): MessageAppSettings => ({
      baseFontSize: state.appSettings.baseFontSize,
      expandCodeBlocksByDefault: state.appSettings.expandCodeBlocksByDefault,
      isMermaidRenderingEnabled: state.appSettings.isMermaidRenderingEnabled,
      isGraphvizRenderingEnabled: state.appSettings.isGraphvizRenderingEnabled,
      unwrapMislabeledHtmlBlocks: state.appSettings.unwrapMislabeledHtmlBlocks,
      liveArtifactsCustomFontSize: state.appSettings.liveArtifactsCustomFontSize,
      systemInstruction: state.appSettings.systemInstruction,
      isLiveArtifactsEnabled: state.appSettings.isLiveArtifactsEnabled,
      liveArtifactsPromptMode: state.appSettings.liveArtifactsPromptMode,
      liveArtifactsSystemPrompt: state.appSettings.liveArtifactsSystemPrompt,
      liveArtifactsSystemPrompts: state.appSettings.liveArtifactsSystemPrompts,
      autoOpenHtmlPreview: state.appSettings.autoOpenHtmlPreview,
      hideThinkingInContext: state.appSettings.hideThinkingInContext,
      thoughtTranslationTargetLanguage: state.appSettings.thoughtTranslationTargetLanguage,
      thoughtTranslationModelId: state.appSettings.thoughtTranslationModelId,
    })),
  );
  const themeId = useSettingsStore((state) => state.currentTheme.id);
  const editingMessageId = useChatStore((state) => state.editingMessageId);
  const isCurrentlyEditing = editingMessageId === message.id;

  const isGrouped = !!(
    prevMessage &&
    prevMessage.role === message.role &&
    !prevMessage.isLoading &&
    !message.isLoading &&
    new Date(message.timestamp).getTime() - new Date(prevMessage.timestamp).getTime() < 5 * 60 * 1000
  );

  const isModelThinkingOrHasThoughts =
    message.role === 'model' && (message.isLoading || (message.thoughts && props.showThoughts));

  const messageContainerClasses = `flex items-start gap-2 sm:gap-4 group ${isGrouped ? 'mt-1.5' : 'mt-6'} ${message.role === 'user' ? 'justify-end' : 'justify-start'}`;

  const widthConstraints =
    message.role === 'user'
      ? `${CHAT_USER_MESSAGE_INSET_CLASS} max-w-[80%] sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl`
      : 'max-w-[calc(100%-2.5rem)] sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl';

  let bubbleClasses = `flex flex-col min-w-0 transition-all duration-200 ${widthConstraints} message-content-container `;

  if (message.role === 'user') {
    bubbleClasses += 'w-fit px-4 py-3 sm:px-5 sm:py-4 card-shadow ';
    bubbleClasses +=
      'bg-[var(--theme-bg-user-message)] text-[var(--theme-bg-user-message-text)] rounded-2xl border border-[var(--theme-border-secondary)]/30';
    if (isCurrentlyEditing) {
      bubbleClasses += ' ring-2 ring-[var(--theme-border-focus)] shadow-lg';
    }
  } else if (message.role === 'model') {
    bubbleClasses += `w-full py-0 text-[var(--theme-text-primary)] ${isModelThinkingOrHasThoughts ? 'sm:min-w-[320px]' : ''}`;
    if (isCurrentlyEditing) {
      bubbleClasses +=
        ' ring-2 ring-[var(--theme-border-focus)]/70 rounded-2xl p-3 sm:p-4 bg-[var(--theme-bg-secondary)]/40 shadow-sm';
    }
  } else {
    bubbleClasses += 'w-fit px-4 py-3 card-shadow ';
    bubbleClasses +=
      'bg-[var(--theme-bg-error-message)] text-[var(--theme-bg-error-message-text)] rounded-2xl border border-[var(--theme-text-danger)]/20';
    if (isCurrentlyEditing) {
      bubbleClasses += ' ring-2 ring-[var(--theme-border-focus)] shadow-lg';
    }
  }

  const messageActions = (
    <MessageActions
      message={message}
      sessionTitle={props.sessionTitle}
      messageIndex={props.messageIndex}
      isGrouped={isGrouped}
      onEditMessage={props.onEditMessage}
      onDeleteMessage={props.onDeleteMessage}
      onRetryMessage={props.onRetryMessage}
      onContinueGeneration={props.onContinueGeneration}
      onForkMessage={props.onForkMessage}
      themeId={themeId}
    />
  );

  return (
    <div
      className="relative"
      data-message-id={message.id}
      data-message-role={message.role}
      data-is-editing={isCurrentlyEditing ? 'true' : undefined}
    >
      <div className={`${messageContainerClasses}`}>
        {message.role !== 'user' && messageActions}
        <div className={`${bubbleClasses}`}>
          <MessageContent
            message={message}
            onImageClick={props.onImageClick}
            onOpenHtmlPreview={props.onOpenHtmlPreview}
            onLiveArtifactFollowUp={props.onLiveArtifactFollowUp}
            showThoughts={props.showThoughts}
            baseFontSize={appSettings.baseFontSize}
            expandCodeBlocksByDefault={appSettings.expandCodeBlocksByDefault}
            isMermaidRenderingEnabled={appSettings.isMermaidRenderingEnabled}
            isGraphvizRenderingEnabled={appSettings.isGraphvizRenderingEnabled ?? true}
            onSuggestionClick={props.onSuggestionClick}
            onSuggestionFill={props.onSuggestionFill}
            appSettings={appSettings}
            themeId={themeId}
            onOpenSidePanel={props.onOpenSidePanel}
            onConfigureFile={props.onConfigureFile}
            isGemini3={props.isGemini3}
            userMessageCollapse={props.userMessageCollapse}
            mcpPair={props.mcpPair}
            isTurnActive={props.isTurnActive}
          />
        </div>
        {message.role === 'user' && messageActions}
      </div>
    </div>
  );
});
