import type { Part } from '@google/genai';
import type { ChatHistoryItem, EditImageRequestConfig } from '@/types';
import { buildGenerationConfig } from '@/services/api/generationConfig';
import { sendStatelessMessageNonStreamApi } from '@/services/api/chatApi';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';

export const editImageApi = async (
  apiKey: string,
  modelId: string,
  history: ChatHistoryItem[],
  parts: Part[],
  abortSignal: AbortSignal,
  aspectRatio?: string,
  imageSize?: string,
  requestConfig?: EditImageRequestConfig,
): Promise<Part[]> => {
  if (abortSignal.aborted) {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    throw abortError;
  }

  const config = await buildGenerationConfig({
    settings: {
      ...DEFAULT_APP_SETTINGS,
      modelId,
      systemInstruction: requestConfig?.systemInstruction || '',
      showThoughts: requestConfig?.showThoughts ?? false,
      thinkingBudget: requestConfig?.thinkingBudget ?? 0,
      isGoogleSearchEnabled: !!requestConfig?.isGoogleSearchEnabled,
      isCodeExecutionEnabled: false,
      isUrlContextEnabled: false,
      isDeepSearchEnabled: !!requestConfig?.isDeepSearchEnabled,
      thinkingLevel: requestConfig?.thinkingLevel,
      safetySettings: requestConfig?.safetySettings,
    },
    aspectRatio,
    imageSize,
    imageOutputMode: requestConfig?.imageOutputMode,
  });

  return new Promise((resolve, reject) => {
    if (abortSignal.aborted) {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      reject(abortError);
      return;
    }

    sendStatelessMessageNonStreamApi(apiKey, modelId, history, parts, config, abortSignal, reject, (responseParts) =>
      resolve(responseParts),
    ).catch(reject);
  });
};
