import {
  type ChatMessage,
  type SavedChatSession,
  type ChatSettings,
  type PersistedSessionFileRecord,
  type UploadedFile,
} from '@/types';
import { generateUniqueId } from './ids';
import { base64ToBlob, blobToBase64 } from '@/utils/file/fileEncoding';
import { getVisibleChatMessages } from './visibility';
import { createManagedObjectUrl, releaseManagedObjectUrlsByOwner } from '@/services/objectUrlManager';
import { TAB_ID } from '@/stores/tabIdentity';
import { redactExportedSessionSettings } from '@/utils/secretRedaction';

const logSessionWarning = (message: string, data?: unknown) => {
  console.warn(`[session] ${message}`, data);
};

const logSessionError = (message: string, data?: unknown) => {
  console.error(`[session] ${message}`, data);
};

export const createMessage = (
  role: 'user' | 'model' | 'error',
  content: string,
  options: Partial<Exclude<ChatMessage, 'id' | 'role' | 'content' | 'timestamp'>> & {
    id?: string;
    timestamp?: Date;
  } = {},
): ChatMessage => ({
  id: options.id || generateUniqueId(),
  role,
  content,
  timestamp: options.timestamp || new Date(),
  ...options,
});

export const createNewSession = (
  settings: ChatSettings,
  messages: ChatMessage[] = [],
  title: string = 'New Chat',
  groupId: string | null = null,
  titleSource: SavedChatSession['titleSource'] = 'default',
): SavedChatSession => ({
  id: generateUniqueId(),
  title,
  titleSource,
  messages,
  settings,
  timestamp: Date.now(),
  groupId,
  createdTabId: TAB_ID,
});

export const cloneMessagesWithFreshIds = (messages: ChatMessage[]): ChatMessage[] => {
  const idMap = new Map<string, string>();
  const clonedMessages = messages.map((message) => {
    const nextMessageId = generateUniqueId();
    idMap.set(message.id, nextMessageId);

    return {
      ...message,
      id: nextMessageId,
      files: message.files?.map((file) => ({
        ...file,
        id: generateUniqueId(),
      })),
      isLoading: false,
      generationStartTime: undefined,
      generationEndTime: undefined,
    };
  });

  return clonedMessages.map((message) => ({
    ...message,
    toolParentMessageId: message.toolParentMessageId ? idMap.get(message.toolParentMessageId) : undefined,
  }));
};

const TITLE_MAX_WORDS = 7;
const TITLE_MAX_SPACELESS_CHARS = 30;

/** Take the first N words; for spaceless text (e.g. CJK) truncate by character count. */
const truncateTitleText = (content: string, maxSpacelessChars = TITLE_MAX_SPACELESS_CHARS): string => {
  const trimmed = content.trim();
  const words = trimmed.split(/\s+/);
  if (words.length > TITLE_MAX_WORDS) {
    return words.slice(0, TITLE_MAX_WORDS).join(' ') + '...';
  }
  // Spaceless text (Chinese/Japanese etc.) cannot be shortened by word-splitting — truncate by chars.
  if (words.length === 1 && trimmed.length > maxSpacelessChars) {
    return trimmed.slice(0, maxSpacelessChars) + '…';
  }
  return trimmed;
};

export const generateSessionTitle = (messages: ChatMessage[]): string => {
  const visibleMessages = getVisibleChatMessages(messages);
  const firstUserMessage = visibleMessages.find((message) => message.role === 'user' && message.content.trim() !== '');
  if (firstUserMessage) {
    return truncateTitleText(firstUserMessage.content);
  }
  const firstModelMessage = visibleMessages.find(
    (message) => message.role === 'model' && message.content.trim() !== '',
  );
  if (firstModelMessage) {
    return 'Model: ' + truncateTitleText(firstModelMessage.content);
  }
  const firstFile = visibleMessages.find((message) => message.files && message.files.length > 0)?.files?.[0];
  if (firstFile) {
    return `Chat with ${firstFile.name}`;
  }
  return 'New Chat';
};

export const rehydrateSessionFiles = (session: SavedChatSession): SavedChatSession => {
  const sessionResourceOwner = `session:${session.id}`;
  releaseManagedObjectUrlsByOwner(sessionResourceOwner);

  const newMessages = session.messages.map((message) => {
    if (!message.files?.length) return message;

    const newFiles = message.files.map((file) => {
      // Migrate inline base64 dataUrl values into managed blob URLs.
      // dataUrl values that are not blob/http are treated as inline base64 payloads.
      if (file.dataUrl && !file.dataUrl.startsWith('blob:') && !file.dataUrl.startsWith('http')) {
        // Convert base64 payloads to Blob objects to keep preview memory bounded.
        try {
          // Strip optional data URL prefix if present (data:image/png;base64,...).
          const base64Clean = file.dataUrl.includes(',') ? file.dataUrl.split(',')[1] : file.dataUrl;
          const blob = base64ToBlob(base64Clean, file.type);
          const newFile = new File([blob], file.name, { type: file.type });
          const newUrl = createManagedObjectUrl(newFile, {
            key: `session-file:${session.id}:${message.id}:${file.id}`,
            ownerId: sessionResourceOwner,
          });

          return { ...file, rawFile: newFile, dataUrl: newUrl };
        } catch {
          logSessionWarning(`Failed to migrate legacy Base64 file: ${file.name}`);
          // Keep the original payload when migration fails so existing sessions remain readable.
        }
      }

      // Rehydrate previews from IndexedDB Blob records.
      const isValidRawFile = file.rawFile instanceof Blob;

      // Blob-backed files need fresh object URLs for previews after reload.
      if (isValidRawFile) {
        try {
          // Managed object URLs keep preview cleanup tied to the session owner.
          const dataUrl = createManagedObjectUrl(file.rawFile as Blob, {
            key: `session-file:${session.id}:${message.id}:${file.id}`,
            ownerId: sessionResourceOwner,
          });
          return { ...file, dataUrl };
        } catch (error) {
          logSessionError('Failed to create object URL for file on load', { fileId: file.id, error });
          return { ...file, dataUrl: undefined, error: 'Preview failed to load' };
        }
      } else if (file.rawFile && !isValidRawFile) {
        // It has a rawFile property but it's not a Blob (e.g. {} from JSON or bad persistence). Strip it.
        const fileWithoutRaw = { ...file };
        delete fileWithoutRaw.rawFile;
        return fileWithoutRaw;
      }

      return file;
    });

    return { ...message, files: newFiles };
  });

  return { ...session, messages: newMessages };
};

const hasInlinePersistableDataUrl = (dataUrl?: string) =>
  !!dataUrl && !dataUrl.startsWith('blob:') && !dataUrl.startsWith('http');

const sanitizeStoredFileMetadata = (file: UploadedFile): UploadedFile => {
  const fileCopy = { ...file };
  delete fileCopy.rawFile;
  delete fileCopy.abortController;

  if (fileCopy.dataUrl && (fileCopy.dataUrl.startsWith('blob:') || hasInlinePersistableDataUrl(fileCopy.dataUrl))) {
    delete fileCopy.dataUrl;
  }

  return fileCopy;
};

export const extractPersistedSessionFileRecords = (session: SavedChatSession): PersistedSessionFileRecord[] => {
  const records: PersistedSessionFileRecord[] = [];

  session.messages.forEach((message) => {
    message.files?.forEach((file) => {
      let rawFile: Blob | undefined;

      if (file.rawFile instanceof Blob) {
        rawFile = file.rawFile;
      } else if (hasInlinePersistableDataUrl(file.dataUrl)) {
        try {
          const base64Clean = file.dataUrl!.includes(',') ? file.dataUrl!.split(',')[1] : file.dataUrl!;
          rawFile = base64ToBlob(base64Clean, file.type);
        } catch (error) {
          logSessionWarning(`Failed to extract inline file payload for persistence: ${file.name}`, { error });
        }
      }

      if (!rawFile) {
        return;
      }

      records.push({
        id: file.id,
        sessionId: session.id,
        messageId: message.id,
        name: file.name,
        type: file.type,
        rawFile,
      });
    });
  });

  return records;
};

export const stripSessionFilePayloads = (session: SavedChatSession): SavedChatSession => ({
  ...session,
  messages: session.messages.map((message) => {
    if (!message.files) {
      return message;
    }

    return {
      ...message,
      files: message.files.map(sanitizeStoredFileMetadata),
    };
  }),
});

export const attachPersistedSessionFiles = (
  session: SavedChatSession,
  fileRecords: Map<string, PersistedSessionFileRecord>,
): SavedChatSession => ({
  ...session,
  messages: session.messages.map((message) => {
    if (!message.files) {
      return message;
    }

    return {
      ...message,
      files: message.files.map((file) => {
        const record = fileRecords.get(file.id);
        if (!record) {
          return file;
        }

        return {
          ...file,
          rawFile: record.rawFile,
        };
      }),
    };
  }),
});

const buildPortableDataUrl = async (file: UploadedFile): Promise<string | undefined> => {
  if (file.rawFile instanceof Blob) {
    const mimeType = file.type || file.rawFile.type || 'application/octet-stream';
    const base64 = await blobToBase64(file.rawFile);
    return `data:${mimeType};base64,${base64}`;
  }

  if (hasInlinePersistableDataUrl(file.dataUrl)) {
    return file.dataUrl;
  }

  return undefined;
};

const serializeFileForPortableExport = async (file: UploadedFile): Promise<UploadedFile> => {
  const dataUrl = await buildPortableDataUrl(file);
  const fileCopy = sanitizeStoredFileMetadata(file);

  if (dataUrl) {
    fileCopy.dataUrl = dataUrl;
  }

  return fileCopy;
};

export const serializeSessionForPortableExport = async (session: SavedChatSession): Promise<SavedChatSession> => ({
  ...session,
  settings: redactExportedSessionSettings(session.settings),
  messages: await Promise.all(session.messages.map(serializeMessageForPortableExport)),
});

export const serializeMessageForPortableExport = async (message: ChatMessage): Promise<ChatMessage> => ({
  ...message,
  files: message.files ? await Promise.all(message.files.map(serializeFileForPortableExport)) : undefined,
});

/**
 * Core helper to update session list state.
 */
export const performOptimisticSessionUpdate = (
  prevSessions: SavedChatSession[],
  params: {
    activeSessionId: string | null;
    newSessionId: string; // The ID to use if creating a new session or identifying the active one
    newMessages: ChatMessage[];
    settings: ChatSettings;
    editingMessageId?: string | null;
    title?: string;
    shouldLockKey?: boolean;
    keyToLock?: string;
  },
): SavedChatSession[] => {
  const { activeSessionId, newSessionId, newMessages, settings, editingMessageId, title, shouldLockKey, keyToLock } =
    params;

  const existingSessionIndex = prevSessions.findIndex((session) => session.id === activeSessionId);

  if (existingSessionIndex === -1) {
    const newSettings = { ...settings };
    if (shouldLockKey && keyToLock) {
      newSettings.lockedApiKey = keyToLock;
    }

    const newSession = {
      ...createNewSession(newSettings, newMessages, title || 'New Chat'),
      id: newSessionId,
    };

    return [newSession, ...prevSessions];
  }

  const updatedSessions = [...prevSessions];
  const session = updatedSessions[existingSessionIndex];
  let finalMessages = [...session.messages];

  if (editingMessageId) {
    const editIndex = finalMessages.findIndex((message) => message.id === editingMessageId);
    if (editIndex !== -1) {
      finalMessages = finalMessages.slice(0, editIndex);
    }
  }

  finalMessages = [...finalMessages, ...newMessages];

  const updatedSettings = { ...session.settings, ...settings };

  if (shouldLockKey && !session.settings.lockedApiKey && keyToLock) {
    updatedSettings.lockedApiKey = keyToLock;
  }

  updatedSessions[existingSessionIndex] = {
    ...session,
    messages: finalMessages,
    title: title || session.title,
    // A freshly-heuristic title returns the session to the auto-titlable state;
    // otherwise preserve the existing origin (manual/auto stay untouched).
    titleSource: title ? 'default' : session.titleSource,
    settings: updatedSettings,
    timestamp: newMessages.length > 0 ? Date.now() : session.timestamp,
  };

  return updatedSessions;
};
