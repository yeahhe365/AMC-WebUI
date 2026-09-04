import type {
  ChangeEvent,
  ClipboardEvent,
  Dispatch,
  KeyboardEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from 'react';
import type {
  AppSettings,
  AttachmentAction,
  ChatSettings,
  ChatSettingsUpdater,
  CommandInfo,
  ContentPart,
  InputCommand,
  LiveClientFunctions,
  LiveTranscriptHandler,
  MediaResolution,
  ModelOption,
  UploadedFile,
  VideoMetadata,
} from '@/types';
import type { ChatToolToggleStates } from '@/types/chatTools';
import type { SlashCommand } from '@/types/slashCommands';
import type { ChatInputBooleanUpdate, ChatInputMachineState } from '@/utils/chat-input/chatInputStateMachine';
import type { QueuedChatInputSubmission } from '@/utils/chat-input/pendingSubmission';
import type { ModelCapabilities } from '@/utils/model/modelCapabilities';

type ChatEditMode = 'update' | 'resend';
type ChatInputMode = 'idle' | 'editing' | 'queuing' | 'live' | 'processing';
type SetSelectedFiles = Dispatch<SetStateAction<UploadedFile[]>>;

export interface ChatInputRuntimeState {
  appSettings: AppSettings;
  currentChatSettings: ChatSettings;
  setAppFileError: (error: string | null) => void;
  activeSessionId: string | null;
  commandedInput: InputCommand | null;
  onMessageSent: () => void;
  selectedFiles: UploadedFile[];
  setSelectedFiles: SetSelectedFiles;
  onSendMessage: (text: string, options?: { isFastMode?: boolean; files?: UploadedFile[] }) => void;
  isLoading: boolean;
  isEditing: boolean;
  editMode: ChatEditMode;
  editingMessageId: string | null;
  setEditingMessageId: (id: string | null) => void;
  onStopGenerating: () => void;
  onCancelEdit: () => void;
  onProcessFiles: (files: FileList | File[]) => Promise<void>;
  onAddFileById: (fileId: string) => Promise<void>;
  onCancelUpload: (fileId: string) => void;
  onTranscribeAudio: (file: File) => Promise<string | null>;
  isProcessingFile: boolean;
  toolStates: ChatToolToggleStates;
  onClearChat: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onToggleLiveArtifactsPrompt: () => void;
  onSelectModel: (modelId: string) => void;
  availableModels: ModelOption[];
  onTogglePinCurrentSession: () => void;
  onRetryLastTurn: () => void;
  onEditLastUserMessage: () => void;
  onTogglePip: () => void;
  isPipActive: boolean;
  setCurrentChatSettings: ChatSettingsUpdater;
  onSuggestionClick: (suggestion: string) => void;
  onOrganizeInfoClick: (suggestion: string) => void;
  showEmptyStateSuggestions: boolean;
  onUpdateMessageContent: (messageId: string, content: string) => void;
  onAddUserMessage?: (text: string, files?: UploadedFile[]) => void;
  onLiveTranscript?: LiveTranscriptHandler;
  liveClientFunctions?: LiveClientFunctions;
  onToggleBBox: () => void;
  isBBoxModeActive: boolean;
  onToggleGuide: () => void;
  isGuideModeActive: boolean;
  onToggleQuadImages: () => void;
  themeId: string;
}

export interface ChatInputState {
  inputText: string;
  setInputText: Dispatch<SetStateAction<string>>;
  quotes: string[];
  setQuotes: Dispatch<SetStateAction<string[]>>;
  ttsContext: string;
  setTtsContext: Dispatch<SetStateAction<string>>;
  machineState: ChatInputMachineState;
  isTranslating: boolean;
  setTranslating: (value: ChatInputBooleanUpdate) => void;
  isAnimatingSend: boolean;
  startSendAnimation: () => void;
  stopSendAnimation: () => void;
  fileIdInput: string;
  setFileIdInput: Dispatch<SetStateAction<string>>;
  isAddingById: boolean;
  setAddingById: (value: ChatInputBooleanUpdate) => void;
  urlInput: string;
  setUrlInput: Dispatch<SetStateAction<string>>;
  isAddingByUrl: boolean;
  setAddingByUrl: (value: ChatInputBooleanUpdate) => void;
  isWaitingForUpload: boolean;
  setWaitingForUpload: (value: ChatInputBooleanUpdate) => void;
  isFullscreen: boolean;
  exitFullscreen: () => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  justInitiatedFileOpRef: MutableRefObject<boolean>;
  prevIsProcessingFileRef: MutableRefObject<boolean>;
  isComposingRef: MutableRefObject<boolean>;
  compositionEndedAtRef: MutableRefObject<number>;
  handleCompositionStart: () => void;
  handleCompositionEnd: () => void;
  clearCurrentDraft: () => void;
  handleToggleFullscreen: () => void;
  isMobile: boolean;
}

export interface ChatInputLiveApiState {
  isConnected: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  error: string | null;
  volume: number;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  sendText: (text: string) => Promise<boolean>;
  sendContent: (parts: ContentPart[]) => Promise<boolean>;
  videoStream: MediaStream | null;
  videoSource: 'camera' | 'screen' | null;
  startCamera: () => Promise<boolean>;
  startScreenShare: () => Promise<boolean>;
  stopVideo: () => void;
  videoRef: RefObject<HTMLVideoElement>;
  isReconnecting: boolean;
}

export interface ChatInputModalsState {
  showCreateTextFileEditor: boolean;
  setShowCreateTextFileEditor: Dispatch<SetStateAction<boolean>>;
  editingFile: UploadedFile | null;
  setEditingFile: Dispatch<SetStateAction<UploadedFile | null>>;
  showRecorder: boolean;
  setShowRecorder: Dispatch<SetStateAction<boolean>>;
  showAddByIdInput: boolean;
  setShowAddByIdInput: Dispatch<SetStateAction<boolean>>;
  showAddByUrlInput: boolean;
  setShowAddByUrlInput: Dispatch<SetStateAction<boolean>>;
  isHelpModalOpen: boolean;
  setIsHelpModalOpen: Dispatch<SetStateAction<boolean>>;
  showTtsContextEditor: boolean;
  setShowTtsContextEditor: Dispatch<SetStateAction<boolean>>;
  fileInputRef: RefObject<HTMLInputElement>;
  imageInputRef: RefObject<HTMLInputElement>;
  folderInputRef: RefObject<HTMLInputElement>;
  zipInputRef: RefObject<HTMLInputElement>;
  cameraInputRef: RefObject<HTMLInputElement>;
  handleAttachmentAction: (action: AttachmentAction) => void;
  handleConfirmCreateTextFile: (content: string | Blob, filename: string) => Promise<void>;
  handleAudioRecord: (file: File) => Promise<void>;
  handleEditFile: (file: UploadedFile) => void;
}

export interface ChatInputLocalFileState {
  configuringFile: UploadedFile | null;
  setConfiguringFile: Dispatch<SetStateAction<UploadedFile | null>>;
  previewFile: UploadedFile | null;
  closePreviewFile: () => void;
  isPreviewEditable: boolean;
  isConverting: boolean;
  setIsConverting: Dispatch<SetStateAction<boolean>>;
  showTokenModal: boolean;
  setShowTokenModal: Dispatch<SetStateAction<boolean>>;
  handleSaveTextFile: (content: string | Blob, filename: string) => Promise<void>;
  handleSavePreviewTextFile: (fileId: string, content: string, newName: string) => void;
  handleConfigureFile: (file: UploadedFile) => void;
  handleMoveTextFileToInput: (file: UploadedFile) => Promise<void>;
  handlePreviewFile: (file: UploadedFile) => void;
  handlePrevImage: () => void;
  handleNextImage: () => void;
  inputImages: UploadedFile[];
  currentImageIndex: number;
}

export interface ChatInputVoiceState {
  isRecording: boolean;
  isTranscribing: boolean;
  isMicInitializing: boolean;
  error: string | null;
  handleVoiceInputClick: () => void;
  handleCancelRecording: () => void;
}

export interface ChatInputSlashCommandState {
  isOpen: boolean;
  query: string;
  filteredCommands: SlashCommand[];
  selectedIndex: number;
}

export interface ChatInputSlashCommandContextState {
  slashCommandState: ChatInputSlashCommandState;
  setSlashCommandState: Dispatch<SetStateAction<ChatInputSlashCommandState>>;
  allCommandsForHelp: CommandInfo[];
  handleCommandSelect: (command: SlashCommand) => void;
  handleInputChange: (value: string) => void;
  handleSlashCommandExecution: (rawInput: string) => boolean;
}

export interface ChatInputHandlers {
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleFolderChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleZipChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleAddUrl: (url: string) => Promise<void>;
  handlePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => Promise<void>;
  handlePasteAction: (
    clipboardData: DataTransfer | null,
    options?: { forceTextInsertion?: boolean },
  ) => Promise<boolean>;
  handleInputChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: () => void;
  handleFastSubmit: () => void;
  handleTranslate: () => Promise<void>;
  handlePasteFromClipboard: () => Promise<void>;
  handleClearInput: () => void;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: (value: string) => void;
  removeSelectedFile: (fileIdToRemove: string) => void;
  handleAddFileByIdSubmit: () => Promise<void>;
  handleToggleToolAndFocus: (toggleFunc: () => void) => void;
  handleSaveFileConfig: (
    fileId: string,
    updates: {
      videoMetadata?: VideoMetadata;
      mediaResolution?: MediaResolution;
    },
  ) => void;
  queueCurrentSubmission: () => void;
  cancelPendingUploadSend: () => void;
  restoreQueuedSubmission: (id: string) => void;
  removeQueuedSubmission: (id: string) => void;
  removeAllQueuedSubmissions: () => void;
  reorderQueuedSubmissions: (activeId: string, targetIndex: number) => void;
}

export interface ChatInputContextValue {
  chatInput: ChatInputRuntimeState;
  inputState: ChatInputState;
  capabilities: ModelCapabilities;
  liveApi: ChatInputLiveApiState;
  modalsState: ChatInputModalsState;
  localFileState: ChatInputLocalFileState;
  voiceState: ChatInputVoiceState;
  slashCommandState: ChatInputSlashCommandContextState;
  handlers: ChatInputHandlers;
  targetDocument: Document;
  canSend: boolean;
  canQueueMessage: boolean;
  queuedSubmissions: QueuedChatInputSubmission[];
  chatInputMode: ChatInputMode;
  isAnyModalOpen: boolean;
  handleSmartSendMessage: (text: string, options?: { isFastMode?: boolean; files?: UploadedFile[] }) => Promise<void>;
  inputDisabled: boolean;
  initialTextareaHeight: number;
  handleStartLiveCamera: () => Promise<void>;
  handleStartLiveScreenShare: () => Promise<void>;
  queuedSubmissionsView?: {
    title: string;
    items: Array<{
      id: string;
      previewText: string;
      fileCount: number;
    }>;
    onEditItem: (id: string) => void;
    onRemoveItem: (id: string) => void;
    onReorderItem: (activeId: string, targetIndex: number) => void;
    onClearAll: () => void;
  };
}

export interface ChatInputToolbarContextValue {
  appSettings: AppSettings;
  currentChatSettings: ChatSettings;
  capabilities: ModelCapabilities;
  isLoading: boolean;
  setCurrentChatSettings: ChatSettingsUpdater;
  onToggleQuadImages: () => void;
  showAddByIdInput: boolean;
  fileIdInput: string;
  setFileIdInput: (value: string) => void;
  onAddFileByIdSubmit: () => void;
  onCancelAddById: () => void;
  isAddingById: boolean;
  showAddByUrlInput: boolean;
  urlInput: string;
  setUrlInput: (value: string) => void;
  onAddUrlSubmit: () => void;
  onCancelAddUrl: () => void;
  isAddingByUrl: boolean;
  ttsContext?: string;
  onEditTtsContext: () => void;
  onAttachmentAction?: (action: AttachmentAction) => void;
}

export interface ChatInputActionsContextValue {
  currentModelId: string;
  /** Active session routing — Gemini built-in tools are hidden on third-party routes. */
  providerId?: string;
  toolStates: ChatToolToggleStates;
  onAttachmentAction: (action: AttachmentAction) => void;
  onNewChat: () => void;
  disabled: boolean;
  onRecordButtonClick: () => void;
  onCancelRecording: () => void;
  isRecording: boolean;
  isMicInitializing: boolean;
  isTranscribing: boolean;
  isWaitingForUpload: boolean;
  isTranslating: boolean;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onStartLiveSession: () => void;
  onDisconnectLiveSession: () => void;
  isLiveConnected: boolean;
  isLiveMuted: boolean;
  onToggleLiveMute: () => void;
  onStartLiveCamera: () => void;
  onStartLiveScreenShare: () => void;
  onStopLiveVideo: () => void;
  liveVideoSource: 'camera' | 'screen' | null;
  onToggleToolAndFocus: (toggleFunc: () => void) => void;
  onCountTokens: () => void;
  isImageGenerationModel: boolean;
  isTranscribeModel: boolean;
  isNativeAudioModel: boolean;
  isLiveTranslate: boolean;
  isLiveTranscribe: boolean;
  isTtsModel: boolean;
  canAddYouTubeVideo: boolean;
  isLoading: boolean;
  isEditing: boolean;
  showInputTranslationButton: boolean;
  showInputPasteButton: boolean;
  showInputClearButton: boolean;
  showVoiceInputButton: boolean;
}

export interface ChatInputComposerStatusContextValue {
  hasTrimmedInput: boolean;
  canSend: boolean;
  canQueueMessage: boolean;
  queuedCount: number;
  onTranslate: () => void;
  onPasteFromClipboard: () => void;
  onClearInput: () => void;
  onFastSendMessage: () => void;
  onQueueMessage: () => void;
  onCancelPendingUploadSend: () => void;
}
