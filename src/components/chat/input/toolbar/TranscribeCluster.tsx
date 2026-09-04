import React, { useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Mic, SlidersHorizontal, Upload } from 'lucide-react';
import {
  TOOLBAR_IMAGE_CLUSTER_CLASS,
  TOOLBAR_TOGGLE_ACTIVE_CLASS,
  TOOLBAR_TOGGLE_IDLE_CLASS,
} from '@/constants/designTokens';
import { type AttachmentAction, type ChatSettings, type ChatSettingsUpdater } from '@/types';
import { TranscribeLanguageSelector } from './TranscribeLanguageSelector';
import { TranscribeSettingsModal } from './TranscribeSettingsModal';

interface TranscribeClusterProps {
  currentChatSettings: ChatSettings;
  setCurrentChatSettings: ChatSettingsUpdater;
  onAttachmentAction?: (action: AttachmentAction) => void;
}

export const TranscribeCluster: React.FC<TranscribeClusterProps> = ({
  currentChatSettings,
  setCurrentChatSettings,
  onAttachmentAction,
}) => {
  const { t } = useI18n();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const language = currentChatSettings.transcriptionLanguage ?? '';
  const wordTimestamps = currentChatSettings.transcriptionWordTimestamps ?? false;
  const speakerLabels = currentChatSettings.transcriptionSpeakerLabels ?? false;
  const smartMode = currentChatSettings.transcriptionSmartMode ?? false;
  const customVocabulary = currentChatSettings.transcriptionCustomVocabulary ?? '';
  const systemInstruction = currentChatSettings.transcriptionSystemInstruction ?? '';

  const hasAdvancedConfig = Boolean(
    wordTimestamps || speakerLabels || smartMode || customVocabulary.trim() || systemInstruction.trim(),
  );

  const handleLanguageChange = (newLang: string) => {
    setCurrentChatSettings((prev) => ({ ...prev, transcriptionLanguage: newLang }));
  };

  const handleSaveModalSettings = (settings: {
    systemInstruction: string;
    customVocabulary: string;
    wordTimestamps: boolean;
    speakerLabels: boolean;
    smartMode: boolean;
  }) => {
    setCurrentChatSettings((prev) => ({
      ...prev,
      transcriptionSystemInstruction: settings.systemInstruction,
      transcriptionCustomVocabulary: settings.customVocabulary,
      transcriptionWordTimestamps: settings.wordTimestamps,
      transcriptionSpeakerLabels: settings.speakerLabels,
      transcriptionSmartMode: settings.smartMode,
    }));
  };

  return (
    <>
      <div className={TOOLBAR_IMAGE_CLUSTER_CLASS} data-testid="transcribe-settings-cluster">
        <button
          type="button"
          onClick={() => onAttachmentAction?.('recorder')}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-[var(--theme-text-danger)] bg-[var(--theme-bg-danger)]/10 hover:bg-[var(--theme-bg-danger)]/20 border border-[var(--theme-border-danger)]/30 transition-colors shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] cursor-pointer"
          title={t('attachMenuRecordAudio')}
          data-testid="transcribe-record-button"
        >
          <Mic size={14} strokeWidth={2} />
          <span>{t('attachMenuRecordAudio')}</span>
        </button>

        <button
          type="button"
          onClick={() => onAttachmentAction?.('upload')}
          className={TOOLBAR_TOGGLE_IDLE_CLASS}
          title={t('transcribeUploadAudio')}
          data-testid="transcribe-upload-button"
        >
          <Upload size={14} strokeWidth={1.75} />
          <span>{t('transcribeUploadAudio')}</span>
        </button>

        <div className="hidden sm:block h-4 w-px bg-[var(--theme-border-secondary)]/60 my-auto" aria-hidden="true" />

        <TranscribeLanguageSelector language={language} setLanguage={handleLanguageChange} />

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={hasAdvancedConfig ? TOOLBAR_TOGGLE_ACTIVE_CLASS : TOOLBAR_TOGGLE_IDLE_CLASS}
          title={t('transcribeModalTitle')}
          data-testid="transcribe-settings-button"
        >
          <SlidersHorizontal size={14} strokeWidth={1.75} />
          <span>{t('transcribeSettings')}</span>
          {hasAdvancedConfig && <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-text-link)]" />}
        </button>
      </div>

      <TranscribeSettingsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        systemInstruction={systemInstruction}
        customVocabulary={customVocabulary}
        wordTimestamps={wordTimestamps}
        speakerLabels={speakerLabels}
        smartMode={smartMode}
        onSave={handleSaveModalSettings}
      />
    </>
  );
};
