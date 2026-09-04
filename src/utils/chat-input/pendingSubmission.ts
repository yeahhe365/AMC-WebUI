import type { UploadedFile } from '@/types';
import { generateUniqueId } from '@/utils/chat/ids';
import { buildChatInputSubmitText } from './chatInputContent';

/** Hard cap on queued messages per session — guards against accidental spam and caps UI height. */
export const MAX_QUEUED_SUBMISSIONS = 20;

export type PendingChatInputSubmission =
  | {
      kind: 'send';
      textToSend: string;
      isFastMode: boolean;
    }
  | {
      kind: 'edit';
      messageId: string;
      content: string;
    };

interface BuildPendingChatInputSubmissionParams {
  inputText: string;
  quotes: string[];
  modelId: string;
  ttsContext?: string;
  isEditing: boolean;
  editMode: 'update' | 'resend';
  editingMessageId: string | null;
  isFastMode: boolean;
}

interface BuildQueuedChatInputSubmissionParams {
  sessionId: string;
  inputText: string;
  quotes: string[];
  modelId: string;
  ttsContext?: string;
  files: UploadedFile[];
  isFastMode: boolean;
}

interface ShouldFlushPendingSubmissionParams {
  pendingSubmission: PendingChatInputSubmission | null;
  previousFiles: UploadedFile[];
  currentFiles: UploadedFile[];
}

export const buildPendingChatInputSubmission = ({
  inputText,
  quotes,
  modelId,
  ttsContext,
  isEditing,
  editMode,
  editingMessageId,
  isFastMode,
}: BuildPendingChatInputSubmissionParams): PendingChatInputSubmission => {
  if (isEditing && editMode === 'update' && editingMessageId) {
    return {
      kind: 'edit',
      messageId: editingMessageId,
      content: inputText,
    };
  }

  return {
    kind: 'send',
    textToSend: buildChatInputSubmitText({
      inputText,
      quotes,
      modelId,
      ttsContext,
    }),
    isFastMode,
  };
};

export interface QueuedChatInputSubmission {
  id: string;
  sessionId: string;
  inputText: string;
  textToSend: string;
  files: UploadedFile[];
  quotes: string[];
  isFastMode: boolean;
  createdAt: number;
}

export const buildQueuedChatInputSubmission = ({
  sessionId,
  inputText,
  quotes,
  modelId,
  ttsContext,
  files,
  isFastMode,
}: BuildQueuedChatInputSubmissionParams): QueuedChatInputSubmission => ({
  id: generateUniqueId(),
  sessionId,
  textToSend: buildChatInputSubmitText({
    inputText,
    quotes,
    modelId,
    ttsContext,
  }),
  files: [...files],
  quotes: [...quotes],
  inputText,
  isFastMode,
  createdAt: Date.now(),
});

export const areFilesStillProcessing = (files: UploadedFile[]) => files.some((file) => file.isProcessing);

export const getBlockingFileUploadFailure = (files: UploadedFile[]): UploadedFile | null =>
  files.find((file) => file.uploadState === 'failed' || file.uploadState === 'cancelled' || !!file.error) ?? null;

export const shouldFlushPendingSubmission = ({
  pendingSubmission,
  previousFiles,
  currentFiles,
}: ShouldFlushPendingSubmissionParams) =>
  !!pendingSubmission && areFilesStillProcessing(previousFiles) && !areFilesStillProcessing(currentFiles);
