export type ChatInputMode = 'idle' | 'editing' | 'queuing' | 'live' | 'processing';

export interface ChatInputMachineState {
  isTranslating: boolean;
  isAnimatingSend: boolean;
  isAddingById: boolean;
  isAddingByUrl: boolean;
  isWaitingForUpload: boolean;
  isFullscreen: boolean;
}

export type ChatInputMachineFlag = keyof ChatInputMachineState;
export type ChatInputBooleanUpdate = boolean | ((previous: boolean) => boolean);

type ChatInputMachineAction =
  | {
      type: 'setFlag';
      flag: ChatInputMachineFlag;
      value: ChatInputBooleanUpdate;
    }
  | {
      type: 'toggleFullscreen';
    };

export const createSetChatInputFlagAction = (
  flag: ChatInputMachineFlag,
  value: ChatInputBooleanUpdate,
): ChatInputMachineAction => ({
  type: 'setFlag',
  flag,
  value,
});

export const createToggleChatInputFullscreenAction = (): ChatInputMachineAction => ({
  type: 'toggleFullscreen',
});

interface ChatInputProcessingSnapshot {
  state: ChatInputMachineState;
  isProcessingFile: boolean;
  isConverting: boolean;
}

interface ChatInputModeSnapshot extends ChatInputProcessingSnapshot {
  isEditing: boolean;
  hasActiveQueuedSubmission: boolean;
  canQueueMessage: boolean;
  isNativeAudioModel: boolean;
  liveStatus: {
    isConnected: boolean;
    isReconnecting: boolean;
    error: string | null;
  };
}

export const initialChatInputMachineState: ChatInputMachineState = {
  isTranslating: false,
  isAnimatingSend: false,
  isAddingById: false,
  isAddingByUrl: false,
  isWaitingForUpload: false,
  isFullscreen: false,
};

const resolveBooleanUpdate = (previous: boolean, value: ChatInputBooleanUpdate) =>
  typeof value === 'function' ? value(previous) : value;

export const chatInputStateReducer = (
  state: ChatInputMachineState,
  action: ChatInputMachineAction,
): ChatInputMachineState => {
  switch (action.type) {
    case 'setFlag':
      return {
        ...state,
        [action.flag]: resolveBooleanUpdate(state[action.flag], action.value),
      };
    case 'toggleFullscreen':
      return {
        ...state,
        isFullscreen: !state.isFullscreen,
      };
  }
};

const selectIsChatInputProcessing = ({ state, isProcessingFile, isConverting }: ChatInputProcessingSnapshot) =>
  state.isTranslating ||
  state.isAddingById ||
  state.isAddingByUrl ||
  state.isWaitingForUpload ||
  isProcessingFile ||
  isConverting;

export const getChatInputMode = (snapshot: ChatInputModeSnapshot): ChatInputMode => {
  if (selectIsChatInputProcessing(snapshot)) {
    return 'processing';
  }

  const isLiveActive =
    snapshot.isNativeAudioModel &&
    (snapshot.liveStatus.isConnected || snapshot.liveStatus.isReconnecting || !!snapshot.liveStatus.error);

  if (isLiveActive) {
    return 'live';
  }

  if (snapshot.isEditing) {
    return 'editing';
  }

  if (snapshot.hasActiveQueuedSubmission || snapshot.canQueueMessage) {
    return 'queuing';
  }

  return 'idle';
};
