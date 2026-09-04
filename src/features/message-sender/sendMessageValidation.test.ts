import { describe, expect, it } from 'vitest';
import { validateMessageBeforeSend } from './sendMessageValidation';
import { createUploadedFile } from '@/test/data/factories';
import { getTranslator } from '@/i18n/translations';

describe('validateMessageBeforeSend', () => {
  const t = getTranslator('en');
  const defaultPermissions = {
    canAcceptAttachments: true,
    requiresTextPrompt: false,
  };

  it('allows transcribe model when an audio file is still uploading', () => {
    const uploadingAudio = createUploadedFile({
      id: 'audio-uploading',
      name: 'voice.mp3',
      type: 'audio/mp3',
      uploadState: 'uploading',
      isProcessing: true,
    });

    const result = validateMessageBeforeSend({
      text: '',
      files: [uploadingAudio],
      permissions: defaultPermissions,
      isContinueMode: false,
      isServerCodeExecutionEnabled: false,
      isGemini3Image: false,
      isTranscribeModel: true,
      activeModelId: 'gemini-2.5-flash',
      t,
    });

    expect(result.ok).toBe(true);
  });

  it('blocks transcribe model if a non-audio file is attached alongside audio', () => {
    const uploadingAudio = createUploadedFile({
      id: 'audio-uploading',
      name: 'voice.mp3',
      type: 'audio/mp3',
      uploadState: 'uploading',
      isProcessing: true,
    });
    const uploadingPdf = createUploadedFile({
      id: 'pdf-uploading',
      name: 'document.pdf',
      type: 'application/pdf',
      uploadState: 'uploading',
      isProcessing: true,
    });

    const result = validateMessageBeforeSend({
      text: '',
      files: [uploadingAudio, uploadingPdf],
      permissions: defaultPermissions,
      isContinueMode: false,
      isServerCodeExecutionEnabled: false,
      isGemini3Image: false,
      isTranscribeModel: true,
      activeModelId: 'gemini-2.5-flash',
      t,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fileError).toBe(t('messageSenderTranscribeSupportsAudioOnly'));
    }
  });

  it('blocks oversized text files in server code execution mode even if uploading', () => {
    const oversizedFile = createUploadedFile({
      id: 'text-large',
      name: 'large.txt',
      type: 'text/plain',
      size: 3 * 1024 * 1024,
      uploadState: 'uploading',
      isProcessing: true,
    });

    const result = validateMessageBeforeSend({
      text: 'Run code',
      files: [oversizedFile],
      permissions: defaultPermissions,
      isContinueMode: false,
      isServerCodeExecutionEnabled: true,
      isGemini3Image: false,
      isTranscribeModel: false,
      activeModelId: 'gemini-3.7-flash',
      t,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fileError).toBe(t('messageSenderCodeExecutionTextFileTooLarge'));
    }
  });
});
