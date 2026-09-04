import { type AppSettings, type ChatMessage, type SavedChatSession } from '@/types';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { generateTitleApi } from '@/services/api/generation/textApi';
import { generateSessionTitle } from '@/utils/chat/session';
import { getVisibleChatMessages } from '@/utils/chat/visibility';
import { dbService } from '@/services/db/dbService';
import { logService } from '@/services/logService';

type AutoTitleSessionsUpdater = (
  updater: (prev: SavedChatSession[]) => SavedChatSession[],
  options?: { persist?: boolean },
) => void | Promise<void>;

const TITLE_SOURCE_MAX_CHARS = 2000;
const clampForTitle = (text: string) =>
  text.length > TITLE_SOURCE_MAX_CHARS ? `${text.slice(0, TITLE_SOURCE_MAX_CHARS)}…` : text;

interface AutoTitleExchange {
  userContent: string;
  modelContent: string;
  /** The model turn is still streaming (content is mid-flight). */
  isIncomplete: boolean;
}

/**
 * Find the first user→model exchange whose model reply is complete enough to
 * title. A *finished* reply is always usable; a still-streaming reply is usable
 * once it has grown past TITLE_SOURCE_MAX_CHARS, because the title API only
 * reads the first 2000 chars anyway — content beyond that cannot change the
 * title. This lets auto-titling start early on long replies instead of waiting
 * for the whole generation to finish.
 */
const findFirstCompletedExchange = (session: SavedChatSession): AutoTitleExchange | null => {
  const messages = getVisibleChatMessages(session.messages);

  for (let index = 0; index < messages.length - 1; index += 1) {
    const userMessage = messages[index];
    const modelMessage = messages[index + 1];

    if (userMessage.role !== 'user' || modelMessage.role !== 'model') {
      continue;
    }
    if (modelMessage.stoppedByUser) {
      continue;
    }
    if (modelMessage.isLoading && modelMessage.content.length < TITLE_SOURCE_MAX_CHARS) {
      continue;
    }

    return {
      userContent: userMessage.content,
      modelContent: modelMessage.content,
      isIncomplete: Boolean(modelMessage.isLoading),
    };
  }

  return null;
};

/**
 * The pre-refactor heuristic (no char-based truncation for spaceless text),
 * kept only to infer the title origin of legacy (titleSource-less) sessions.
 */
const generateLegacySessionTitle = (messages: ChatMessage[]): string => {
  const firstUserMessage = getVisibleChatMessages(messages).find(
    (message) => message.role === 'user' && message.content.trim() !== '',
  );
  if (firstUserMessage) {
    const words = firstUserMessage.content.split(/\s+/);
    return words.slice(0, 7).join(' ') + (words.length > 7 ? '...' : '');
  }
  const firstModelMessage = getVisibleChatMessages(messages).find(
    (message) => message.role === 'model' && message.content.trim() !== '',
  );
  if (firstModelMessage) {
    const words = firstModelMessage.content.split(/\s+/);
    return 'Model: ' + words.slice(0, 5).join(' ') + (words.length > 5 ? '...' : '');
  }
  return 'New Chat';
};

/**
 * True when the title must not be overwritten by auto-titling.
 * Explicit 'auto'/'manual' origins are always protected; legacy (titleSource-less)
 * sessions fall back to heuristic inference so a long pre-fix CJK title is not
 * mistaken for a manual rename.
 */
export const hasNonOverridableTitle = (session: SavedChatSession): boolean => {
  if (session.titleSource === 'auto' || session.titleSource === 'manual') {
    return true;
  }

  if (session.titleSource === undefined) {
    return (
      session.title !== 'New Chat' &&
      session.title !== generateSessionTitle(session.messages) &&
      session.title !== generateLegacySessionTitle(session.messages)
    );
  }

  return false;
};

export const isSessionAutoTitleEligible = (session: SavedChatSession): boolean =>
  !hasNonOverridableTitle(session) && findFirstCompletedExchange(session) !== null;

interface AutoTitleSessionOptions {
  session: SavedChatSession;
  appSettings: AppSettings;
  language: SupportedLanguage;
  stickyKey?: string;
  updateAndPersistSessions: AutoTitleSessionsUpdater;
}

export const autoTitleSession = async ({
  session,
  appSettings,
  language,
  stickyKey,
  updateAndPersistSessions,
}: AutoTitleSessionOptions): Promise<boolean> => {
  const sessionId = session.id;
  const exchange = findFirstCompletedExchange(session);

  if (!exchange) {
    return false;
  }

  if (!exchange.userContent.trim() && !exchange.modelContent.trim()) {
    logService.info(`Skipping title generation for session ${sessionId} due to empty content.`);
    return false;
  }

  let keyToUse: string;
  if (stickyKey) {
    keyToUse = stickyKey;
  } else {
    const keyResult = getGeminiKeyForRequest(appSettings, session.settings, { skipIncrement: true });
    if ('error' in keyResult) {
      // Expected in pure third-party mode — do not spam the error log.
      logService.debug(`Skipping title generation for session ${sessionId}: ${keyResult.error}`);
      return false;
    }
    keyToUse = keyResult.key;
  }

  // Cross-tab dedup: reload from DB, skip if another tab already titled it.
  // A lightweight read is enough — only title/titleSource matter here, and
  // getSessionMetadataOnly skips the FILES_STORE blob hydration that makes
  // getSession expensive for attachment-heavy sessions.
  const freshSession = await dbService.getSessionMetadataOnly(sessionId);
  if (!freshSession) {
    logService.info(`Session ${sessionId} no longer exists; skipping title generation.`);
    return false;
  }

  if (hasNonOverridableTitle(freshSession)) {
    logService.info(`Session ${sessionId} already has a custom title; skipping title generation.`);
    return false;
  }

  const freshTitle = freshSession.title;
  logService.info(`Auto-generating title for session ${sessionId}`);

  let newTitle = '';
  try {
    newTitle = (
      await generateTitleApi(
        keyToUse,
        clampForTitle(exchange.userContent),
        clampForTitle(exchange.modelContent),
        language,
      )
    ).trim();
  } catch (error) {
    // Title API failures (network, quota, 429) are routine during backfill
    // bursts — keep the console quiet and let the heuristic fallback below run.
    logService.debug(`Skipping AI title for session ${sessionId} (will use heuristic)`, { error });
  }

  if (newTitle) {
    // Write-back re-check: avoid clobbering a title another tab / the user just
    // wrote while the API call was in flight. Only title/titleSource are read
    // here, so the lightweight read suffices.
    const latest = await dbService.getSessionMetadataOnly(sessionId);
    if (!latest) return false;
    if (latest.titleSource === 'manual' || latest.titleSource === 'auto') return false;
    if (latest.title !== freshTitle) return false;

    logService.info(`Generated new title for session ${sessionId}: "${newTitle}"`);
    updateAndPersistSessions((prev) =>
      prev.map((candidate) =>
        candidate.id === sessionId ? { ...candidate, title: newTitle, titleSource: 'auto' } : candidate,
      ),
    );
    return true;
  }

  // Unified failure fallback (API error or empty response): write the heuristic
  // title but keep 'default', so a later retry can still produce an AI title.
  // Skipped for an in-flight exchange: the model is still streaming, so the
  // heuristic would be based on partial content and would clobber a title the
  // user has not even finished reading. The next finished exchange retries.
  if (!exchange.isIncomplete) {
    const localTitle = generateSessionTitle(freshSession.messages);
    if (localTitle && localTitle !== 'New Chat' && localTitle !== freshTitle) {
      updateAndPersistSessions((prev) =>
        prev.map((candidate) =>
          candidate.id === sessionId ? { ...candidate, title: localTitle, titleSource: 'default' } : candidate,
        ),
      );
      return true;
    }
  }

  return false;
};
