import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { type AppSettings, type SavedChatSession, type SavedScenario, type ChatGroup, type ChatMessage } from '@/types';
import { logService } from '@/services/logService';
import { toastError, toastSuccess } from '@/stores/toastStore';
import { generateUniqueId } from '@/utils/chat/ids';
import { mergeImportedScenarios } from '@/features/scenarios/scenarioLibrary';
import { sanitizeImportedAppSettings } from '@/schemas/appSettingsSchema';
import { REDACTED_SECRET_SENTINEL, restoreRedactedSecrets } from '@/utils/secretRedaction';
import { interpolate, formatI18nErrorMessage } from '@/i18n/interpolate';

type SessionsUpdater = (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void;
type GroupsUpdater = (updater: (prev: ChatGroup[]) => ChatGroup[]) => void;

interface UseDataImportProps {
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  updateAndPersistSessions: SessionsUpdater;
  updateAndPersistGroups: GroupsUpdater;
  savedScenarios: SavedScenario[];
  handleSaveAllScenarios: (scenarios: SavedScenario[]) => void;
  t: (key: string) => string;
}

type ImportedSettingsPayload = {
  type: 'AllModelChat-Settings';
  settings: Partial<AppSettings>;
};

type ImportedHistoryPayload = {
  type: 'AllModelChat-History';
  history: SavedChatSession[];
  groups?: ChatGroup[];
};

type ImportedScenariosPayload = {
  type: 'AllModelChat-Scenarios';
  scenarios: SavedScenario[];
};

const normalizeImportedTimestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const normalizeImportedGroup = (group: ChatGroup): ChatGroup => ({
  ...group,
  timestamp: normalizeImportedTimestamp(group.timestamp),
});

const normalizeImportedDate = (value: unknown): Date | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const normalizeImportedMessage = (message: ChatMessage): ChatMessage => ({
  ...message,
  timestamp: normalizeImportedDate(message.timestamp) ?? new Date(),
  generationStartTime: normalizeImportedDate(message.generationStartTime),
  generationEndTime: normalizeImportedDate(message.generationEndTime),
});

const normalizeImportedSession = (session: SavedChatSession): SavedChatSession => ({
  ...session,
  timestamp: normalizeImportedTimestamp(session.timestamp),
  settings: {
    ...session.settings,
    // Redacted keys from a shareable export must never become an active key.
    lockedApiKey: session.settings?.lockedApiKey === REDACTED_SECRET_SENTINEL ? null : session.settings?.lockedApiKey,
  },
  messages: Array.isArray(session.messages) ? session.messages.map(normalizeImportedMessage) : [],
});

export const useDataImport = ({
  setAppSettings,
  updateAndPersistSessions,
  updateAndPersistGroups,
  savedScenarios,
  handleSaveAllScenarios,
  t,
}: UseDataImportProps) => {
  const handleImportFile = useCallback(
    <T extends { type: string }>(file: File, expectedType: T['type'], onValid: (importPayload: T) => void) => {
      logService.info(`Importing ${expectedType} from file: ${file.name}`);
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const importPayload = JSON.parse(text);
          if (importPayload && importPayload.type === expectedType) {
            onValid(importPayload);
          } else {
            const foundType = typeof importPayload?.type === 'string' ? importPayload.type : t('exportNotApplicable');
            throw new Error(interpolate(t('settingsImportInvalidFileFormat'), { expectedType, foundType }));
          }
        } catch (error) {
          logService.error(`Failed to import ${expectedType}`, { error });
          toastError(formatI18nErrorMessage(t, 'settingsImportErrorWithMessage', error));
        }
      };
      reader.onerror = (event) => {
        logService.error(`Failed to read ${expectedType} file`, { error: event });
        toastError(t('settingsImportError'));
      };
      reader.readAsText(file);
    },
    [t],
  );

  const handleImportSettings = useCallback(
    (file: File) => {
      handleImportFile<ImportedSettingsPayload>(file, 'AllModelChat-Settings', (data) => {
        const sanitizedSettings = sanitizeImportedAppSettings(data.settings);
        setAppSettings((prev) => restoreRedactedSecrets(sanitizedSettings, prev));
        toastSuccess(t('settingsImportSuccess'));
      });
    },
    [handleImportFile, setAppSettings, t],
  );

  const handleImportHistory = useCallback(
    (file: File) => {
      handleImportFile<ImportedHistoryPayload>(file, 'AllModelChat-History', (data) => {
        if (data.history && Array.isArray(data.history)) {
          updateAndPersistSessions((prev) => {
            const existingIds = new Set(prev.map((session) => session.id));
            const newSessions = data.history
              .map(normalizeImportedSession)
              .filter((session: SavedChatSession) => !existingIds.has(session.id));
            return [...prev, ...newSessions];
          });

          if (data.groups && Array.isArray(data.groups)) {
            const importedGroups = data.groups.map(normalizeImportedGroup);
            updateAndPersistGroups((prev) => {
              const existingIds = new Set(prev.map((group) => group.id));
              const newGroups = importedGroups.filter((group: ChatGroup) => !existingIds.has(group.id));
              return [...prev, ...newGroups];
            });
          }

          toastSuccess(t('settingsImportHistorySuccess'));
        } else {
          throw new Error(t('settingsImportHistoryInvalidData'));
        }
      });
    },
    [handleImportFile, t, updateAndPersistSessions, updateAndPersistGroups],
  );

  const handleImportAllScenarios = useCallback(
    (file: File) => {
      handleImportFile<ImportedScenariosPayload>(file, 'AllModelChat-Scenarios', (data) => {
        if (data.scenarios && Array.isArray(data.scenarios)) {
          handleSaveAllScenarios(
            mergeImportedScenarios({
              existingScenarios: savedScenarios,
              importedScenarios: data.scenarios,
              createId: generateUniqueId,
            }),
          );
          toastSuccess(t('scenariosFeedbackImported'));
        } else {
          throw new Error(t('settingsImportScenariosInvalidData'));
        }
      });
    },
    [handleImportFile, t, handleSaveAllScenarios, savedScenarios],
  );

  return {
    handleImportSettings,
    handleImportHistory,
    handleImportAllScenarios,
  };
};
