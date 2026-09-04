import type { ModelOption } from '@/types';
import { ROBOTICS_MODEL } from './modelConfiguration';

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
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest'],
    groupLabels: {
      liveArtifacts: 'Gemini 3.8 Flash',
    },
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    groups: ['liveArtifacts', 'connectionTest'],
    groupLabels: {
      liveArtifacts: 'Gemini 3.7 Flash',
    },
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
    id: 'gemini-3.1-flash-live-preview',
    name: 'Gemini 3.1 Flash Live',
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
    groups: ['defaultPinned', 'liveArtifacts', 'connectionTest'],
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
    id: 'gemini-3.1-flash-tts-preview',
    name: 'Gemini 3.1 Flash TTS',
    groups: ['tts'],
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
    id: 'gemini-3.1-flash-lite-image',
    name: 'Nano Banana Lite',
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
