import { useCallback } from 'react';
import type { EditableOpenAICompatibleModelRow } from './openaiCompatibleModelListState';

/**
 * Shared row-edit handlers for the editable OpenAI-compatible model rows. Used
 * by both OpenAICompatibleModelListEditor and OpenAICompatibleCurrentModelsPanel
 * so the update/trim/remove behavior stays identical across surfaces.
 */
export const useOpenAICompatibleModelRowHandlers = (
  rows: EditableOpenAICompatibleModelRow[],
  commitRows: (rows: EditableOpenAICompatibleModelRow[]) => void,
) => {
  const handleUpdateModel = useCallback(
    (rowId: string, id: string) => {
      commitRows(rows.map((row) => (row.rowId === rowId ? { ...row, id } : row)));
    },
    [rows, commitRows],
  );

  const handleUpdateModelName = useCallback(
    (rowId: string, name: string) => {
      commitRows(rows.map((row) => (row.rowId === rowId ? { ...row, name } : row)));
    },
    [rows, commitRows],
  );

  const handleTrimModel = useCallback(
    (rowId: string) => {
      commitRows(rows.map((row) => (row.rowId === rowId ? { ...row, id: row.id.trim() } : row)));
    },
    [rows, commitRows],
  );

  const handleTrimModelName = useCallback(
    (rowId: string) => {
      commitRows(rows.map((row) => (row.rowId === rowId ? { ...row, name: row.name.trim() } : row)));
    },
    [rows, commitRows],
  );

  const handleRemoveModel = useCallback(
    (rowId: string) => {
      commitRows(rows.filter((row) => row.rowId !== rowId));
    },
    [rows, commitRows],
  );

  return { handleUpdateModel, handleUpdateModelName, handleTrimModel, handleTrimModelName, handleRemoveModel };
};
