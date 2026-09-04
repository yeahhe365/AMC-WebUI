import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Mic, Info, AudioLines } from 'lucide-react';
import { AVAILABLE_TRANSCRIPTION_MODELS } from '@/constants/settingsModelOptions';
import { AVAILABLE_TTS_VOICES } from '@/constants/voiceOptions';
import { Tooltip } from '@/components/shared/Tooltip';
import { Select } from '@/components/shared/Select';

interface VoiceControlProps {
  transcriptionModelId: string;
  setTranscriptionModelId: (value: string) => void;
  ttsVoice?: string;
  setTtsVoice?: (value: string) => void;
  titleKey?: string;
}

export const VoiceControl: React.FC<VoiceControlProps> = ({
  transcriptionModelId,
  setTranscriptionModelId,
  ttsVoice,
  setTtsVoice,
  titleKey = 'settingsVoiceSectionTitle',
}) => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)] flex items-center gap-2">
        <Mic size={14} strokeWidth={1.5} /> {t(titleKey)}
      </h4>

      <div className="space-y-3">
        <Select
          id="transcription-model-select"
          label=""
          layout="horizontal"
          labelContent={
            <span className="flex items-center">
              {t('chatBehaviorVoiceModelLabel')}
              <Tooltip text={t('chatBehaviorVoiceModelTooltip')}>
                <Info size={14} className="ml-2 text-[var(--theme-text-secondary)] cursor-help" strokeWidth={1.5} />
              </Tooltip>
            </span>
          }
          value={transcriptionModelId}
          onChange={(e) => setTranscriptionModelId(e.target.value)}
        >
          {AVAILABLE_TRANSCRIPTION_MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </Select>

        {ttsVoice && setTtsVoice && (
          <Select
            id="tts-voice-select"
            label=""
            layout="horizontal"
            labelContent={<span className="flex items-center">{t('settingsTtsVoice')}</span>}
            value={ttsVoice}
            onChange={(e) => setTtsVoice(e.target.value)}
          >
            {AVAILABLE_TTS_VOICES.map((voice) => (
              <option key={voice.id} value={voice.id}>
                <div className="flex items-center gap-2">
                  <AudioLines size={14} className="text-purple-500 flex-shrink-0" />
                  <span>
                    {voice.name} ({t(voice.styleKey)})
                  </span>
                </div>
              </option>
            ))}
          </Select>
        )}
      </div>
    </div>
  );
};
