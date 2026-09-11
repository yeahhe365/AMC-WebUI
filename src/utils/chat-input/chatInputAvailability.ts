import type { UploadedFile } from '@/types';
import type { ModelCapabilities } from '@/utils/model/modelCapabilities';
import type { ChatInputLocalFileState } from '@/components/chat/input/chatInputContextTypes';
import { hasSendableChatInputContent } from './chatInputContent';
import { getChatInputMode, type ChatInputMachineState } from './chatInputStateMachine';
import { areFilesStillProcessing } from './pendingSubmission';

interface ChatInputAvailabilityState {
  inputText: string;
  quotes: string[];
  isAddingById: boolean;
}

interface ChatInputModalState {
  showCreateTextFileEditor: boolean;
  showRecorder: boolean;
  showTtsContextEditor: boolean;
  isHelpModalOpen: boolean;
  showLibraryPicker?: boolean;
}

type ChatInputCapabilities = Pick<ModelCapabilities, 'isNativeAudioModel' | 'permissions'>;

interface ChatInputAvailabilityOptions {
  inputState: ChatInputAvailabilityState;
  modalsState: ChatInputModalState;
  localFileState: ChatInputLocalFileState;
  selectedFiles: UploadedFile[];
  capabilities: ChatInputCapabilities;
  activeSessionId: string | null;
  isLoading: boolean;
  isEditing: boolean;
}

interface ChatInputModeOptions {
  inputState: {
    machineState: ChatInputMachineState;
  };
  localFileState: Pick<ChatInputLocalFileState, 'isConverting'>;
  capabilities: Partial<ChatInputCapabilities>;
  liveApi: {
    isConnected: boolean;
    isReconnecting: boolean;
    error: string | null;
  };
  activeQueuedSubmissions: unknown[];
  canQueueMessage: boolean;
  isEditing: boolean;
  isProcessingFile: boolean;
}

export const getChatInputAvailability = ({
  inputState,
  modalsState,
  localFileState,
  selectedFiles,
  capabilities,
  activeSessionId,
  isLoading,
  isEditing,
}: ChatInputAvailabilityOptions) => {
  const isModalOpen =
    modalsState.showCreateTextFileEditor ||
    modalsState.showRecorder ||
    !!localFileState.configuringFile ||
    !!localFileState.previewFile ||
    localFileState.showTokenModal ||
    modalsState.showTtsContextEditor ||
    !!modalsState.showLibraryPicker;

  const hasSendableContent = hasSendableChatInputContent({
    inputText: inputState.inputText,
    quotes: inputState.quotes,
    selectedFileCount: selectedFiles.length,
    isNativeAudioModel: capabilities.isNativeAudioModel,
    canAcceptAttachments: capabilities.permissions.canAcceptAttachments,
    requiresTextPrompt: capabilities.permissions.requiresTextPrompt,
  });

  const canSend =
    hasSendableContent && !isLoading && !inputState.isAddingById && !isModalOpen && !localFileState.isConverting;

  const canQueueMessageBase =
    !capabilities.permissions.canUseLiveControls &&
    hasSendableContent &&
    !!activeSessionId &&
    isLoading &&
    !isEditing &&
    !inputState.isAddingById &&
    !isModalOpen &&
    !localFileState.isConverting &&
    !areFilesStillProcessing(selectedFiles);

  return {
    isAnyModalOpen: isModalOpen || modalsState.isHelpModalOpen,
    canSend,
    canQueueMessageBase,
  };
};

export const getCurrentChatInputMode = ({
  inputState,
  localFileState,
  capabilities,
  liveApi,
  activeQueuedSubmissions,
  canQueueMessage,
  isEditing,
  isProcessingFile,
}: ChatInputModeOptions) =>
  getChatInputMode({
    state: inputState.machineState,
    isEditing,
    hasActiveQueuedSubmission: activeQueuedSubmissions.length > 0,
    canQueueMessage,
    isNativeAudioModel: capabilities.permissions?.canUseLiveControls || capabilities.isNativeAudioModel || false,
    liveStatus: {
      isConnected: liveApi.isConnected,
      isReconnecting: liveApi.isReconnecting,
      error: liveApi.error,
    },
    isProcessingFile,
    isConverting: localFileState.isConverting,
  });
