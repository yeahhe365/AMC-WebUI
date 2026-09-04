import type { ChatMessage, UploadedFile } from '@/types';
import type { ContentPart } from '@/types/chat';
import { isGemini3Model } from '@/utils/model/modelCapabilities';

interface ResolveStandardChatTurnParams {
  messages: ChatMessage[];
  promptParts: ContentPart[];
  textToUse: string;
  enrichedFiles: UploadedFile[];
  effectiveEditingId: string | null;
  isContinueMode: boolean;
  isRawMode: boolean;
  apiModelId: string;
}

interface ResolvedStandardChatTurn {
  baseMessagesForApi: ChatMessage[];
  finalRole: 'user' | 'model';
  finalParts: ContentPart[];
  shouldSkipApiCall: boolean;
}

export const resolveStandardChatTurn = ({
  messages,
  promptParts,
  textToUse,
  enrichedFiles,
  effectiveEditingId,
  isContinueMode,
  isRawMode,
  apiModelId,
}: ResolveStandardChatTurnParams): ResolvedStandardChatTurn => {
  let baseMessagesForApi = messages;
  if (effectiveEditingId) {
    const index = messages.findIndex((message) => message.id === effectiveEditingId);
    if (index !== -1) {
      baseMessagesForApi = messages.slice(0, index);
    }
  }

  if (isContinueMode) {
    const targetMessage = messages.find((message) => message.id === effectiveEditingId);
    const currentContent = targetMessage?.content || '';
    let prefillContent = currentContent;
    if (!prefillContent.trim()) {
      prefillContent = isGemini3Model(apiModelId) ? '<thinking>I have finished reasoning</thinking>' : ' ';
    }

    // Gemini 3.6+ rejects non-empty prefilled model turns. Continue via a user nudge instead.
    const modelIdLower = apiModelId.toLowerCase();
    const bansModelTurnPrefill =
      /gemini-3\.[6-9]/.test(modelIdLower) ||
      modelIdLower.includes('gemini-3.5-flash-lite') ||
      /gemini-[4-9]/.test(modelIdLower);
    if (bansModelTurnPrefill) {
      return {
        baseMessagesForApi,
        finalRole: 'user',
        finalParts: [{ text: 'Please continue from where you left off.' }],
        shouldSkipApiCall: false,
      };
    }

    return {
      baseMessagesForApi,
      finalRole: 'model',
      finalParts: [{ text: prefillContent }],
      shouldSkipApiCall: false,
    };
  }

  if (isRawMode) {
    return {
      baseMessagesForApi: [
        ...baseMessagesForApi,
        {
          id: 'temp-raw-user',
          role: 'user',
          content: textToUse.trim(),
          files: enrichedFiles,
          timestamp: new Date(),
        },
      ],
      finalRole: 'model',
      finalParts: [{ text: '<thinking>' }],
      shouldSkipApiCall: false,
    };
  }

  return {
    baseMessagesForApi,
    finalRole: 'user',
    finalParts: promptParts,
    shouldSkipApiCall: promptParts.length === 0,
  };
};
