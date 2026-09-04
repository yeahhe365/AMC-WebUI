import React, { useEffect, useRef, useState } from 'react';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { User, AlertTriangle, Edit3, Trash2, RefreshCw, Pencil, CirclePlay, MoreHorizontal } from 'lucide-react';
import { type ChatMessage } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { ExportMessageButton } from './buttons/ExportMessageButton';
import { MessageCopyButton } from './buttons/MessageCopyButton';
import { useIsMobile, useResponsiveValue } from '@/hooks/useDevice';
import { useWindowContext } from '@/contexts/WindowContext';
import { IconBranch } from '@/components/icons';

const AvatarWrapper: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  showEditOverlay: boolean;
  label: string;
}> = ({ children, onClick, showEditOverlay, label }) => (
  <button
    type="button"
    className={`relative group/avatar cursor-pointer rounded-full bg-transparent p-0 border-0 ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
    onClick={onClick}
    aria-label={label}
    title={label}
  >
    {children}
    {showEditOverlay && (
      <div className="absolute inset-0 bg-black/60 dark:bg-black/50 rounded-full hidden group-hover/avatar:flex items-center justify-center backdrop-blur-[1px] transition-all animate-in fade-in duration-200">
        <Pencil size={12} className="text-white" strokeWidth={2.5} />
      </div>
    )}
  </button>
);

const UserIcon: React.FC = () => {
  const size = useResponsiveValue(24, 29);
  return <User size={size} className="text-[var(--theme-icon-user)] flex-shrink-0" strokeWidth={2} />;
};

const BotIcon: React.FC<{ alt: string }> = ({ alt }) => {
  const size = useResponsiveValue(24, 29);
  return (
    <img
      src="/assets/assistant-avatar.png"
      alt={alt}
      width={size}
      height={size}
      className="flex-shrink-0 object-contain"
    />
  );
};

const ErrorMsgIcon: React.FC = () => {
  const size = useResponsiveValue(24, 29);
  return <AlertTriangle size={size} className="text-[var(--theme-icon-error)] flex-shrink-0" strokeWidth={2} />;
};

interface MessageActionsProps {
  message: ChatMessage;
  sessionTitle: string;
  messageIndex: number;
  isGrouped: boolean;
  onEditMessage: (messageId: string, mode: 'update' | 'resend') => void;
  onDeleteMessage: (messageId: string) => void;
  onRetryMessage: (messageId: string) => void;
  onContinueGeneration: (messageId: string) => void;
  onForkMessage: (messageId: string) => void;
  themeId: string;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  message,
  sessionTitle,
  messageIndex,
  isGrouped,
  onEditMessage,
  onDeleteMessage,
  onRetryMessage,
  onContinueGeneration,
  onForkMessage,
  themeId,
}) => {
  const { t } = useI18n();
  const { document: targetDocument } = useWindowContext();
  const isMobile = useIsMobile();
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const actionIconSize = useResponsiveValue(15, 16);
  const showRetryButton = message.role === 'model' || (message.role === 'error' && message.generationStartTime);
  const showContinueGenerationAction = message.role === 'model' && !message.isLoading;
  const showForkAction = message.role === 'model' && !message.isLoading;
  const showOverflowActions = showContinueGenerationAction || showForkAction;

  // Enhanced button styling: lighter default, distinct hover, rounded corners
  const actionButtonClasses =
    'p-1.5 rounded-lg text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] opacity-80 hover:opacity-100';
  const menuItemClasses =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-xs whitespace-nowrap text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] focus-visible:text-[var(--theme-text-primary)]';
  const actionsVisibilityClasses = isMobile
    ? 'opacity-100 translate-y-0 pointer-events-auto'
    : 'opacity-0 translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto';

  useEffect(() => {
    if (!isOverflowOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!overflowRef.current?.contains(event.target as Node)) {
        setIsOverflowOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOverflowOpen(false);
      }
    };

    targetDocument.addEventListener('pointerdown', handlePointerDown);
    targetDocument.addEventListener('keydown', handleKeyDown);

    return () => {
      targetDocument.removeEventListener('pointerdown', handlePointerDown);
      targetDocument.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOverflowOpen, targetDocument]);

  return (
    <div className="flex-shrink-0 w-8 sm:w-10 flex flex-col items-center sticky top-2 sm:top-4 self-start z-10 h-full">
      <div className="h-7 sm:h-8 flex items-center justify-center">
        {!isGrouped && (
          <>
            {message.role === 'user' && (
              <AvatarWrapper
                onClick={() => onEditMessage(message.id, 'update')}
                showEditOverlay={true}
                label={t('edit')}
              >
                <UserIcon />
              </AvatarWrapper>
            )}
            {message.role === 'model' && (
              <AvatarWrapper
                onClick={() => onEditMessage(message.id, 'update')}
                showEditOverlay={true}
                label={t('edit')}
              >
                <BotIcon alt={t('assistantAvatarAlt')} />
              </AvatarWrapper>
            )}
            {message.role === 'error' && <ErrorMsgIcon />}
          </>
        )}
      </div>

      <div
        className={`message-actions flex flex-col items-center gap-1 mt-1 transition-all duration-300 ease-in-out ${actionsVisibilityClasses}`}
      >
        {message.role === 'user' && !message.isLoading && (
          <button
            onClick={() => onEditMessage(message.id, 'resend')}
            title={t('edit')}
            aria-label={t('edit')}
            className={actionButtonClasses}
          >
            <Edit3 size={actionIconSize} strokeWidth={2} />
          </button>
        )}

        {showRetryButton && (
          <button
            onClick={() => onRetryMessage(message.id)}
            title={message.isLoading ? t('retryAndStopButtonTitle') : t('retryButtonTitle')}
            aria-label={message.isLoading ? t('retryAndStopButtonTitle') : t('retryButtonTitle')}
            className={actionButtonClasses}
          >
            <RefreshCw size={actionIconSize} strokeWidth={2} />
          </button>
        )}

        {showOverflowActions && (
          <div ref={overflowRef} className="relative">
            <button
              type="button"
              onClick={() => setIsOverflowOpen((value) => !value)}
              title={t('messageMoreActions')}
              aria-label={t('messageMoreActions')}
              aria-haspopup="menu"
              aria-expanded={isOverflowOpen}
              className={actionButtonClasses}
            >
              <MoreHorizontal size={actionIconSize} strokeWidth={2} />
            </button>

            {isOverflowOpen && (
              <div
                role="menu"
                className="absolute left-full top-0 z-40 ml-1 min-w-40 overflow-hidden rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] py-1 shadow-lg"
              >
                {showContinueGenerationAction && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsOverflowOpen(false);
                      onContinueGeneration(message.id);
                    }}
                    title={t('continueGenerationTitle')}
                    aria-label={t('continueGenerationTitle')}
                    className={menuItemClasses}
                  >
                    <CirclePlay size={14} strokeWidth={2} />
                    <span>{t('continueGenerationTitle')}</span>
                  </button>
                )}

                {showForkAction && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsOverflowOpen(false);
                      onForkMessage(message.id);
                    }}
                    title={t('forkMessageTitle')}
                    aria-label={t('forkMessageTitle')}
                    className={menuItemClasses}
                  >
                    <IconBranch size={14} />
                    <span>{t('forkMessageTitle')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {(message.content || message.thoughts) && !message.isLoading && (
          <MessageCopyButton textToCopy={message.content} className={actionButtonClasses} iconSize={actionIconSize} />
        )}

        {message.content && !message.isLoading && message.role === 'model' && !message.audioSrc && (
          <>
            <ExportMessageButton
              message={message}
              sessionTitle={sessionTitle}
              messageIndex={messageIndex}
              themeId={themeId}
              className={actionButtonClasses}
              iconSize={actionIconSize}
            />
          </>
        )}

        {!message.isLoading && (
          <button
            onClick={() => onDeleteMessage(message.id)}
            title={t('delete')}
            aria-label={t('delete')}
            className={`${actionButtonClasses} hover:text-[var(--theme-text-danger)] hover:bg-[var(--theme-bg-danger)]/10`}
          >
            <Trash2 size={actionIconSize} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
};
