import type { ModelOption } from '@/types';
import { ROBOTICS_MODEL } from './modelConfiguration';
import { KNOWN_MODELS_CATALOG } from '@/utils/model/knownModelsCatalog';

type ModelRegistryGroup =
  'defaultPinned' | 'tts' | 'image' | 'liveArtifacts' | 'connectionTest' | 'transcription' | 'liveTranslate';

interface RegisteredModel {
  id: string;
  name: string;
  groups: ModelRegistryGroup[];
  groupLabels?: Partial<Record<ModelRegistryGroup, string>>;
}

const MODEL_REGISTRY: RegisteredModel[] = [
  {
    id: 'gemini-omni-1.2-flash',
    name: 'Gemini Omni 1.2 Flash',
    groups: ['defaultPinned'],
  },
  {
    id: 'gemini-3.5-transcribe',
    name: 'Gemini 3.5 Transcribe',
    groups: ['defaultPinned', 'transcription'],
    groupLabels: {
      transcription: 'Gemini 3.5 Transcribe',
    },
  },
  {
    id: 'gemini-3.5-transcribe-live',
    name: 'Gemini 3.5 Transcribe Live',
    groups: ['defaultPinned'],
  },
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest'],
  },
  {
    id: 'gemini-4-carbon',
    name: 'Gemini 4 Carbon',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest'],
    groupLabels: {
      liveArtifacts: 'Gemini 4 Carbon',
      connectionTest: 'Gemini 4 Carbon',
    },
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest'],
    groupLabels: {
      liveArtifacts: 'Gemini 4 Argon',
      connectionTest: 'Gemini 4 Argon',
    },
  },
  {
    // Former default workhorse. The chat picker now ships Gemini 4 only, so 3.8
    // stays out of `defaultPinned`; it remains callable and is kept as a
    // connection-test target, and power users can re-add it from Settings.
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    groups: ['connectionTest'],
  },
  {
    // Previous-generation Flash, but Google still labels it Stable and it stays
    // callable; modelConfiguration already lists it for thinking + raw mode, only
    // the picker was missing it. Not pinned: it sorts below the 3.8 generation.
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    groups: ['defaultPinned'],
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest'],
    groupLabels: {
      liveArtifacts: 'Gemini 3.5 Flash-Lite',
      connectionTest: 'Gemini 3.5 Flash-Lite',
    },
  },
  {
    id: 'gemini-3.8-live',
    name: 'Gemini 3.8 Live',
    groups: ['defaultPinned'],
  },
  {
    id: 'gemini-3.8-live-extended-thinking',
    name: 'Gemini 3.8 Live Extended Thinking',
    groups: ['defaultPinned'],
  },
  {
    id: 'gemini-3.5-live-translate-preview',
    name: 'Gemini 3.5 Live Translate',
    groups: ['defaultPinned'],
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    groups: ['liveArtifacts', 'connectionTest'],
    groupLabels: {
      liveArtifacts: 'Gemini 3.1 Pro',
      connectionTest: 'Gemini 3.1 Pro',
    },
  },
  {
    id: ROBOTICS_MODEL,
    name: 'Gemini Robotics-ER 2',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest'],
    groupLabels: {
      liveArtifacts: 'Gemini Robotics-ER 2',
      connectionTest: 'Gemini Robotics-ER 2',
    },
  },
  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B IT',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest'],
  },
  {
    id: 'gemma-4-26b-a4b-it',
    name: 'Gemma 4 26B A4B IT',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest'],
  },
  {
    id: 'gemini-3.8-flash-tts',
    name: 'Gemini 3.8 Flash TTS',
    groups: ['tts'],
  },
  {
    id: 'gemini-3.8-flash-lite-tts',
    name: 'Gemini 3.8 Flash-Lite TTS',
    groups: ['tts'],
  },
  {
    id: 'gemini-nano-banana-2.1',
    name: 'Nano Banana 2.1',
    groups: ['image'],
  },
  {
    id: 'gemini-3-pro-image',
    name: 'Nano Banana Pro',
    groups: ['image'],
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    name: 'Nano Banana 2 Lite',
    groups: ['image'],
  },
];

const getRegisteredModels = (group: ModelRegistryGroup) =>
  MODEL_REGISTRY.filter((model) => model.groups.includes(group));

export const getModelOptionsForGroup = (group: ModelRegistryGroup, options: { pinned?: boolean } = {}): ModelOption[] =>
  getRegisteredModels(group).map((model) => {
    const catalogEntry = KNOWN_MODELS_CATALOG[model.id];
    return {
      id: model.id,
      name: model.groupLabels?.[group] || model.name,
      ...(catalogEntry?.contextWindow ? { contextWindow: catalogEntry.contextWindow } : {}),
      ...(catalogEntry?.capabilities ? { capabilities: catalogEntry.capabilities } : {}),
      ...(options.pinned !== undefined ? { isPinned: options.pinned } : {}),
    };
  });

export const getRegisteredModelName = (modelId: string): string | undefined => {
  const normalized = modelId.replace(/^models\//, '');
  return MODEL_REGISTRY.find((model) => model.id === normalized)?.name;
};
