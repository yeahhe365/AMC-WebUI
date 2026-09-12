import type { ChatHistoryItem, ChatSettings, AppSettings } from '@/types';
import { generateContentTurnApi } from '@/services/api/chatApi';
import { getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { DEFAULT_MODEL_ID } from '@/constants/modelConfiguration';
import { loadSettingsAssistantSystemPrompt } from '@/features/prompts/promptRegistry';
import { PROVIDER_TOOL_DECLARATIONS } from './providerTools';

export type AssistantChannel = { ok: true; key: string; modelId: string } | { ok: false; reason: 'no-gemini-key' };

/**
 * The assistant runs on the Gemini-native route only: it is the one route whose
 * client-side tool loop is implemented, and it is independent of whichever
 * model the user happens to be chatting with.
 */
export const resolveAssistantChannel = (
  appSettings: AppSettings,
  modelId: string = DEFAULT_MODEL_ID,
): AssistantChannel => {
  // Mirrors getLiveApiKey: a minimal ChatSettings is enough for the Gemini
  // route to resolve, since apiMode is forced to 'gemini-native' internally.
  // skipIncrement/skipUsageLogging matter because this runs on render to decide
  // whether the panel is enabled: without them every settings change would burn
  // a key-rotation slot and write a usage log for a request that never happens.
  // The consequence is deliberate — assistant turns reuse the rotation slot the
  // chat path currently sits on (i.e. the key that is already working) instead
  // of advancing the rotation.
  const keyResult = getGeminiKeyForRequest(appSettings, { modelId } as ChatSettings, {
    skipIncrement: true,
    skipUsageLogging: true,
  });
  if ('error' in keyResult) {
    return { ok: false, reason: 'no-gemini-key' };
  }
  return { ok: true, key: keyResult.key, modelId };
};

export const createAssistantRunTurn =
  ({ channel, abortSignal }: { channel: Extract<AssistantChannel, { ok: true }>; abortSignal: AbortSignal }) =>
  async (contents: ChatHistoryItem[]) => {
    const systemInstruction = await loadSettingsAssistantSystemPrompt();
    return generateContentTurnApi(
      channel.key,
      channel.modelId,
      contents,
      {
        systemInstruction,
        temperature: 0.2,
        // No built-in tools here: mixing googleSearch/codeExecution with custom
        // declarations is only supported on Gemini 3, and this config must
        // always end up with the declarations appended.
        tools: [{ functionDeclarations: PROVIDER_TOOL_DECLARATIONS }],
      },
      abortSignal,
    );
  };
