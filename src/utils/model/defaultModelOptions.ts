import { type ModelOption } from '@/types';
import { getModelOptionsForGroup } from '@/constants/modelRegistry';
import { sortModels } from './modelSorting';

const DEFAULT_TOP_PINNED_IDS = new Set(['gemini-4-hydrogen', 'gemini-4-carbon', 'gemini-4-argon', 'gemini-3.8-flash']);

export const getDefaultModelOptions = (): ModelOption[] => {
  const models = [
    ...getModelOptionsForGroup('defaultPinned'),
    ...getModelOptionsForGroup('tts'),
    ...getModelOptionsForGroup('image'),
  ].map((model) => ({
    ...model,
    ...(DEFAULT_TOP_PINNED_IDS.has(model.id) ? { isPinned: true } : { isPinned: false }),
  }));

  return sortModels(models);
};
