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

  it('allows transcribe model when a video file is attached', () => {
    const uploadingVideo = createUploadedFile({
      id: 'video-uploading',
      name: 'clip.mp4',
      type: 'video/mp4',
      uploadState: 'uploading',
      isProcessing: true,
    });

    const result = validateMessageBeforeSend({
      text: '',
      files: [uploadingVideo],
      permissions: defaultPermissions,
      isContinueMode: false,
      isServerCodeExecutionEnabled: false,
      isGemini3Image: false,
      isTranscribeModel: true,
      activeModelId: 'gemini-3.5-transcribe',
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

  it('allows PDF references for the 3.1 image models and Nano Banana 2.1', () => {
    const pdf = createUploadedFile({
      id: 'pdf-active',
      name: 'document.pdf',
      type: 'application/pdf',
      uploadState: 'active',
    });
    const imagePermissions = { canAcceptAttachments: true, requiresTextPrompt: true };

    for (const modelId of ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1']) {
      const result = validateMessageBeforeSend({
        text: 'Turn this document into an infographic',
        files: [pdf],
        permissions: imagePermissions,
        isContinueMode: false,
        isServerCodeExecutionEnabled: false,
        isGemini3Image: true,
        activeModelId: modelId,
        t,
      });

      expect(result, modelId).toEqual({ ok: true });
    }
  });

  it('still blocks PDF references for Gemini 3 Pro Image, which takes images only', () => {
    const pdf = createUploadedFile({
      id: 'pdf-only-pro',
      name: 'document.pdf',
      type: 'application/pdf',
      uploadState: 'active',
    });

    const result = validateMessageBeforeSend({
      text: 'Turn this document into an infographic',
      files: [pdf],
      permissions: { canAcceptAttachments: true, requiresTextPrompt: true },
      isContinueMode: false,
      isServerCodeExecutionEnabled: false,
      isGemini3Image: true,
      activeModelId: 'gemini-3-pro-image',
      t,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fileError).toBe(t('messageSenderImageModelSupportsImageOnly'));
    }
  });
});
