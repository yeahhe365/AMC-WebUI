import { type ChatSettings, GEMINI_PROVIDER_ID } from '@/types';

type CodeExecutionModeSettings = Pick<ChatSettings, 'isCodeExecutionEnabled' | 'isLocalPythonEnabled' | 'providerId'>;

export const CODE_EXECUTION_TEXT_FILE_LIMIT_BYTES = 2 * 1024 * 1024;

// Server-side code execution is a Gemini-native tool. Never treat it as active
// while the session routes to a third-party provider, even when the toggle
// stayed on from a Gemini chat — that residue currently makes text files send
// as binary inlineData, which the OpenAI-compatible / Anthropic builders
// reject. The routing decision is the session's providerId (the derived key).
const isThirdPartyMode = (settings: CodeExecutionModeSettings): boolean =>
  settings.providerId !== undefined && settings.providerId !== GEMINI_PROVIDER_ID;

export const isServerCodeExecutionMode = (settings: CodeExecutionModeSettings): boolean =>
  !isThirdPartyMode(settings) && Boolean(settings.isCodeExecutionEnabled && !settings.isLocalPythonEnabled);
