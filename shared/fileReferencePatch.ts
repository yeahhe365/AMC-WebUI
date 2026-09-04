/**
 * Shared reset patch for a chat file whose Files-API reference can no longer
 * be resolved while replaying history (expired / unavailable): marks the
 * upload as failed and forces inline-transfer omission semantics.
 *
 * Only pure data lives here — the human-readable `error` text is composed by
 * callers so i18n stays outside shared/.
 */
export interface FileReferenceUnavailablePatch {
  fileUri: undefined;
  fileApiName: undefined;
  fileApiExpirationTime: undefined;
  uploadState: 'failed';
  isProcessing: false;
  transferStrategy: 'inline';
  omittedFromApiHistory: true;
  error: string;
}

export const createFileReferenceUnavailablePatch = (unavailableErrorText: string): FileReferenceUnavailablePatch => ({
  fileUri: undefined,
  fileApiName: undefined,
  fileApiExpirationTime: undefined,
  uploadState: 'failed',
  isProcessing: false,
  transferStrategy: 'inline',
  omittedFromApiHistory: true,
  error: unavailableErrorText,
});
