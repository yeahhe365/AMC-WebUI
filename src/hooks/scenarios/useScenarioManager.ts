import { logService } from '@/services/logService';
import { type ChangeEvent, useState, useEffect, useRef, useCallback } from 'react';
import { type SavedScenario } from '@/types';
import { type translations } from '@/i18n/translations';
import { generateUniqueId } from '@/utils/chat/ids';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload, sanitizeFilename } from '@/utils/export/core';
import { fileToString } from '@/utils/file/fileEncoding';
import {
  buildSavedScenarios,
  buildScenarioExportPayload,
  getExportableUserScenarios,
  mergeImportedScenarios,
  SYSTEM_SCENARIO_IDS,
  BUILT_IN_SCENARIO_IDS,
} from '@/features/scenarios/scenarioLibrary';
import { interpolate } from '@/i18n/interpolate';
import { toastError, toastInfo, toastSuccess } from '@/stores/toastStore';

import { useScenarioUiStore } from '@/stores/scenarioUiStore';

type ModalView = 'list' | 'editor';

interface UseScenarioManagerProps {
  isOpen: boolean;
  savedScenarios: SavedScenario[];
  onSaveAllScenarios: (scenarios: SavedScenario[]) => void;
  t: (key: keyof typeof translations, fallback?: string) => string;
}

export const useScenarioManager = ({ isOpen, savedScenarios, onSaveAllScenarios, t }: UseScenarioManagerProps) => {
  const [scenarios, setScenarios] = useState<SavedScenario[]>(savedScenarios);
  const [view, setView] = useState<ModalView>('list');
  const [editingScenario, setEditingScenario] = useState<SavedScenario | null>(null);
  const searchQuery = useScenarioUiStore((state) => state.searchQuery);
  const setSearchQuery = useScenarioUiStore((state) => state.setSearchQuery);

  const importInputRef = useRef<HTMLInputElement>(null);
  const scenariosRef = useRef(scenarios);
  scenariosRef.current = scenarios;

  useEffect(() => {
    if (!isOpen) return;
    // Re-sync from storage only when the modal opens. In-session persists must
    // not wipe search or kick the user out of the editor.
    setScenarios(savedScenarios);
    setView('list');
    setEditingScenario(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Open-only reset; savedScenarios is read from the opening render.
  }, [isOpen]);

  const isEditingSystemScenario = Boolean(editingScenario && SYSTEM_SCENARIO_IDS.includes(editingScenario.id));
  const hasUnsavedChanges = view === 'editor' && !isEditingSystemScenario;

  const commitUserScenarios = useCallback(
    (userScenarios: SavedScenario[]) => {
      const next = buildSavedScenarios(userScenarios);
      setScenarios(next);
      onSaveAllScenarios(next);
    },
    [onSaveAllScenarios],
  );

  const handleStartAddNew = useCallback(() => {
    setEditingScenario({ id: generateUniqueId(), title: '', messages: [] });
    setView('editor');
  }, []);

  const handleStartEdit = useCallback((scenario: SavedScenario) => {
    setEditingScenario(scenario);
    setView('editor');
  }, []);

  const handleDuplicateScenario = useCallback(
    (scenario: SavedScenario) => {
      const newScenario: SavedScenario = {
        ...scenario,
        id: generateUniqueId(),
        title: interpolate(t('scenariosCopyTitle'), { title: scenario.title }),
        messages: scenario.messages.map((message) => ({ ...message, id: generateUniqueId() })),
      };

      commitUserScenarios([newScenario, ...getExportableUserScenarios(scenariosRef.current)]);
      toastSuccess(t('scenariosFeedbackDuplicated'));
    },
    [commitUserScenarios, t],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingScenario(null);
    setView('list');
  }, []);

  const handleSaveScenario = useCallback(
    (scenarioToSave: SavedScenario) => {
      if (!scenarioToSave.title.trim()) {
        toastError(t('scenariosTitleRequired'));
        return;
      }
      const nextUserScenarios = getExportableUserScenarios(scenariosRef.current);
      const existing = nextUserScenarios.find((scenario) => scenario.id === scenarioToSave.id);
      commitUserScenarios(
        existing
          ? nextUserScenarios.map((scenario) => (scenario.id === scenarioToSave.id ? scenarioToSave : scenario))
          : [...nextUserScenarios, scenarioToSave],
      );
      toastSuccess(t('scenariosFeedbackSaved'));
      setView('list');
      setEditingScenario(null);
    },
    [commitUserScenarios, t],
  );

  const handleDeleteScenario = useCallback(
    (scenarioId: string) => {
      commitUserScenarios(
        getExportableUserScenarios(scenariosRef.current).filter((scenario) => scenario.id !== scenarioId),
      );
      toastInfo(t('scenariosFeedbackDeleted'));
    },
    [commitUserScenarios, t],
  );

  const handleExportScenarios = useCallback(() => {
    const scenariosToExport = getExportableUserScenarios(scenarios);

    if (scenariosToExport.length === 0) {
      toastInfo(t('scenariosFeedbackEmptyExport'));
      return;
    }

    const exportPayload = buildScenarioExportPayload(scenariosToExport);
    const jsonString = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const date = new Date().toISOString().slice(0, 10);
    triggerDownload(createManagedObjectUrl(blob), `scenarios-export-${date}.json`);
    toastSuccess(t('scenariosFeedbackExported'));
  }, [scenarios, t]);

  const handleExportSingleScenario = useCallback(
    (scenario: SavedScenario) => {
      const exportPayload = {
        type: 'AllModelChat-Scenarios',
        version: 1,
        scenarios: [scenario],
      };
      const safeTitle = sanitizeFilename(scenario.title);
      const jsonString = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      triggerDownload(createManagedObjectUrl(blob), `scenario-${safeTitle}.json`);
      toastSuccess(t('scenariosFeedbackExported'));
    },
    [t],
  );

  const handleImportScenarios = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await fileToString(file);
        const importPayload = JSON.parse(text);

        if (
          importPayload &&
          importPayload.type === 'AllModelChat-Scenarios' &&
          Array.isArray(importPayload.scenarios)
        ) {
          const importedScenarios = importPayload.scenarios as SavedScenario[];
          commitUserScenarios(
            mergeImportedScenarios({
              existingScenarios: scenariosRef.current,
              importedScenarios,
              createId: generateUniqueId,
            }),
          );
          toastSuccess(t('scenariosFeedbackImported'));
        } else {
          throw new Error('Invalid format');
        }
      } catch (error) {
        logService.error('Import failed', error);
        toastError(t('scenariosFeedbackImportFailed'));
      } finally {
        if (importInputRef.current) importInputRef.current.value = '';
      }
    },
    [commitUserScenarios, t],
  );

  return {
    scenarios,
    view,
    editingScenario,
    searchQuery,
    setSearchQuery,
    importInputRef,
    systemScenarioIds: SYSTEM_SCENARIO_IDS,
    builtInScenarioIds: BUILT_IN_SCENARIO_IDS,
    hasUnsavedChanges,
    actions: {
      handleStartAddNew,
      handleStartEdit,
      handleDuplicateScenario,
      handleCancelEdit,
      handleSaveScenario,
      handleDeleteScenario,
      handleExportScenarios,
      handleExportSingleScenario,
      handleImportScenarios,
    },
  };
};
