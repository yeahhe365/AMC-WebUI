import { type MutableRefObject, useCallback, useRef, useEffect } from 'react';
import type { Part } from '@google/genai';
import {
  type SavedChatSession,
  type ChatMessage,
  type UploadedFile,
  type VideoMetadata,
  type AppSettings,
  type ChatSettings as IndividualChatSettings,
  type MediaResolution,
} from '@/types';
import { logService } from '@/services/logService';
import { createNewSession, createMessage } from '@/utils/chat/session';
import { updateFileInMessage, updateMessageInSession, updateSessionById } from '@/utils/chat/sessionMutations';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import {
  createMessageStreamState,
  reduceMessageStreamEvent,
  type MessageStreamState,
} from '@/features/chat-streaming/messageStreamReducer';
import { mergeUniqueFiles } from '@/features/chat-streaming/messageStreamParts';

interface UseMessageUpdatesProps {
  activeSessionId: string | null;
  setActiveSessionId: (id: string) => void;
  appSettings: AppSettings;
  currentChatSettings: IndividualChatSettings;
  updateAndPersistSessions: (
    updater: (prev: SavedChatSession[]) => SavedChatSession[],
    options?: { persist?: boolean },
  ) => void;
  updateMessageInActiveSession?: (
    messageId: string,
    updater: Partial<ChatMessage> | ((message: ChatMessage) => ChatMessage),
    options?: { persist?: boolean },
  ) => void;
  appendMessageToSession?: (sessionId: string, message: ChatMessage, options?: { persist?: boolean }) => void;
  userScrolledUpRef: MutableRefObject<boolean>;
}

interface LiveModelStreamInput {
  apiPart?: Part;
  generatedFiles?: UploadedFile[];
  text: string;
  type: 'content' | 'thought';
}

const hasLiveTranscriptPayload = ({
  apiPart,
  audioUrl,
  generatedFiles,
  text,
}: {
  apiPart?: Part;
  audioUrl?: string | null;
  generatedFiles?: UploadedFile[];
  text: string;
}) => Boolean(text || audioUrl || generatedFiles?.length || apiPart);

const reduceLiveModelStreamInput = (
  streamState: MessageStreamState,
  { apiPart, generatedFiles, text, type }: LiveModelStreamInput,
): MessageStreamState => {
  let nextState = streamState;

  if (apiPart) {
    nextState = reduceMessageStreamEvent(nextState, { type: 'part', part: apiPart });
  } else if (text) {
    nextState =
      type === 'thought'
        ? reduceMessageStreamEvent(nextState, { type: 'thought', text })
        : reduceMessageStreamEvent(nextState, { type: 'part', part: { text } as Part });
  }

  if (generatedFiles?.length) {
    nextState = reduceMessageStreamEvent(nextState, { type: 'files', files: generatedFiles });
  }

  return nextState;
};

const getMessageUpdatesFromStreamState = (
  streamState: MessageStreamState,
  fallbackFirstTokenTimeMs?: number,
): Partial<ChatMessage> => ({
  content: streamState.content,
  thoughts: streamState.thoughts || undefined,
  files: streamState.files.length ? streamState.files : undefined,
  apiParts: streamState.apiParts.length ? streamState.apiParts : undefined,
  firstTokenTimeMs: streamState.firstTokenTimeMs ?? fallbackFirstTokenTimeMs,
  thinkingActive: streamState.thinkingActive ? true : undefined,
});

export const useMessageUpdates = ({
  activeSessionId,
  setActiveSessionId,
  appSettings,
  currentChatSettings,
  updateAndPersistSessions,
  updateMessageInActiveSession,
  appendMessageToSession,
  userScrolledUpRef,
}: UseMessageUpdatesProps) => {
  // Track active message IDs for the live session within the closure of the hook instance
  const liveConversationRefs = useRef<{ userId: string | null; modelId: string | null }>({
    userId: null,
    modelId: null,
  });
  const liveStreamStateRefs = useRef<{ user: MessageStreamState | null; model: MessageStreamState | null }>({
    user: null,
    model: null,
  });

  // Track pending session ID creation to prevent duplicates during async state updates
  const pendingSessionIdRef = useRef<string | null>(null);

  // Reset pending ref when activeSessionId matches (state caught up)
  useEffect(() => {
    if (activeSessionId && activeSessionId === pendingSessionIdRef.current) {
      pendingSessionIdRef.current = null;
    }
  }, [activeSessionId]);

  const handleUpdateMessageContent = useCallback(
    (messageId: string, newContent: string) => {
      if (!activeSessionId) return;
      logService.info('Tampering message content', { messageId });
      const updateActiveMessage =
        updateMessageInActiveSession ??
        ((id: string, updater: Partial<ChatMessage> | ((message: ChatMessage) => ChatMessage)) =>
          updateAndPersistSessions((prev) => updateMessageInSession(prev, activeSessionId, id, updater)));

      updateActiveMessage(messageId, (message) => ({ ...message, content: newContent, apiParts: undefined }));
    },
    [activeSessionId, updateAndPersistSessions, updateMessageInActiveSession],
  );

  const handleUpdateMessageFile = useCallback(
    (
      messageId: string,
      fileId: string,
      updates: { videoMetadata?: VideoMetadata; mediaResolution?: MediaResolution },
    ) => {
      if (!activeSessionId) return;
      if (updateMessageInActiveSession) {
        updateMessageInActiveSession(messageId, (message) =>
          message.files
            ? {
                ...message,
                files: message.files.map((file) => (file.id === fileId ? { ...file, ...updates } : file)),
              }
            : message,
        );
        return;
      }

      updateAndPersistSessions((prev) =>
        updateFileInMessage(prev, activeSessionId, messageId, fileId, updates as Partial<UploadedFile>),
      );
    },
    [activeSessionId, updateAndPersistSessions, updateMessageInActiveSession],
  );

  const handleAddUserMessage = useCallback(
    (text: string, files: UploadedFile[] = []) => {
      let currentSessionId = activeSessionId || pendingSessionIdRef.current;

      if (!currentSessionId) {
        const newSession = createNewSession({ ...DEFAULT_CHAT_SETTINGS, ...appSettings, ...currentChatSettings });
        currentSessionId = newSession.id;
        pendingSessionIdRef.current = currentSessionId;
        setActiveSessionId(currentSessionId);

        updateAndPersistSessions((prev) => [newSession, ...prev]);
      }

      const newMessage = createMessage('user', text, { files });

      if (appendMessageToSession) {
        appendMessageToSession(currentSessionId, newMessage);
      } else {
        updateAndPersistSessions((prev) =>
          updateSessionById(prev, currentSessionId, (session) => ({
            ...session,
            messages: [...session.messages, newMessage],
            timestamp: Date.now(),
          })),
        );
      }
      userScrolledUpRef.current = false;
    },
    [
      activeSessionId,
      updateAndPersistSessions,
      userScrolledUpRef,
      appSettings,
      currentChatSettings,
      setActiveSessionId,
      appendMessageToSession,
    ],
  );

  const handleLiveTranscript = useCallback(
    (
      text: string,
      role: 'user' | 'model',
      isFinal: boolean,
      type: 'content' | 'thought' = 'content',
      audioUrl?: string | null,
      generatedFiles?: UploadedFile[],
      apiPart?: Part,
    ) => {
      let currentSessionId = activeSessionId || pendingSessionIdRef.current;
      const hasPayload = hasLiveTranscriptPayload({ apiPart, audioUrl, generatedFiles, text });

      if (!currentSessionId && hasPayload) {
        const newSession = createNewSession(
          { ...DEFAULT_CHAT_SETTINGS, ...appSettings, ...currentChatSettings },
          [],
          'Live Session',
        );
        currentSessionId = newSession.id;
        pendingSessionIdRef.current = currentSessionId;
        setActiveSessionId(currentSessionId);

        updateAndPersistSessions((prev) => [newSession, ...prev]);
      }

      if (!currentSessionId) return;

      updateAndPersistSessions(
        (prev) =>
          updateSessionById(prev, currentSessionId, (session) => {
            const currentId =
              role === 'user' ? liveConversationRefs.current.userId : liveConversationRefs.current.modelId;
            const messages = [...session.messages];

            let messageIndex = currentId ? messages.findIndex((message) => message.id === currentId) : -1;

            if (hasPayload) {
              if (messageIndex === -1) {
                const generationStartTime = new Date();
                const newMessage = createMessage(role === 'user' ? 'user' : 'model', '', {
                  isLoading: true,
                  generationStartTime,
                  audioSrc: audioUrl || undefined,
                  audioAutoplay: audioUrl ? false : undefined,
                });

                if (role === 'model') {
                  let streamState = createMessageStreamState({
                    generationId: newMessage.id,
                    generationStartTime,
                  });
                  streamState = reduceLiveModelStreamInput(streamState, { apiPart, generatedFiles, text, type });
                  liveStreamStateRefs.current.model = streamState;
                  Object.assign(newMessage, getMessageUpdatesFromStreamState(streamState));
                } else {
                  newMessage.content = type === 'content' ? text : '';
                  newMessage.thoughts = type === 'thought' ? text : undefined;
                  newMessage.files = generatedFiles?.length ? generatedFiles : undefined;
                }

                messages.push(newMessage);

                if (role === 'user') liveConversationRefs.current.userId = newMessage.id;
                else liveConversationRefs.current.modelId = newMessage.id;

                messageIndex = messages.length - 1;
              } else {
                const existingMessage = messages[messageIndex];
                const updates: Partial<ChatMessage> = {};

                if (role === 'model' && (apiPart || text || generatedFiles?.length)) {
                  let streamState =
                    liveStreamStateRefs.current.model ??
                    createMessageStreamState({
                      generationId: existingMessage.id,
                      generationStartTime: existingMessage.generationStartTime || existingMessage.timestamp,
                    });

                  if (!liveStreamStateRefs.current.model) {
                    streamState = {
                      ...streamState,
                      content: existingMessage.content || '',
                      thoughts: existingMessage.thoughts || '',
                      apiParts: existingMessage.apiParts || [],
                      files: existingMessage.files || [],
                      firstTokenTimeMs: existingMessage.firstTokenTimeMs,
                    };
                  }

                  streamState = reduceLiveModelStreamInput(streamState, { apiPart, generatedFiles, text, type });

                  liveStreamStateRefs.current.model = streamState;
                  Object.assign(
                    updates,
                    getMessageUpdatesFromStreamState(streamState, existingMessage.firstTokenTimeMs),
                  );

                  // Commit the thinking duration once the model switches to
                  // visible output (last content part), and clear it again if
                  // it re-enters thinking so the live timer resumes.
                  if (streamState.thoughts && existingMessage.generationStartTime) {
                    const startMs = (existingMessage.generationStartTime || existingMessage.timestamp).getTime();
                    if (streamState.lastContentPartTime && !streamState.thinkingActive) {
                      updates.thinkingTimeMs = streamState.lastContentPartTime.getTime() - startMs;
                    } else if (streamState.thinkingActive) {
                      updates.thinkingTimeMs = undefined;
                    }
                  }
                } else if (text) {
                  if (type === 'thought') {
                    updates.thoughts = (existingMessage.thoughts || '') + text;
                  } else {
                    // If we are switching to content from thoughts, and thinkingTimeMs isn't set yet
                    // This effectively "stops" the thinking timer
                    if (
                      existingMessage.thoughts &&
                      !existingMessage.thinkingTimeMs &&
                      existingMessage.generationStartTime
                    ) {
                      updates.thinkingTimeMs = new Date().getTime() - existingMessage.generationStartTime.getTime();
                    }
                    updates.content = existingMessage.content + text;
                  }
                }

                if (audioUrl) {
                  updates.audioSrc = audioUrl;
                  updates.audioAutoplay = false; // Disable autoplay for Live API generated audio
                }
                if (generatedFiles?.length) {
                  updates.files = mergeUniqueFiles(updates.files || existingMessage.files, generatedFiles);
                }

                messages[messageIndex] = { ...existingMessage, ...updates };
              }
            }

            // If the turn is complete (isFinal=true), mark the message as not loading and clear the ref
            if (isFinal) {
              if (messageIndex !== -1) {
                const updatedMessage = messages[messageIndex];

                // Finalize thinking time if not already set (e.g. if the message was ONLY thoughts)
                let finalThinkingTime = updatedMessage.thinkingTimeMs;
                if (updatedMessage.thoughts && !finalThinkingTime && updatedMessage.generationStartTime) {
                  const streamState = liveStreamStateRefs.current.model;
                  const startMs = updatedMessage.generationStartTime.getTime();
                  finalThinkingTime =
                    streamState?.lastThoughtChunkTimeMs !== undefined
                      ? streamState.lastThoughtChunkTimeMs
                      : new Date().getTime() - startMs;
                }

                messages[messageIndex] = {
                  ...updatedMessage,
                  isLoading: false,
                  generationEndTime: new Date(),
                  thinkingTimeMs: finalThinkingTime,
                  thinkingActive: undefined,
                };
              }
              // Reset tracking ref for this role so next transcript starts a new message bubble
              if (role === 'user') liveConversationRefs.current.userId = null;
              else {
                liveConversationRefs.current.modelId = null;
                liveStreamStateRefs.current.model = null;
              }
            }

            return {
              ...session,
              messages,
              timestamp: Date.now(),
            };
          }),
        { persist: isFinal },
      );
    },
    [activeSessionId, updateAndPersistSessions, appSettings, currentChatSettings, setActiveSessionId],
  );

  return {
    handleUpdateMessageContent,
    handleUpdateMessageFile,
    handleAddUserMessage,
    handleLiveTranscript,
  };
};
