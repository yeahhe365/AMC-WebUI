import { vi } from 'vitest';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { useMessageSender } from '@/features/message-sender/useMessageSender';
import type { useSessionLoader } from '@/hooks/chat/history/useSessionLoader';
import type { StandardChatProps, StreamHandlerFunctions } from '@/features/message-sender/messageSenderTypes';
import {
  type ChatGroup,
  type ChatMessage,
  type InputCommand,
  type SavedChatSession,
  type UploadedFile,
  type ImageOutputMode,
} from '@/types';
import { createAppSettings, createChatSettings } from '@/test/data/factories';

type MessageSenderProps = Parameters<typeof useMessageSender>[0];
type SessionLoaderProps = Parameters<typeof useSessionLoader>[0];
type StateSetter<T> = Dispatch<SetStateAction<T>>;

const createStateSetter = <T>() => vi.fn<StateSetter<T>>();

const createMutableRef = <T>(current: T): MutableRefObject<T> => ({ current });

const createStreamHandlers = (): StreamHandlerFunctions => ({
  streamOnError: vi.fn(),
  streamOnComplete: vi.fn(),
  streamOnPart: vi.fn(),
  onThoughtChunk: vi.fn(),
});

export type MessageSenderPropsOverrides = Omit<
  Partial<MessageSenderProps>,
  'appSettings' | 'currentChatSettings' | 'imageOutputMode'
> & {
  appSettings?: Partial<MessageSenderProps['appSettings']>;
  currentChatSettings?: Partial<MessageSenderProps['currentChatSettings']>;
  imageOutputMode?: ImageOutputMode;
};

export const createMessageSenderProps = (overrides: MessageSenderPropsOverrides = {}): MessageSenderProps => {
  const { appSettings, currentChatSettings, ...rest } = overrides;

  return {
    appSettings: createAppSettings(appSettings),
    currentChatSettings: createChatSettings(currentChatSettings),
    messages: [],
    selectedFiles: [],
    setSelectedFiles: createStateSetter<UploadedFile[]>(),
    editingMessageId: null,
    setEditingMessageId: vi.fn(),
    setAppFileError: vi.fn(),
    aspectRatio: '1:1',
    imageSize: '1K',
    imageOutputMode: 'IMAGE_TEXT',
    userScrolledUpRef: createMutableRef(false),
    activeSessionId: null,
    sessionKeyMapRef: createMutableRef(new Map<string, string>()),
    language: 'en',
    ...rest,
  };
};

export type StandardChatPropsOverrides = Omit<
  Partial<StandardChatProps>,
  'appSettings' | 'currentChatSettings' | 'imageOutputMode'
> & {
  appSettings?: Partial<StandardChatProps['appSettings']>;
  currentChatSettings?: Partial<StandardChatProps['currentChatSettings']>;
  imageOutputMode?: ImageOutputMode;
};

export const createStandardChatProps = (overrides: StandardChatPropsOverrides = {}): StandardChatProps => {
  const { appSettings, currentChatSettings, ...rest } = overrides;

  return {
    appSettings: createAppSettings(appSettings),
    currentChatSettings: createChatSettings(currentChatSettings),
    messages: [],
    setEditingMessageId: vi.fn(),
    aspectRatio: '1:1',
    imageSize: '1K',
    imageOutputMode: 'IMAGE_TEXT',
    userScrolledUpRef: createMutableRef(false),
    activeSessionId: 'session-1',
    setActiveSessionId: vi.fn(),
    activeJobs: createMutableRef(new Map<string, AbortController>()),
    setSessionLoading: vi.fn(),
    updateAndPersistSessions: vi.fn(),
    getStreamHandlers: vi.fn(() => createStreamHandlers()),
    sessionKeyMapRef: createMutableRef(new Map<string, string>()),
    setAppFileError: vi.fn(),
    language: 'en',
    ...rest,
  };
};

export type SessionLoaderPropsOverrides = Omit<Partial<SessionLoaderProps>, 'appSettings'> & {
  appSettings?: Partial<SessionLoaderProps['appSettings']>;
};

export const createSessionLoaderProps = (overrides: SessionLoaderPropsOverrides = {}): SessionLoaderProps => {
  const { appSettings, ...rest } = overrides;

  return {
    appSettings: createAppSettings(appSettings),
    setSavedSessions: createStateSetter<SavedChatSession[]>(),
    setSavedGroups: createStateSetter<ChatGroup[]>(),
    setActiveSessionId: vi.fn(),
    setActiveMessages: createStateSetter<ChatMessage[]>(),
    setSelectedFiles: createStateSetter<UploadedFile[]>(),
    setEditingMessageId: createStateSetter<string | null>(),
    setCommandedInput: createStateSetter<InputCommand | null>(),
    setAppFileError: createStateSetter<string | null>(),
    updateAndPersistSessions: vi.fn(),
    activeChat: undefined,
    userScrolledUpRef: createMutableRef(false),
    selectedFiles: [],
    fileDraftsRef: createMutableRef({}),
    activeSessionId: 'session-1',
    savedSessions: [],
    ...rest,
  };
};
