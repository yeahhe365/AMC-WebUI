import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { type ChatMessage, type SavedScenario, type SavedChatSession, type AppSettings } from '@/types';
import { logService } from '@/services/logService';
import { generateUniqueId } from '@/utils/chat/ids';
import { generateSessionTitle, createNewSession } from '@/utils/chat/session';
import { DEFAULT_CHAT_SETTINGS, DEFAULT_SYSTEM_INSTRUCTION } from '@/constants/settingsDefaults';
import { dbService } from '@/services/db/dbService';
import {
  buildSavedScenarios,
  getExportableUserScenarios,
  initializeScenarioState,
} from '@/features/scenarios/scenarioLibrary';

type SessionsUpdater = (
  updater: (prev: SavedChatSession[]) => SavedChatSession[],
  options?: { persist?: boolean },
) => void | Promise<void>;

interface PreloadedScenariosProps {
  appSettings: AppSettings;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  updateAndPersistSessions: SessionsUpdater;
  setActiveSessionId: Dispatch<SetStateAction<string | null>>;
}

export const usePreloadedScenarios = ({
  appSettings,
  setAppSettings,
  updateAndPersistSessions,
  setActiveSessionId,
}: PreloadedScenariosProps) => {
  const [userSavedScenarios, setUserSavedScenarios] = useState<SavedScenario[]>([]);
  const savedScenarios = buildSavedScenarios(userSavedScenarios);

  useEffect(() => {
    const loadScenarios = async () => {
      try {
        const storedScenarios = await dbService.getAllScenarios();
        const { userScenarios, didChange } = initializeScenarioState(storedScenarios, localStorage);

        if (didChange) {
          await dbService.setAllScenarios(userScenarios);
        }

        setUserSavedScenarios(userScenarios);
      } catch (error) {
        logService.error('Error loading preloaded scenarios:', { error });
      }
    };
    loadScenarios();
  }, []);

  const handleSaveAllScenarios = (updatedScenarios: SavedScenario[]) => {
    const scenariosToSave = getExportableUserScenarios(updatedScenarios);
    setUserSavedScenarios(scenariosToSave);
    dbService.setAllScenarios(scenariosToSave).catch((error) => {
      logService.error('Failed to save scenarios to DB', { error });
    });
  };

  const handleLoadPreloadedScenario = (scenarioToLoad: SavedScenario) => {
    const messages: ChatMessage[] = scenarioToLoad.messages.map((pm) => ({
      ...pm,
      id: generateUniqueId(),
      timestamp: new Date(),
    }));

    const systemInstruction = scenarioToLoad.systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION;

    const sessionSettings = {
      ...DEFAULT_CHAT_SETTINGS,
      ...appSettings,
      systemInstruction,
    };

    const title = scenarioToLoad.title || generateSessionTitle(messages) || 'New Chat';

    const newSession = createNewSession(sessionSettings, messages, title, null, 'manual');

    updateAndPersistSessions((prev) => [newSession, ...prev.filter((session) => session.id !== newSession.id)]);
    setActiveSessionId(newSession.id);
    dbService.setActiveSessionId(newSession.id);

    setAppSettings((prev) => ({
      ...prev,
      systemInstruction,
    }));
  };

  return {
    savedScenarios,
    handleSaveAllScenarios,
    handleLoadPreloadedScenario,
  };
};
