import type {
  AppSettings,
  ChatMessage,
  ChatSettings as IndividualChatSettings,
  SavedChatSession,
  UploadedFile,
} from '@/types';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { generateUniqueId } from '@/utils/chat/ids';
import { createMessage, generateSessionTitle, performOptimisticSessionUpdate } from '@/utils/chat/session';
import { insertMessageAfter, updateMessageInSession } from '@/utils/chat/sessionMutations';
import { emitCompletionFeedback, type CompletionFeedback } from './completionFeedback';
import { createLoadingModelMessage } from './useMessageLifecycle';
import type { SessionsUpdater } from './messageSenderTypes';

interface StartOptimisticMessageTurnParams {
  activeSessionId: string | null;
  appSettings: AppSettings;
  currentChatSettings: IndividualChatSettings;
  updateAndPersistSessions: SessionsUpdater;
  setActiveSessionId: (id: string | null) => void;
  text: string;
  files?: UploadedFile[];
  generationId: string;
  generationStartTime?: Date;
  editingMessageId?: string | null;
  shouldGenerateTitle?: boolean | ((session: SavedChatSession | undefined) => boolean);
  shouldLockKey?: boolean;
  keyToLock?: string;
  createSessionId?: () => string;
  placement?: OptimisticMessagePlacement;
  userMessageOptions?: Partial<Omit<ChatMessage, 'id' | 'role' | 'content' | 'timestamp'>>;
  modelMessageOptions?: {
    content?: string;
    excludeFromContext?: boolean;
  };
}

interface StartedOptimisticMessageTurn {
  finalSessionId: string;
  modelMessageId: string;
  userMessage?: ChatMessage;
  modelMessage?: ChatMessage;
  generationStartTime: Date;
}

interface CompleteModelMessageParams {
  sessionId: string;
  messageId: string;
  patch: Partial<ChatMessage> | ((message: ChatMessage) => ChatMessage);
}

export type MessageLifecycleRunner = <T>(params: {
  sessionId: string;
  generationId: string;
  abortController: AbortController;
  modelMessageId?: string;
  errorPrefix?: string;
  execute: () => Promise<T>;
  onError?: (error: unknown) => void;
}) => Promise<T | undefined>;

interface OptimisticPipelineResult {
  patch?: CompleteModelMessageParams['patch'];
  feedback?: CompletionFeedback;
}

interface RunOptimisticMessagePipelineParams extends Omit<StartOptimisticMessageTurnParams, 'generationStartTime'> {
  generationStartTime?: Date;
  abortController: AbortController;
  errorPrefix: string;
  runMessageLifecycle: MessageLifecycleRunner;
  execute: (turn: StartedOptimisticMessageTurn) => Promise<OptimisticPipelineResult | void>;
  afterStart?: (turn: StartedOptimisticMessageTurn) => void;
}

type OptimisticMessagePlacement =
  | { type: 'append-turn' }
  | { type: 'continue-model'; targetMessageId: string }
  | { type: 'insert-model-after'; sourceMessageId: string };

const completeModelMessage = (
  sessions: SavedChatSession[],
  { sessionId, messageId, patch }: CompleteModelMessageParams,
) => updateMessageInSession(sessions, sessionId, messageId, patch);

const startOptimisticMessageTurn = ({
  activeSessionId,
  appSettings,
  currentChatSettings,
  updateAndPersistSessions,
  setActiveSessionId,
  text,
  files,
  generationId,
  generationStartTime = new Date(),
  editingMessageId = null,
  shouldGenerateTitle = !activeSessionId,
  shouldLockKey,
  keyToLock,
  createSessionId = generateUniqueId,
  placement = { type: 'append-turn' },
  userMessageOptions,
  modelMessageOptions,
}: StartOptimisticMessageTurnParams): StartedOptimisticMessageTurn => {
  const finalSessionId = activeSessionId || createSessionId();
  const modelMessageId = placement.type === 'continue-model' ? placement.targetMessageId : generationId;
  const userMessage =
    placement.type === 'append-turn'
      ? createMessage('user', text, {
          ...(files ? { files } : {}),
          ...userMessageOptions,
        })
      : undefined;
  const modelMessage = createLoadingModelMessage({
    id: modelMessageId,
    content: modelMessageOptions?.content,
    generationStartTime,
    excludeFromContext: modelMessageOptions?.excludeFromContext,
  });

  updateAndPersistSessions((prev) => {
    if (placement.type === 'continue-model') {
      return updateMessageInSession(prev, finalSessionId, placement.targetMessageId, (message) => ({
        ...message,
        isLoading: true,
        generationEndTime: undefined,
        stoppedByUser: false,
        // Reset the whole timing window to this run. generationStartTime must
        // match the new request's start so finalizeMessages (which matches by
        // it) finalizes this message; stale firstTokenTimeMs/thinkingTimeMs
        // would otherwise leak old-run durations into the new timings.
        generationStartTime,
        firstTokenTimeMs: undefined,
        thinkingTimeMs: undefined,
      }));
    }

    if (placement.type === 'insert-model-after') {
      return insertMessageAfter(prev, finalSessionId, placement.sourceMessageId, modelMessage);
    }

    const existingSession = prev.find((session) => session.id === activeSessionId);
    const shouldSetTitle =
      typeof shouldGenerateTitle === 'function' ? shouldGenerateTitle(existingSession) : shouldGenerateTitle;
    const title = shouldSetTitle && userMessage ? generateSessionTitle([userMessage, modelMessage]) : undefined;
    if (!userMessage) return prev;

    return performOptimisticSessionUpdate(prev, {
      activeSessionId,
      newSessionId: finalSessionId,
      newMessages: [userMessage, modelMessage],
      settings: { ...DEFAULT_CHAT_SETTINGS, ...appSettings, ...currentChatSettings },
      editingMessageId,
      title,
      shouldLockKey,
      keyToLock,
    });
  });

  if (placement.type === 'append-turn' && !activeSessionId) {
    setActiveSessionId(finalSessionId);
  }

  return {
    finalSessionId,
    modelMessageId,
    userMessage,
    modelMessage,
    generationStartTime,
  };
};

export const runOptimisticMessagePipeline = async ({
  abortController,
  errorPrefix,
  runMessageLifecycle,
  execute,
  afterStart,
  ...turnParams
}: RunOptimisticMessagePipelineParams) => {
  const turn = startOptimisticMessageTurn(turnParams);
  afterStart?.(turn);

  await runMessageLifecycle({
    sessionId: turn.finalSessionId,
    generationId: turnParams.generationId,
    abortController,
    modelMessageId: turn.modelMessageId,
    errorPrefix,
    execute: async () => {
      const result = await execute(turn);
      const patch = result?.patch;

      if (patch) {
        turnParams.updateAndPersistSessions((prev) =>
          completeModelMessage(prev, {
            sessionId: turn.finalSessionId,
            messageId: turn.modelMessageId,
            patch,
          }),
        );
      }

      if (result) {
        await emitCompletionFeedback(turnParams.appSettings, result.feedback);
      }
      return result;
    },
  });

  return turn;
};
