import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { AudioLines } from 'lucide-react';
import { Select } from '@/components/shared/Select';
import { AVAILABLE_TTS_VOICES } from '@/constants/voiceOptions';

interface TtsVoiceSelectorProps {
  ttsVoice: string;
  setTtsVoice: (voice: string) => void;
}

export const TtsVoiceSelector: React.FC<TtsVoiceSelectorProps> = ({ ttsVoice, setTtsVoice }) => {
  const { t } = useI18n();
  return (
    <Select
      id="tts-voice-selector"
      label={t('settingsTtsVoice')}
      hideLabel
      value={ttsVoice}
      onChange={(e) => setTtsVoice(e.target.value)}
      className="mb-0"
      wrapperClassName="relative min-w-[160px] w-auto"
      direction="up"
      dropdownClassName="!w-auto !min-w-full max-h-[300px]"
    >
      {AVAILABLE_TTS_VOICES.map((voice) => (
        <option key={voice.id} value={voice.id}>
          <span className="flex items-center gap-2">
            <AudioLines size={14} className="text-purple-500 flex-shrink-0" />
            <span className="whitespace-nowrap">
              {voice.name} ({t(voice.styleKey)})
            </span>
          </span>
        </option>
      ))}
    </Select>
  );
};
