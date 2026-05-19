import type { ModelOption } from '@/types';

type ModelRegistryGroup = 'defaultPinned' | 'tts' | 'image' | 'liveArtifacts' | 'connectionTest' | 'transcription';

interface RegisteredModel {
  id: string;
  name: string;
  groups: ModelRegistryGroup[];
  groupLabels?: Partial<Record<ModelRegistryGroup, string>>;
}

const MODEL_REGISTRY: RegisteredModel[] = [
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest', 'transcription'],
    groupLabels: {
      liveArtifacts: 'Gemini 3.5 Flash',
      transcription: 'Gemini 3.5 Flash',
    },
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest', 'transcription'],
    groupLabels: {
      liveArtifacts: 'Gemini 3 Flash',
      transcription: 'Gemini 3.0 Flash',
    },
  },
  {
    id: 'gemini-3.1-flash-live-preview',
    name: 'Gemini 3.1 Flash Live',
    groups: ['defaultPinned'],
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest', 'transcription'],
    groupLabels: {
      liveArtifacts: 'Gemini 3.1 Flash Lite',
      connectionTest: 'Gemini 3.1 Flash Lite',
      transcription: 'Gemini 3.1 Flash Lite',
    },
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    groups: ['defaultPinned', 'liveArtifacts', 'transcription', 'connectionTest'],
    groupLabels: {
      liveArtifacts: 'Gemini 3.1 Pro',
      connectionTest: 'Gemini 3.1 Pro',
      transcription: 'Gemini 3.1 Pro',
    },
  },
  {
    id: 'gemini-robotics-er-1.6-preview',
    name: 'Gemini Robotics-ER 1.6',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest'],
    groupLabels: {
      liveArtifacts: 'Gemini Robotics-ER 1.6',
      connectionTest: 'Gemini Robotics-ER 1.6',
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
    id: 'gemini-3.1-flash-tts-preview',
    name: 'Gemini 3.1 Flash TTS',
    groups: ['tts'],
  },
  {
    id: 'gemini-2.5-flash-image',
    name: 'Nano Banana',
    groups: ['image'],
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Nano Banana Pro',
    groups: ['image'],
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Nano Banana 2',
    groups: ['image'],
  },
  {
    id: 'imagen-4.0-fast-generate-001',
    name: 'Imagen 4.0 Fast',
    groups: ['image'],
  },
  {
    id: 'imagen-4.0-generate-001',
    name: 'Imagen 4.0',
    groups: ['image'],
  },
  {
    id: 'imagen-4.0-ultra-generate-001',
    name: 'Imagen 4.0 Ultra',
    groups: ['image'],
  },
];

const getRegisteredModels = (group: ModelRegistryGroup) =>
  MODEL_REGISTRY.filter((model) => model.groups.includes(group));

export const getModelOptionsForGroup = (group: ModelRegistryGroup, options: { pinned?: boolean } = {}): ModelOption[] =>
  getRegisteredModels(group).map((model) => ({
    id: model.id,
    name: model.groupLabels?.[group] || model.name,
    ...(options.pinned !== undefined ? { isPinned: options.pinned } : {}),
  }));
