import React from 'react';
import { CornerDownLeft, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { CHAT_INPUT_BUTTON_CLASS } from '@/constants/buttonClasses';
import { useChatStore } from '@/stores/chatStore';
import {
  useChatInputActionsContext,
  useChatInputComposerStatusContext,
} from '@/components/chat/input/ChatInputContext';
import { interpolate } from '@/i18n/interpolate';

const SEND_BUTTON_SIZE_CLASS = '!h-9 !w-9';

export const SendControls: React.FC = () => {
  const { isLoading, isWaitingForUpload } = useChatInputActionsContext();
  const { canSend, canQueueMessage, queuedCount, onQueueMessage, onCancelPendingUploadSend } =
    useChatInputComposerStatusContext();
  const isEditing = !!useChatStore((state) => state.editingMessageId);
  const onStopGenerating = useChatStore((state) => state.stopGenerating);
  const onCancelEdit = useChatStore((state) => state.cancelEdit);
  const { t } = useI18n();

  const isStop = isLoading || isWaitingForUpload;
  const isDisabled = !isStop && !canSend;
  const backgroundClass = isStop
    ? 'bg-[var(--theme-bg-danger)] hover:bg-[var(--theme-bg-danger-hover)]'
    : 'bg-[#3964FE] hover:bg-[#3358e0] dark:bg-[#679EFE] dark:hover:bg-[#5a8de0]';

  let label = t('sendMessageAria');
  let title = t('sendMessageTitle');

  if (isStop) {
    label = isWaitingForUpload ? t('cancelPendingUploadSendAria') : t('stopGeneratingAria');
    title = isWaitingForUpload ? t('cancelPendingUploadSendTitle') : t('stopGeneratingTitle');
  } else if (isEditing) {
    label = t('updateMessageAria');
    title = t('updateMessageTitle');
  }

  const handlePrimaryClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isStop) {
      e.preventDefault();
      e.stopPropagation();
      if (isWaitingForUpload) {
        onCancelPendingUploadSend();
      } else {
        onStopGenerating();
      }
    }
  };

  return (
    <div className="flex items-center">
      {canQueueMessage && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onQueueMessage?.();
          }}
          className={`${CHAT_INPUT_BUTTON_CLASS} bg-transparent hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-icon-settings)] relative`}
          aria-label={t('queueMessageAria')}
          title={queuedCount >= 20 ? t('queuedSubmissionLimitReached') : t('queueMessageTitle')}
          disabled={!canQueueMessage}
        >
          <CornerDownLeft size={16} strokeWidth={2} />
          {queuedCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--theme-bg-accent)] px-1 text-[10px] font-semibold text-[var(--theme-text-accent)]"
              title={interpolate(t('queuedSubmissionCountTitle'), { count: queuedCount })}
              aria-label={interpolate(t('queuedSubmissionCountTitle'), { count: queuedCount })}
            >
              {queuedCount}
            </span>
          )}
        </button>
      )}

      {isEditing && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCancelEdit();
          }}
          className={`${CHAT_INPUT_BUTTON_CLASS} bg-transparent hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-icon-settings)]`}
          aria-label={t('cancelEditAria')}
          title={t('cancelEditTitle')}
        >
          <X size={16} strokeWidth={2} />
        </button>
      )}

      <button
        type={isStop ? 'button' : 'submit'}
        onClick={handlePrimaryClick}
        disabled={!isStop && isDisabled}
        className={`${CHAT_INPUT_BUTTON_CLASS} ${SEND_BUTTON_SIZE_CLASS} !rounded-full ${backgroundClass} text-white disabled:opacity-40 grid place-items-center`}
        style={{ transform: 'translateY(-2px)', transition: 'background-color 100ms ease' }}
        aria-label={label}
        title={title}
      >
        {isStop ? (
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <rect x="3" y="3" width="10" height="10" rx="3" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <path
              d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>
    </div>
  );
};
