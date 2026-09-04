import { useCallback } from 'react';
import { type AppSettings, type SavedScenario, type ChatGroup } from '@/types';
import { logService } from '@/services/logService';
import { toastError } from '@/stores/toastStore';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { serializeSessionForPortableExport } from '@/utils/chat/session';
import { triggerDownload } from '@/utils/export/core';
import { redactExportedAppSettings } from '@/utils/secretRedaction';
import { dbService } from '@/services/db/dbService';
import { buildScenarioExportPayload } from '@/features/scenarios/scenarioLibrary';

interface UseDataExportProps {
  appSettings: AppSettings;
  savedGroups: ChatGroup[];
  savedScenarios: SavedScenario[];
  t: (key: string) => string;
}

const isSensitiveMcpHeader = (name: string): boolean => {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === 'authorization' ||
    normalized === 'proxy-authorization' ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('api-key') ||
    normalized.includes('apikey')
  );
};

const isSensitiveMcpEnvKey = (key: string): boolean => {
  const normalized = key.trim().toLowerCase();
  return (
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('password') ||
    normalized.includes('credential') ||
    normalized.includes('api_key') ||
    normalized.includes('apikey') ||
    normalized.endsWith('_key') ||
    normalized.endsWith('key')
  );
};

const redactMcpSecretsForExport = (settings: AppSettings): AppSettings => ({
  ...settings,
  mcpServers: (settings.mcpServers ?? []).map((server) => ({
    ...server,
    // Keep non-secret env vars (paths, flags, log levels) so an exported
    // settings file remains a working stdio server config after re-import.
    ...(server.env
      ? {
          env: Object.fromEntries(Object.entries(server.env).filter(([key]) => !isSensitiveMcpEnvKey(key))),
        }
      : {}),
    ...(server.headers
      ? {
          headers: Object.fromEntries(
            Object.entries(server.headers).filter(([header]) => !isSensitiveMcpHeader(header)),
          ),
        }
      : {}),
    ...(server.auth ? { auth: { type: server.auth.type } } : {}),
  })),
});

export const useDataExport = ({ appSettings, savedGroups, savedScenarios, t }: UseDataExportProps) => {
  const handleExportSettings = useCallback(() => {
    logService.info(`Exporting settings.`);
    try {
      const dataToExport = {
        type: 'AllModelChat-Settings',
        version: 1,
        settings: redactExportedAppSettings(redactMcpSecretsForExport(appSettings)),
      };
      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const date = new Date().toISOString().slice(0, 10);
      triggerDownload(createManagedObjectUrl(blob), `amc-webui-settings-${date}.json`);
    } catch (error) {
      logService.error('Failed to export settings', { error });
      toastError(t('exportFailedTitle'));
    }
  }, [appSettings, t]);

  const handleExportHistory = useCallback(async () => {
    logService.info(`Exporting chat history.`);
    try {
      // Fetch full sessions from DB to ensure messages are included
      // The state 'savedSessions' only contains metadata
      const fullSessions = await dbService.getAllSessions();

      // Sanitize all sessions before export to remove rawFile/Blobs/AbortControllers
      const sanitizedSessions = await Promise.all(fullSessions.map(serializeSessionForPortableExport));

      const dataToExport = {
        type: 'AllModelChat-History',
        version: 1,
        history: sanitizedSessions,
        groups: savedGroups,
      };
      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const date = new Date().toISOString().slice(0, 10);
      triggerDownload(createManagedObjectUrl(blob), `amc-webui-history-${date}.json`);
    } catch (error) {
      logService.error('Failed to export history', { error });
      toastError(t('exportFailedTitle'));
    }
  }, [savedGroups, t]);

  const handleExportAllScenarios = useCallback(() => {
    logService.info(`Exporting all scenarios.`);
    try {
      const dataToExport = buildScenarioExportPayload(savedScenarios);
      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const date = new Date().toISOString().slice(0, 10);
      triggerDownload(createManagedObjectUrl(blob), `amc-webui-scenarios-${date}.json`);
    } catch (error) {
      logService.error('Failed to export scenarios', { error });
      toastError(t('exportFailedTitle'));
    }
  }, [savedScenarios, t]);

  return {
    handleExportSettings,
    handleExportHistory,
    handleExportAllScenarios,
  };
};
