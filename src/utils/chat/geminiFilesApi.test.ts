import { describe, expect, it } from 'vitest';
import { createChatMessage, createChatSettings, createUploadedFile } from '@/test/data/factories';
import {
  extractFilesApiIdentifierFromError,
  formatGeminiFileApiProcessingError,
  formatHistoryFileApiUnavailablePartText,
  getApiKeyFingerprint,
  getGeminiFilesApiName,
  getGeminiFilesApiNameFromUri,
  INVALID_FILE_API_KEY_FINGERPRINT,
  invalidateFilesApiReference,
  invalidateSessionFilesApiReferences,
  isFileApiKeyMismatch,
  isFilesApiPermissionDeniedError,
  isGeminiFilesApiReferenceStillValid,
  sessionHasGeminiFilesApiReferences,
  shouldRefreshGeminiFilesApiReferenceFromExpiration,
  usesGeminiFilesApiReference,
} from './geminiFilesApi';

describe('getGeminiFilesApiNameFromUri', () => {
  it('extracts files/ names from short ids and Gemini file URIs', () => {
    expect(getGeminiFilesApiNameFromUri('files/abc')).toBe('files/abc');
    expect(getGeminiFilesApiNameFromUri('https://generativelanguage.googleapis.com/v1beta/files/abc')).toBe(
      'files/abc',
    );
  });

  it('ignores YouTube URLs even when they contain a files path', () => {
    expect(getGeminiFilesApiNameFromUri('https://youtube.com/watch?v=abc')).toBeNull();
    expect(getGeminiFilesApiNameFromUri('https://youtu.be/abc')).toBeNull();
  });
});

describe('usesGeminiFilesApiReference', () => {
  it('treats Files API ids as Gemini remote references and YouTube as not', () => {
    expect(
      usesGeminiFilesApiReference(
        createUploadedFile({ fileApiName: 'files/abc', fileUri: 'https://files/abc', transferStrategy: 'files-api' }),
      ),
    ).toBe(true);

    expect(
      usesGeminiFilesApiReference(
        createUploadedFile({
          fileUri: 'https://youtube.com/watch?v=abc',
          transferStrategy: 'files-api',
        }),
      ),
    ).toBe(false);
  });
});

describe('sessionHasGeminiFilesApiReferences', () => {
  it('detects Files API names on message files and fileData parts', () => {
    expect(
      sessionHasGeminiFilesApiReferences([
        createChatMessage({
          files: [createUploadedFile({ fileApiName: 'files/abc', fileUri: 'https://files/abc' })],
        }),
      ]),
    ).toBe(true);

    expect(
      sessionHasGeminiFilesApiReferences([
        createChatMessage({
          apiParts: [{ fileData: { mimeType: 'application/pdf', fileUri: 'files/from-parts' } }],
        }),
      ]),
    ).toBe(true);
  });

  it('ignores YouTube links, inline attachments, and omitted history files', () => {
    expect(
      sessionHasGeminiFilesApiReferences([
        createChatMessage({
          files: [
            createUploadedFile({
              fileUri: 'https://youtube.com/watch?v=abc',
              transferStrategy: 'files-api',
            }),
            createUploadedFile({
              rawFile: new Blob(['img'], { type: 'image/png' }),
              transferStrategy: 'inline',
            }),
            createUploadedFile({
              uploadState: 'failed',
              omittedFromApiHistory: true,
              transferStrategy: 'inline',
            }),
          ],
        }),
      ]),
    ).toBe(false);
  });
});

describe('expiration cache', () => {
  it('treats a far-future expiration as still valid and not due for refresh', () => {
    const file = createUploadedFile({
      fileApiExpirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    expect(isGeminiFilesApiReferenceStillValid(file)).toBe(true);
    expect(shouldRefreshGeminiFilesApiReferenceFromExpiration(file)).toBe(false);
  });

  it('treats a missing or past expiration as not still-valid', () => {
    expect(isGeminiFilesApiReferenceStillValid(createUploadedFile())).toBe(false);
    expect(
      shouldRefreshGeminiFilesApiReferenceFromExpiration(
        createUploadedFile({ fileApiExpirationTime: new Date(Date.now() - 1000).toISOString() }),
      ),
    ).toBe(true);
  });
});

describe('formatGeminiFileApiProcessingError', () => {
  it('prefers the File.error message from google.rpc.Status', () => {
    expect(
      formatGeminiFileApiProcessingError(
        { error: { code: 3, message: 'Video codec is not supported.' } },
        'File API processing failed',
        'File API processing failed: {message}',
      ),
    ).toBe('File API processing failed: Video codec is not supported.');
  });

  it('returns the backend message when no localized template is provided', () => {
    expect(
      formatGeminiFileApiProcessingError(
        { error: { message: 'Unsupported container format.' } },
        'File API processing failed',
      ),
    ).toBe('Unsupported container format.');
  });

  it('falls back when File.error is missing or blank', () => {
    expect(formatGeminiFileApiProcessingError({ state: 'FAILED' }, 'File API processing failed')).toBe(
      'File API processing failed',
    );
    expect(formatGeminiFileApiProcessingError({ error: { message: '   ' } }, 'Backend processing failed.')).toBe(
      'Backend processing failed.',
    );
    expect(formatGeminiFileApiProcessingError(null, 'File API processing failed')).toBe('File API processing failed');
  });
});

describe('formatHistoryFileApiUnavailablePartText', () => {
  it('builds a protocol-only omission note', () => {
    expect(formatHistoryFileApiUnavailablePartText('deck.pdf')).toContain('deck.pdf');
  });
});

describe('getGeminiFilesApiName', () => {
  it('prefers fileApiName over fileUri', () => {
    expect(
      getGeminiFilesApiName(
        createUploadedFile({
          fileApiName: 'files/from-name',
          fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/from-uri',
        }),
      ),
    ).toBe('files/from-name');
  });
});

describe('getApiKeyFingerprint', () => {
  it('is deterministic per key and distinguishes different keys', () => {
    expect(getApiKeyFingerprint('api-key')).toBe(getApiKeyFingerprint('api-key'));
    expect(getApiKeyFingerprint('api-key')).not.toBe(getApiKeyFingerprint('other-key'));
  });

  it('stamps fingerprint state used for key-mismatch detection', () => {
    const file = createUploadedFile({ fileApiKeyFingerprint: getApiKeyFingerprint('key-a') });
    expect(isFileApiKeyMismatch(file, 'key-a')).toBe(false);
    expect(isFileApiKeyMismatch(file, 'key-b')).toBe(true);
  });

  it('treats legacy files without a fingerprint as unchanged', () => {
    expect(isFileApiKeyMismatch(createUploadedFile({}), 'any-key')).toBe(false);
  });

  it('treats invalidated fingerprint as mismatch against any valid key', () => {
    const file = createUploadedFile({ fileApiKeyFingerprint: INVALID_FILE_API_KEY_FINGERPRINT });
    expect(isFileApiKeyMismatch(file, 'any-key')).toBe(true);
    expect(isFileApiKeyMismatch(file, 'other-key')).toBe(true);
  });
});

describe('isFilesApiPermissionDeniedError', () => {
  it('detects upstream proxy Google 403 permission denied error with file message', () => {
    const error =
      'upstream 403: 403 INTERNAL Proxy browser error: Google API returned error: 403 PERMISSION_DENIED {"error":{"code":403,"message":"You do not have permission to access the File 5aa5e27996bcaf1603af49ec6d30f7c40bac24ab or it may not exist.","status":"PERMISSION_DENIED"}}';
    expect(isFilesApiPermissionDeniedError(error)).toBe(true);
    expect(isFilesApiPermissionDeniedError(new Error(error))).toBe(true);
  });

  it('detects simple permission error on File', () => {
    expect(isFilesApiPermissionDeniedError('You do not have permission to access the File abc or it may not exist.')).toBe(true);
    expect(isFilesApiPermissionDeniedError('403 PERMISSION_DENIED: File not accessible')).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isFilesApiPermissionDeniedError('Network error')).toBe(false);
    expect(isFilesApiPermissionDeniedError('Region not supported')).toBe(false);
    expect(isFilesApiPermissionDeniedError('500 Internal Server Error')).toBe(false);
  });
});

describe('extractFilesApiIdentifierFromError', () => {
  it('extracts hex/hash file IDs from the permission denied message', () => {
    const error =
      'You do not have permission to access the File 5aa5e27996bcaf1603af49ec6d30f7c40bac24ab or it may not exist.';
    expect(extractFilesApiIdentifierFromError(error)).toBe('5aa5e27996bcaf1603af49ec6d30f7c40bac24ab');
  });

  it('extracts files/ resource names from error messages', () => {
    expect(extractFilesApiIdentifierFromError('Google API error: files/my-test-file not found')).toBe('my-test-file');
  });

  it('returns null when no file identifier is found', () => {
    expect(extractFilesApiIdentifierFromError('General 403 error')).toBeNull();
  });
});

describe('invalidateFilesApiReference', () => {
  it('stamps invalidated fingerprint and resets expiration time to epoch', () => {
    const file = createUploadedFile({
      fileApiKeyFingerprint: getApiKeyFingerprint('old-key'),
      fileApiExpirationTime: new Date(Date.now() + 86400000).toISOString(),
    });

    const invalidated = invalidateFilesApiReference(file);
    expect(invalidated.fileApiKeyFingerprint).toBe(INVALID_FILE_API_KEY_FINGERPRINT);
    expect(invalidated.fileApiExpirationTime).toBe(new Date(0).toISOString());
    expect(isFileApiKeyMismatch(invalidated, 'new-key')).toBe(true);
  });
});

describe('invalidateSessionFilesApiReferences', () => {
  it('invalidates matching file and resets lockedApiKey when permission denied error matches', () => {
    const fileA = createUploadedFile({
      id: 'f1',
      fileApiName: 'files/5aa5e27996bcaf1603af49ec6d30f7c40bac24ab',
      fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/5aa5e27996bcaf1603af49ec6d30f7c40bac24ab',
      fileApiKeyFingerprint: getApiKeyFingerprint('key-1'),
      fileApiExpirationTime: new Date(Date.now() + 86400000).toISOString(),
    });
    const fileB = createUploadedFile({
      id: 'f2',
      fileApiName: 'files/other-file',
      fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/other-file',
      fileApiKeyFingerprint: getApiKeyFingerprint('key-1'),
      fileApiExpirationTime: new Date(Date.now() + 86400000).toISOString(),
    });

    const session = {
      id: 's1',
      title: 'Test',
      timestamp: 1,
      settings: createChatSettings({ lockedApiKey: 'key-1' }),
      messages: [
        createChatMessage({
          role: 'user',
          files: [fileA, fileB],
        }),
      ],
    };

    const error =
      'You do not have permission to access the File 5aa5e27996bcaf1603af49ec6d30f7c40bac24ab or it may not exist.';
    const updated = invalidateSessionFilesApiReferences(session, error);

    expect(updated.settings.lockedApiKey).toBeNull();
    const updatedFileA = updated.messages[0].files![0];
    const updatedFileB = updated.messages[0].files![1];

    expect(updatedFileA.fileApiKeyFingerprint).toBe(INVALID_FILE_API_KEY_FINGERPRINT);
    expect(updatedFileA.fileApiExpirationTime).toBe(new Date(0).toISOString());

    // fileB does not match the specific identifier, so it stays untouched
    expect(updatedFileB.fileApiKeyFingerprint).toBe(getApiKeyFingerprint('key-1'));
  });

  it('invalidates all Files API files if error has no specific file identifier', () => {
    const fileA = createUploadedFile({
      id: 'f1',
      fileApiName: 'files/file-1',
      fileApiKeyFingerprint: getApiKeyFingerprint('key-1'),
    });
    const session = {
      id: 's1',
      title: 'Test',
      timestamp: 1,
      settings: createChatSettings({ lockedApiKey: 'key-1' }),
      messages: [
        createChatMessage({
          role: 'user',
          files: [fileA],
        }),
      ],
    };

    const error = '403 PERMISSION_DENIED: File cannot be accessed by caller';
    const updated = invalidateSessionFilesApiReferences(session, error);

    expect(updated.settings.lockedApiKey).toBeNull();
    expect(updated.messages[0].files![0].fileApiKeyFingerprint).toBe(INVALID_FILE_API_KEY_FINGERPRINT);
  });

  it('returns original session when error is not permission denied', () => {
    const session = {
      id: 's1',
      title: 'Test',
      timestamp: 1,
      settings: createChatSettings({ lockedApiKey: 'key-1' }),
      messages: [],
    };

    const updated = invalidateSessionFilesApiReferences(session, new Error('Network timeout'));
    expect(updated).toBe(session);
  });
});

