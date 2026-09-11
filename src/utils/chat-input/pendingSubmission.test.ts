import { describe, expect, it } from 'vitest';
import { createUploadedFile } from '@/test/data/factories';
import type { UploadedFile } from '@/types';
import {
  getBlockingFileUploadFailure,
  buildPendingChatInputSubmission,
  buildQueuedChatInputSubmission,
  shouldFlushPendingSubmission,
} from './pendingSubmission';

const makeFile = (overrides: Partial<UploadedFile> = {}) =>
  createUploadedFile({ name: 'file.png', size: 100, ...overrides });

describe('buildPendingChatInputSubmission', () => {
  it('captures a send snapshot with formatted text and fast mode', () => {
    expect(
      buildPendingChatInputSubmission({
        inputText: 'Explain this image.',
        quotes: ['first line'],
        modelId: 'gemini-3.1-pro-preview',
        isEditing: false,
        editMode: 'resend',
        editingMessageId: null,
        isFastMode: true,
      }),
    ).toEqual({
      kind: 'send',
      textToSend: '> first line\n\nExplain this image.',
      isFastMode: true,
    });
  });

  it('captures an edit snapshot instead of a send snapshot for update mode', () => {
    expect(
      buildPendingChatInputSubmission({
        inputText: 'Revised content',
        quotes: [],
        modelId: 'gemini-3.1-pro-preview',
        isEditing: true,
        editMode: 'update',
        editingMessageId: 'message-1',
        isFastMode: false,
      }),
    ).toEqual({
      kind: 'edit',
      messageId: 'message-1',
      content: 'Revised content',
      files: [],
    });
  });
});

describe('buildQueuedChatInputSubmission', () => {
  it('captures a queued send snapshot with both display text and send text', () => {
    expect(
      buildQueuedChatInputSubmission({
        sessionId: 'session-1',
        inputText: 'Follow up after this.',
        quotes: ['quoted line'],
        modelId: 'gemini-3.1-pro-preview',
        files: [makeFile()],
        isFastMode: false,
      }),
    ).toMatchObject({
      sessionId: 'session-1',
      inputText: 'Follow up after this.',
      textToSend: '> quoted line\n\nFollow up after this.',
      files: [makeFile()],
      quotes: ['quoted line'],
      isFastMode: false,
    });
  });
});

describe('shouldFlushPendingSubmission', () => {
  it('flushes only when a pending submission exists and processing transitions to ready', () => {
    expect(
      shouldFlushPendingSubmission({
        pendingSubmission: {
          kind: 'send',
          textToSend: 'hello',
          isFastMode: false,
        },
        previousFiles: [makeFile({ id: 'processing', isProcessing: true })],
        currentFiles: [makeFile({ id: 'processing', isProcessing: false })],
      }),
    ).toBe(true);
  });

  it('does not flush while any file is still processing', () => {
    expect(
      shouldFlushPendingSubmission({
        pendingSubmission: {
          kind: 'send',
          textToSend: 'hello',
          isFastMode: false,
        },
        previousFiles: [makeFile({ id: 'processing', isProcessing: true })],
        currentFiles: [makeFile({ id: 'processing', isProcessing: true })],
      }),
    ).toBe(false);
  });

  it('does not flush without a pending submission marker', () => {
    expect(
      shouldFlushPendingSubmission({
        pendingSubmission: null,
        previousFiles: [makeFile({ id: 'processing', isProcessing: true })],
        currentFiles: [makeFile({ id: 'processing', isProcessing: false })],
      }),
    ).toBe(false);
  });
});

describe('getBlockingFileUploadFailure', () => {
  it('returns null when files finish successfully', () => {
    expect(
      getBlockingFileUploadFailure([makeFile({ id: 'ready', uploadState: 'active', isProcessing: false })]),
    ).toBeNull();
  });

  it('returns the failed file when a pending send waited for an upload that failed', () => {
    const failedFile = makeFile({
      id: 'failed',
      name: 'broken.pdf',
      uploadState: 'failed',
      isProcessing: false,
      error: 'Backend processing failed.',
    });

    expect(getBlockingFileUploadFailure([failedFile, makeFile({ id: 'ready' })])).toEqual(failedFile);
  });

  it('treats cancelled files as blocking a pending automatic send', () => {
    const cancelledFile = makeFile({
      id: 'cancelled',
      name: 'cancelled.mp4',
      uploadState: 'cancelled',
      isProcessing: false,
    });

    expect(getBlockingFileUploadFailure([cancelledFile])).toEqual(cancelledFile);
  });
});
