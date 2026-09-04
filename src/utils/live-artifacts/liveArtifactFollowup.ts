import type { SupportedLanguage } from '@/i18n/languageRegistry';

export interface LiveArtifactFollowupPayload {
  instruction: string;
  state?: unknown;
  title?: string;
  source?: string;
}

type PromptLanguage = SupportedLanguage;

const MAX_INSTRUCTION_LENGTH = 2000;
const MAX_OPTIONAL_TEXT_LENGTH = 500;
const MAX_STATE_JSON_LENGTH = 6000;

const normalizeOptionalString = (value: unknown): string | undefined | null => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return undefined;
  }

  return trimmedValue.length <= MAX_OPTIONAL_TEXT_LENGTH ? trimmedValue : null;
};

const stringifyState = (state: unknown): string | null => {
  try {
    const stateJson = JSON.stringify(state, null, 2);
    if (stateJson === undefined || stateJson.length > MAX_STATE_JSON_LENGTH) {
      return null;
    }

    return stateJson;
  } catch {
    return null;
  }
};

export const isLiveArtifactFollowupStateWithinLimit = (state: unknown): boolean => stringifyState(state) !== null;

export const normalizeLiveArtifactFollowupPayload = (payload: unknown): LiveArtifactFollowupPayload | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.instruction !== 'string') {
    return null;
  }

  const instruction = record.instruction.trim();
  if (!instruction || instruction.length > MAX_INSTRUCTION_LENGTH) {
    return null;
  }

  const title = normalizeOptionalString(record.title);
  const source = normalizeOptionalString(record.source);
  if (title === null || source === null) {
    return null;
  }

  if (record.state !== undefined && stringifyState(record.state) === null) {
    return null;
  }

  return {
    instruction,
    ...(record.state !== undefined ? { state: record.state } : {}),
    ...(title ? { title } : {}),
    ...(source ? { source } : {}),
  };
};

export const formatLiveArtifactFollowupPrompt = (payload: unknown, language: PromptLanguage = 'zh'): string | null => {
  const normalizedPayload = normalizeLiveArtifactFollowupPayload(payload);
  if (!normalizedPayload) {
    return null;
  }

  const stateJson = normalizedPayload.state === undefined ? null : stringifyState(normalizedPayload.state);
  if (normalizedPayload.state !== undefined && stateJson === null) {
    return null;
  }

  if (language === 'zh') {
    return [
      '请根据 Live Artifact 中的交互选择继续处理。',
      normalizedPayload.title ? `Artifact 标题：\n${normalizedPayload.title}` : null,
      `指令：\n${normalizedPayload.instruction}`,
      stateJson ? `交互状态：\n${stateJson}` : null,
      normalizedPayload.source ? `来源：\n${normalizedPayload.source}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  return [
    'Please continue based on the interaction selected in the Live Artifact.',
    normalizedPayload.title ? `Artifact title:\n${normalizedPayload.title}` : null,
    `Instruction:\n${normalizedPayload.instruction}`,
    stateJson ? `Interaction state:\n${stateJson}` : null,
    normalizedPayload.source ? `Source:\n${normalizedPayload.source}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
};
