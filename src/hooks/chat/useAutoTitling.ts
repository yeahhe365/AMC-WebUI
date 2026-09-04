import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useEffect, useRef } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { type AppSettings, type SavedChatSession } from '@/types';
import { autoTitleSession, isSessionAutoTitleEligible } from '@/features/auto-titling/autoTitleSession';
import { getVisibleChatMessages } from '@/utils/chat/visibility';
import { isThirdPartyApiRoute } from '@/utils/chatApiRoute';

type SessionsUpdater = (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void;

interface AutoTitlingProps {
  appSettings: AppSettings;
  activeChat?: SavedChatSession;
  updateAndPersistSessions: SessionsUpdater;
  language: SupportedLanguage;
  generatingTitleSessionIds: Set<string>;
  setGeneratingTitleSessionIds: Dispatch<SetStateAction<Set<string>>>;
  sessionKeyMapRef?: MutableRefObject<Map<string, string>>;
}

const hashAttemptValue = (value: string | null | undefined): string => {
  const text = value ?? '';
  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `${text.length}:${(hash >>> 0).toString(36)}`;
};

const buildAutoTitleAttemptKey = (
  session: SavedChatSession,
  appSettings: AppSettings,
  language: SupportedLanguage,
): string => {
  const messages = getVisibleChatMessages(session.messages);
  const firstMessage = messages[0];
  const secondMessage = messages[1];
  // When the first model reply is still streaming, its content keeps growing
  // every frame. Including that in the attempt key would make the key change
  // per chunk, re-firing auto-titling for the same in-flight reply. Exclude it
  // so an early (content≥2000) attempt is recorded exactly once; once the
  // stream finishes, isLoading flips and a fresh key retries with full content.
  const secondMessageContentKey = secondMessage?.isLoading ? 'streaming' : hashAttemptValue(secondMessage?.content);
  const messageKey = (message: (typeof messages)[number] | undefined) =>
    message
      ? [
          message.id,
          message.role,
          message.isLoading ? 'loading' : 'idle',
          message.stoppedByUser ? 'stopped' : 'active',
          message === secondMessage ? secondMessageContentKey : hashAttemptValue(message.content),
        ].join(':')
      : 'none';

  return [
    session.id,
    hashAttemptValue(session.title),
    messageKey(firstMessage),
    messageKey(secondMessage),
    hashAttemptValue(session.settings.lockedApiKey),
    language,
    session.settings.providerId ?? 'gemini-native',
    appSettings.useCustomApiConfig ? 'custom-api' : 'env-api',
    appSettings.serverManagedApi ? 'server-managed' : 'browser-managed',
    appSettings.useApiProxy ? 'proxy' : 'direct',
    hashAttemptValue(appSettings.apiKey),
    hashAttemptValue(appSettings.apiProxyUrl),
  ].join('|');
};

export const useAutoTitling = ({
  appSettings,
  activeChat,
  updateAndPersistSessions,
  language,
  generatingTitleSessionIds,
  setGeneratingTitleSessionIds,
  sessionKeyMapRef,
}: AutoTitlingProps) => {
  const attemptedTitleKeysRef = useRef<Set<string>>(new Set());

  const generateTitleForSession = useCallback(
    async (session: SavedChatSession) => {
      setGeneratingTitleSessionIds((prev) => new Set(prev).add(session.id));
      try {
        await autoTitleSession({
          session,
          appSettings,
          language,
          stickyKey: isThirdPartyApiRoute(appSettings, session.settings)
            ? undefined
            : sessionKeyMapRef?.current?.get(session.id),
          updateAndPersistSessions,
        });
      } finally {
        setGeneratingTitleSessionIds((prev) => {
          const next = new Set(prev);
          next.delete(session.id);
          return next;
        });
      }
    },
    [appSettings, language, setGeneratingTitleSessionIds, sessionKeyMapRef, updateAndPersistSessions],
  );

  useEffect(() => {
    if (!appSettings.isAutoTitleEnabled || !activeChat) return;
    if (!isSessionAutoTitleEligible(activeChat)) return;
    if (generatingTitleSessionIds.has(activeChat.id)) return;

    const attemptKey = buildAutoTitleAttemptKey(activeChat, appSettings, language);
    if (attemptedTitleKeysRef.current.has(attemptKey)) return;
    attemptedTitleKeysRef.current.add(attemptKey);

    generateTitleForSession(activeChat);
  }, [activeChat, appSettings, generatingTitleSessionIds, generateTitleForSession, language]);
};
