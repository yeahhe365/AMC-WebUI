import React, { useMemo } from 'react';
import { AttachmentMenu } from './AttachmentMenu';
import { ToolsMenu } from './ToolsMenu';
import { McpPickerMenu } from './toolbar/McpPickerMenu';
import { IconNewChat } from '@/components/icons';
import { CHAT_INPUT_BUTTON_CLASS } from '@/constants/buttonClasses';
import { useI18n } from '@/contexts/I18nContext';
import { WebSearchToggle } from './actions/WebSearchToggle';
import { LiveControls } from './actions/LiveControls';
import { RecordControls } from './actions/RecordControls';
import { ComposerAuxiliaryButtons } from './actions/ComposerAuxiliaryButtons';
import { SendControls } from './actions/SendControls';
import { ComposerMoreMenu } from './actions/ComposerMoreMenu';
import { ThinkingSpeedControl } from './actions/ThinkingSpeedControl';
import { useComposerAuxiliaryActions } from './actions/useComposerAuxiliaryActions';
import { useAuxiliaryActionCollapse } from './actions/useAuxiliaryActionCollapse';
import { COMPOSER_CLUSTER_GAP_CLASS, COMPOSER_CLUSTER_SEPARATION_CLASS } from '@/constants/designTokens';
import { useChatInputActionsContext, useChatInputComposerStatusContext } from './ChatInputContext';
import { isGemmaModel } from '@/utils/model/modelCapabilities';

const ChatInputActionsComponent: React.FC = () => {
  const { t } = useI18n();
  const {
    disabled,
    isWaitingForUpload,
    isLiveConnected,
    isNativeAudioModel,
    isLiveTranslate,
    isLiveTranscribe,
    isTranscribeModel,
    isImageGenerationModel,
    isTtsModel,
    onToggleToolAndFocus,
    onCountTokens,
    currentModelId,
    providerId,
    toolStates,
    isLoading,
    isEditing,
    showVoiceInputButton,
    onNewChat,
  } = useChatInputActionsContext();
  const { canQueueMessage } = useChatInputComposerStatusContext();
  const isGemma = isGemmaModel(currentModelId);
  const focusedToolStates = useMemo(
    () => ({
      googleSearch: {
        isEnabled: !!toolStates.googleSearch?.isEnabled,
        onToggle: toolStates.googleSearch?.onToggle
          ? () => onToggleToolAndFocus(toolStates.googleSearch!.onToggle!)
          : undefined,
      },
      codeExecution: {
        isEnabled: !!toolStates.codeExecution?.isEnabled,
        onToggle: toolStates.codeExecution?.onToggle
          ? () => onToggleToolAndFocus(toolStates.codeExecution!.onToggle!)
          : undefined,
      },
      localPython: {
        isEnabled: !!toolStates.localPython?.isEnabled,
        onToggle: toolStates.localPython?.onToggle
          ? () => onToggleToolAndFocus(toolStates.localPython!.onToggle!)
          : undefined,
      },
      urlContext: {
        isEnabled: !!toolStates.urlContext?.isEnabled,
        onToggle: toolStates.urlContext?.onToggle
          ? () => onToggleToolAndFocus(toolStates.urlContext!.onToggle!)
          : undefined,
      },
      deepSearch: {
        isEnabled: !!toolStates.deepSearch?.isEnabled,
        onToggle: toolStates.deepSearch?.onToggle
          ? () => onToggleToolAndFocus(toolStates.deepSearch!.onToggle!)
          : undefined,
      },
      googleMaps: {
        isEnabled: !!toolStates.googleMaps?.isEnabled,
        onToggle: toolStates.googleMaps?.onToggle
          ? () => onToggleToolAndFocus(toolStates.googleMaps!.onToggle!)
          : undefined,
      },
      alwaysKeepThinking: {
        isEnabled: !!toolStates.alwaysKeepThinking?.isEnabled,
        onToggle: toolStates.alwaysKeepThinking?.onToggle
          ? () => onToggleToolAndFocus(toolStates.alwaysKeepThinking!.onToggle!)
          : undefined,
      },
    }),
    [onToggleToolAndFocus, toolStates],
  );
  const toolUtilityActions = useMemo(
    () => ({
      onCountTokens,
    }),
    [onCountTokens],
  );
  const auxiliaryActions = useComposerAuxiliaryActions();
  const auxiliaryActionSignature = useMemo(
    () => auxiliaryActions.map((action) => `${action.id}:${action.disabled}`).join('|'),
    [auxiliaryActions],
  );
  const hasComposerMoreActions = auxiliaryActions.length > 0;
  const measurementSignature = useMemo(
    () =>
      [
        hasComposerMoreActions,
        isNativeAudioModel,
        isLiveConnected,
        showVoiceInputButton,
        auxiliaryActionSignature,
        isLoading,
        isEditing,
        isWaitingForUpload,
        canQueueMessage,
      ].join('|'),
    [
      canQueueMessage,
      hasComposerMoreActions,
      isEditing,
      isLiveConnected,
      isLoading,
      isNativeAudioModel,
      isWaitingForUpload,
      auxiliaryActionSignature,
      showVoiceInputButton,
    ],
  );
  const { rootRef, leftActionsRef, rightActionsRef, shouldCollapseAuxiliaryActions } = useAuxiliaryActionCollapse({
    hasAuxiliaryActions: hasComposerMoreActions,
    measurementSignature,
  });
  const showAuxiliaryActionsInMenu = hasComposerMoreActions && shouldCollapseAuxiliaryActions;

  return (
    <div
      ref={rootRef}
      data-testid="chat-input-actions-root"
      className={`flex w-full items-center justify-between ${COMPOSER_CLUSTER_SEPARATION_CLASS} overflow-visible`}
    >
      <div
        ref={leftActionsRef}
        data-testid="chat-input-actions-left"
        className={`flex min-w-0 items-center ${COMPOSER_CLUSTER_GAP_CLASS} overflow-x-auto p-1 -m-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        <button
          type="button"
          onClick={onNewChat}
          disabled={disabled}
          className={`${CHAT_INPUT_BUTTON_CLASS} bg-transparent hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]`}
          aria-label={t('newChat')}
          title={t('newChat')}
          data-testid="chat-input-new-chat-button"
        >
          <IconNewChat size={20} />
        </button>

        {!isTtsModel && !isLiveTranslate && !isLiveTranscribe && <AttachmentMenu />}

        {isNativeAudioModel && !isLiveTranslate && !isLiveTranscribe && (
          <WebSearchToggle
            isGoogleSearchEnabled={!!focusedToolStates.googleSearch?.isEnabled}
            onToggleGoogleSearch={focusedToolStates.googleSearch?.onToggle ?? (() => undefined)}
            disabled={disabled}
          />
        )}

        <ToolsMenu
          currentModelId={currentModelId}
          providerId={providerId}
          toolStates={focusedToolStates}
          toolUtilityActions={toolUtilityActions}
          disabled={disabled}
        />

        {!isTtsModel &&
          !isLiveTranslate &&
          !isLiveTranscribe &&
          !isTranscribeModel &&
          !isNativeAudioModel &&
          !isImageGenerationModel &&
          !isGemma && <McpPickerMenu disabled={disabled} />}
      </div>

      <div
        ref={rightActionsRef}
        data-testid="chat-input-actions-right"
        className={`flex min-w-0 flex-shrink-0 items-center ${COMPOSER_CLUSTER_GAP_CLASS}`}
      >
        {showVoiceInputButton && !isLiveConnected && !isNativeAudioModel && !isImageGenerationModel && !isTtsModel && (
          <RecordControls />
        )}

        {!showAuxiliaryActionsInMenu && auxiliaryActions.length > 0 && (
          <div className={`flex items-center ${COMPOSER_CLUSTER_GAP_CLASS}`}>
            <ComposerAuxiliaryButtons actions={auxiliaryActions} />
          </div>
        )}

        {showAuxiliaryActionsInMenu && (
          <div>
            <ComposerMoreMenu
              actions={auxiliaryActions}
              disabled={disabled && auxiliaryActions.every((action) => action.disabled)}
            />
          </div>
        )}

        {isNativeAudioModel && <LiveControls />}

        {!isNativeAudioModel && <ThinkingSpeedControl />}

        <div className="ml-0.5 flex items-center">
          <SendControls />
        </div>
      </div>
    </div>
  );
};

export const ChatInputActions = React.memo(ChatInputActionsComponent);
