import { APP_NOTIFICATION_ICON_URL } from '@/constants/assets';
import type { AppSettings, ChatMessage } from '@/types';
import { playCompletionSound, showNotification, type CompletionSoundVariant } from '@/utils/browserCompletionFeedback';
import { logService } from '@/services/logService';

const DEFAULT_NOTIFICATION_BODY = 'Media or tool response received';
const MAX_NOTIFICATION_BODY_LENGTH = 150;

type CompletionFeedbackSettings = Pick<
  AppSettings,
  'isCompletionNotificationEnabled' | 'isCompletionSoundEnabled' | 'isCompletionSoundBackgroundOnly'
>;

const sanitizeNotificationText = (text: string): string =>
  text
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

export const buildCompletionNotificationBody = (
  message: Pick<ChatMessage, 'content'>,
  fallback = DEFAULT_NOTIFICATION_BODY,
): string => {
  const content = message.content || fallback;
  const sanitized = sanitizeNotificationText(content);
  return sanitized.length > MAX_NOTIFICATION_BODY_LENGTH
    ? `${sanitized.substring(0, MAX_NOTIFICATION_BODY_LENGTH)}...`
    : sanitized;
};

export interface CompletionFeedback {
  sound?: boolean;
  /** Chime character: failures get a lower, duller tone. Defaults to 'success'. */
  variant?: CompletionSoundVariant;
  notification?: { title: string; body: string };
}

export const emitCompletionFeedback = async (
  settings: CompletionFeedbackSettings,
  feedback: CompletionFeedback = {},
) => {
  const isPageHidden = typeof document === 'undefined' ? true : document.hidden;
  const shouldPlaySound =
    feedback.sound !== false &&
    settings.isCompletionSoundEnabled &&
    // "Background only" keeps the chime for when the user is away; a visible
    // page already shows the response arriving in real time.
    !(settings.isCompletionSoundBackgroundOnly && !isPageHidden);

  if (shouldPlaySound) {
    void playCompletionSound(feedback.variant ?? 'success');
  }

  if (
    !feedback.notification ||
    !settings.isCompletionNotificationEnabled ||
    typeof document === 'undefined' ||
    !document.hidden
  ) {
    return;
  }

  try {
    await showNotification(feedback.notification.title, {
      body: feedback.notification.body,
      icon: APP_NOTIFICATION_ICON_URL,
    });
  } catch (error) {
    logService.warn('Failed to show completion notification.', { error });
  }
};
