import { LOCAL_PYTHON_SYSTEM_PROMPT } from './localPython';
import type { LiveArtifactsPromptMode } from '@/types';

import type { SupportedLanguage } from '@/i18n/languageRegistry';

type PromptLanguage = SupportedLanguage;
type LiveArtifactsPromptModule = typeof import('./liveArtifacts');

const LIVE_ARTIFACTS_PROMPT_MARKERS = [
  '[Live Artifacts Inline Protocol - zh]',
  '[Live Artifacts Inline Protocol - en]',
  // Legacy Live Artifacts markers are recognized so old saved settings can still be toggled off.
  '[Live Artifacts Protocol]',
  '[Live Artifacts Protocol - zh]',
  '[Live Artifacts Protocol - en]',
  '[Live Artifacts Full HTML Protocol - zh]',
  '[Live Artifacts Full HTML Protocol - en]',
  // Legacy Canvas markers are recognized so old saved settings can still be toggled off.
  '[Canvas Artifact Protocol]',
  '[Canvas Artifact Protocol - zh]',
  '[Canvas Artifact Protocol - en]',
  '[Canvas Artifact Protocol v2]',
  '[Canvas Artifact Protocol v2 - zh]',
  '[Canvas Artifact Protocol v2 - en]',
  '<title>Canvas 助手：响应式视觉指南</title>',
  '<title>Canvas Assistant: Responsive Visual Guide</title>',
];
const BBOX_PROMPT_MARKER = '**任务：** 请作为一位计算机视觉专家';
const HD_GUIDE_PROMPT_MARKER = '### 系统提示词：高清引导标注专家';

export const isLiveArtifactsSystemInstruction = (instruction?: string | null) =>
  !!instruction && LIVE_ARTIFACTS_PROMPT_MARKERS.some((marker) => instruction.includes(marker));

export const isBboxSystemInstruction = (instruction?: string | null) =>
  !!instruction && instruction.includes(BBOX_PROMPT_MARKER);

export const isHdGuideSystemInstruction = (instruction?: string | null) =>
  !!instruction && instruction.includes(HD_GUIDE_PROMPT_MARKER);

// Languages without a dedicated Live Artifacts prompt (ja, ko, es, fr, de)
// fall back to the EN prompt via the `?? .en` lookup below, hence Partial.
const LIVE_ARTIFACT_PROMPT_EXPORT_BY_MODE: Record<
  LiveArtifactsPromptMode,
  { en: keyof LiveArtifactsPromptModule } & Partial<Record<PromptLanguage, keyof LiveArtifactsPromptModule>>
> = {
  inline: {
    en: 'LIVE_ARTIFACTS_INLINE_SYSTEM_PROMPT_EN',
    zh: 'LIVE_ARTIFACTS_INLINE_SYSTEM_PROMPT_ZH',
  },
};

export const loadLiveArtifactsSystemPrompt = async (
  language: PromptLanguage = 'zh',
  mode: LiveArtifactsPromptMode = 'inline',
) => {
  const prompts = await import('./liveArtifacts');
  const key = LIVE_ARTIFACT_PROMPT_EXPORT_BY_MODE[mode][language] ?? LIVE_ARTIFACT_PROMPT_EXPORT_BY_MODE[mode].en;
  return prompts[key];
};

export const loadDeepSearchSystemPrompt = async () => (await import('./deepSearch')).DEEP_SEARCH_SYSTEM_PROMPT;

export const loadLocalPythonSystemPrompt = async () => LOCAL_PYTHON_SYSTEM_PROMPT;

export const loadBboxSystemPrompt = async () => (await import('./vision')).BBOX_SYSTEM_PROMPT;

export const loadHdGuideSystemPrompt = async () => (await import('./vision')).HD_GUIDE_SYSTEM_PROMPT;
