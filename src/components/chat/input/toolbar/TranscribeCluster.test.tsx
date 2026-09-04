import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render/providerRenderer';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { TranscribeCluster } from './TranscribeCluster';
import type { ChatSettings } from '@/types';

describe('TranscribeCluster', () => {
  const onAttachmentAction = vi.fn();
  const setCurrentChatSettings = vi.fn();
  let currentChatSettings: ChatSettings;

  beforeEach(() => {
    onAttachmentAction.mockClear();
    setCurrentChatSettings.mockClear();
    currentChatSettings = {
      ...DEFAULT_CHAT_SETTINGS,
      transcriptionLanguage: 'en',
      transcriptionWordTimestamps: false,
      transcriptionSpeakerLabels: false,
      transcriptionSmartMode: false,
      transcriptionCustomVocabulary: '',
      transcriptionSystemInstruction: '',
    };
  });

  const renderCluster = (settings: ChatSettings = currentChatSettings) => {
    return renderWithProviders(
      <TranscribeCluster
        currentChatSettings={settings}
        setCurrentChatSettings={setCurrentChatSettings}
        onAttachmentAction={onAttachmentAction}
      />,
    );
  };

  it('renders record, upload, language selector, and settings buttons', () => {
    renderCluster();

    expect(screen.getByTestId('transcribe-record-button')).toBeInTheDocument();
    expect(screen.getByTestId('transcribe-upload-button')).toBeInTheDocument();
    expect(screen.getByTestId('transcribe-settings-button')).toBeInTheDocument();
  });

  it('calls onAttachmentAction with recorder when record button is clicked', () => {
    renderCluster();

    fireEvent.click(screen.getByTestId('transcribe-record-button'));
    expect(onAttachmentAction).toHaveBeenCalledWith('recorder');
  });

  it('calls onAttachmentAction with upload when upload button is clicked', () => {
    renderCluster();

    fireEvent.click(screen.getByTestId('transcribe-upload-button'));
    expect(onAttachmentAction).toHaveBeenCalledWith('upload');
  });

  it('opens settings modal and allows toggling options and saving', () => {
    renderCluster();

    fireEvent.click(screen.getByTestId('transcribe-settings-button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    expect(setCurrentChatSettings).toHaveBeenCalled();
  });
});
