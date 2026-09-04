import { useCallback } from 'react';
import { type AppSettings, type ChatSettings as IndividualChatSettings } from '@/types';
import { logService } from '@/services/logService';
import { getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { pcmBase64ToWavUrl } from '@/features/audio/audioProcessing';
import { generateSpeechApi } from '@/services/api/generation/audioApi';
import { DEFAULT_TTS_MODEL_ID } from '@/constants/modelConfiguration';

interface TextToSpeechHandlerProps {
  appSettings: AppSettings;
  currentChatSettings: IndividualChatSettings;
}

/** Result of a quick TTS request: a playable URL on success, or a message the
 * UI can surface when the key is missing / the request failed or timed out. */
export type QuickTtsResult = { url: string } | { error: string };

export const useTextToSpeechHandler = ({ appSettings, currentChatSettings }: TextToSpeechHandlerProps) => {
  const handleQuickTTS = useCallback(
    async (text: string): Promise<QuickTtsResult> => {
      const keyResult = getGeminiKeyForRequest(appSettings, currentChatSettings, { skipIncrement: true });
      if ('error' in keyResult) {
        logService.error('Quick TTS failed:', { error: keyResult.error });
        return { error: keyResult.error };
      }
      const { key } = keyResult;

      logService.info('Requesting Quick TTS for selected text');
      const modelId = currentChatSettings.modelId.includes('-tts') ? currentChatSettings.modelId : DEFAULT_TTS_MODEL_ID;
      const voice = appSettings.ttsVoice;
      const abortController = new AbortController();

      try {
        const base64Pcm = await generateSpeechApi(key, modelId, text, voice, abortController.signal);
        return { url: pcmBase64ToWavUrl(base64Pcm) };
      } catch (error) {
        const timedOut = error instanceof Error && error.message.includes('timed out');
        logService.error(timedOut ? 'Quick TTS timed out:' : 'Quick TTS generation failed:', { error });
        return { error: error instanceof Error ? error.message : 'TTS generation failed.' };
      }
    },
    [appSettings, currentChatSettings],
  );

  return { handleQuickTTS };
};
