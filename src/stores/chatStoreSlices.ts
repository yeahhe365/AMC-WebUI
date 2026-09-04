import { type InputCommand, type UploadedFile, type ImageOutputMode } from '@/types';
import { resolveUpdaterOrValue, type UpdaterOrValue } from './stateUpdaters';

type SliceSet<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export interface ChatUiSliceState {
  editingMessageId: string | null;
  editMode: 'update' | 'resend';
  commandedInput: InputCommand | null;
  loadingSessionIds: Set<string>;
  generatingTitleSessionIds: Set<string>;
  selectedFiles: UploadedFile[];
  appFileError: string | null;
  isAppProcessingFile: boolean;
  aspectRatio: string;
  imageSize: string;
  imageOutputMode: ImageOutputMode;
  isSwitchingModel: boolean;
  /** 会话已完成生成的状态标记(仅内存,不持久化)。key=sessionId, value 为结果。 */
  completedSessions: Record<string, 'success' | 'error'>;
}

export interface ChatUiSliceActions {
  setEditingMessageId: (id: UpdaterOrValue<string | null>) => void;
  setEditMode: (mode: UpdaterOrValue<'update' | 'resend'>) => void;
  setCommandedInput: (cmd: UpdaterOrValue<InputCommand | null>) => void;
  setLoadingSessionIds: (v: UpdaterOrValue<Set<string>>) => void;
  setGeneratingTitleSessionIds: (v: UpdaterOrValue<Set<string>>) => void;
  setSelectedFiles: (v: UpdaterOrValue<UploadedFile[]>) => void;
  setAppFileError: (v: UpdaterOrValue<string | null>) => void;
  setIsAppProcessingFile: (v: UpdaterOrValue<boolean>) => void;
  setAspectRatio: (v: UpdaterOrValue<string>) => void;
  setImageSize: (v: UpdaterOrValue<string>) => void;
  setImageOutputMode: (v: UpdaterOrValue<ImageOutputMode>) => void;
  setIsSwitchingModel: (v: UpdaterOrValue<boolean>) => void;
  setCompletedSessions: (v: UpdaterOrValue<Record<string, 'success' | 'error'>>) => void;
}

type ChatUiSlice = ChatUiSliceState & ChatUiSliceActions;

const setSliceValue = <T extends ChatUiSlice, K extends keyof ChatUiSliceState>(
  set: SliceSet<T>,
  key: K,
  value: UpdaterOrValue<ChatUiSliceState[K]>,
) => {
  set((state) => {
    const nextState = {
      [key]: resolveUpdaterOrValue(value, state[key]),
    } as Pick<ChatUiSliceState, K>;

    return nextState as Partial<T>;
  });
};

export const createChatUiSlice = <T extends ChatUiSlice>(set: SliceSet<T>): ChatUiSlice => ({
  editingMessageId: null,
  editMode: 'resend',
  commandedInput: null,
  loadingSessionIds: new Set<string>(),
  generatingTitleSessionIds: new Set<string>(),
  selectedFiles: [],
  appFileError: null,
  isAppProcessingFile: false,
  aspectRatio: '1:1',
  imageSize: '1K',
  imageOutputMode: 'IMAGE_TEXT',
  isSwitchingModel: false,
  completedSessions: {},

  setEditingMessageId: (value) => setSliceValue(set, 'editingMessageId', value),
  setEditMode: (value) => setSliceValue(set, 'editMode', value),
  setCommandedInput: (value) => setSliceValue(set, 'commandedInput', value),
  setLoadingSessionIds: (value) => setSliceValue(set, 'loadingSessionIds', value),
  setGeneratingTitleSessionIds: (value) => setSliceValue(set, 'generatingTitleSessionIds', value),
  setSelectedFiles: (value) => setSliceValue(set, 'selectedFiles', value),
  setAppFileError: (value) => setSliceValue(set, 'appFileError', value),
  setIsAppProcessingFile: (value) => setSliceValue(set, 'isAppProcessingFile', value),
  setAspectRatio: (value) => setSliceValue(set, 'aspectRatio', value),
  setImageSize: (value) => setSliceValue(set, 'imageSize', value),
  setImageOutputMode: (value) => setSliceValue(set, 'imageOutputMode', value),
  setIsSwitchingModel: (value) => setSliceValue(set, 'isSwitchingModel', value),
  setCompletedSessions: (value) => setSliceValue(set, 'completedSessions', value),
});
