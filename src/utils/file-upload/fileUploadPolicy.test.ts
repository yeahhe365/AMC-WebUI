import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import type { AppSettings, ChatProviderId } from '@/types';
import {
  buildFileUploadPreflight,
  checkBatchNeedsApiKey,
  getEffectiveMimeType,
  getFilesRequiringFileApi,
  shouldUseFileApi,
} from './fileUploadPolicy';

const createFile = (name: string, type: string, size: number) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { configurable: true, value: size });
  return file;
};

const makeSettings = (overrides?: Partial<AppSettings>): AppSettings => ({
  ...DEFAULT_APP_SETTINGS,
  filesApiConfig: {
    images: false,
    pdfs: false,
    audio: false,
    video: false,
    text: false,
  },
  ...overrides,
});

const THIRD_PARTY_PROVIDER: ChatProviderId = 'openai';

describe('third-party sessions never use the Gemini Files API', () => {
  it('inlines text even when the text-upload preference is on', () => {
    const settings = makeSettings({
      filesApiConfig: { images: false, pdfs: false, audio: false, video: false, text: true },
    });

    expect(shouldUseFileApi(createFile('notes.txt', 'text/plain', 1024), settings, THIRD_PARTY_PROVIDER)).toBe(false);
  });

  it('inlines oversized text with code execution on', () => {
    const settings = makeSettings({
      isCodeExecutionEnabled: true,
      isLocalPythonEnabled: false,
    });

    expect(shouldUseFileApi(createFile('big.txt', 'text/plain', 3 * 1024 * 1024), settings, THIRD_PARTY_PROVIDER)).toBe(
      false,
    );
  });

  it('inlines files that would otherwise exceed the inline payload cap', () => {
    const settings = makeSettings();

    expect(
      shouldUseFileApi(createFile('huge.mp4', 'video/mp4', 101 * 1024 * 1024), settings, THIRD_PARTY_PROVIDER),
    ).toBe(false);
    expect(
      getFilesRequiringFileApi(
        [createFile('huge.txt', 'text/plain', 101 * 1024 * 1024)],
        settings,
        THIRD_PARTY_PROVIDER,
      ).size,
    ).toBe(0);
  });

  it('never asks for an API key for a third-party batch', () => {
    const settings = makeSettings();
    const files = [createFile('huge.txt', 'text/plain', 101 * 1024 * 1024)];

    expect(checkBatchNeedsApiKey(files, settings, THIRD_PARTY_PROVIDER)).toBe(false);
  });

  // Regression: the decision must follow the SESSION providerId, not a global
  // appSettings mode. The new policy reads only the providerId argument, so
  // this is structurally guaranteed; the test locks the contract.
  it('regression: inlines when the session routes third-party', () => {
    const settings = makeSettings();

    expect(shouldUseFileApi(createFile('notes.txt', 'text/plain', 1024), settings, THIRD_PARTY_PROVIDER)).toBe(false);
  });

  it('leaves the Gemini-native path unchanged when no session providerId is given', () => {
    const settings = makeSettings({
      filesApiConfig: { images: false, pdfs: false, audio: false, video: false, text: true },
    });

    expect(shouldUseFileApi(createFile('notes.txt', 'text/plain', 1024), settings)).toBe(true);
  });
});

describe('file upload strategy limits', () => {
  it('preserves specific text MIME types for structured text files', () => {
    const file = createFile('dataset.csv', 'text/csv', 1024);

    expect(getEffectiveMimeType(file)).toBe('text/csv');
  });

  it('infers a specific MIME type from text-based file extensions when the browser omits it', () => {
    const file = createFile('script.py', '', 1024);

    expect(getEffectiveMimeType(file)).toBe('text/x-python');
  });

  it('imports extensionless files as text/plain when the browser leaves MIME empty or generic', () => {
    expect(getEffectiveMimeType(createFile('Dockerfile', '', 1024))).toBe('text/plain');
    expect(getEffectiveMimeType(createFile('LICENSE', 'application/octet-stream', 1024))).toBe('text/plain');
    expect(getEffectiveMimeType(createFile('Gemini 3.8 Flash 专项核验', '', 1024))).toBe('text/plain');
  });

  it('keeps a real media MIME type even when the filename has no suffix', () => {
    expect(getEffectiveMimeType(createFile('photo', 'image/png', 1024))).toBe('image/png');
  });

  it('forces text/code files onto the Files API earlier when server-side code execution is enabled', () => {
    const settings = makeSettings({
      isCodeExecutionEnabled: true,
      isLocalPythonEnabled: false,
    });
    const file = createFile('dataset.csv', 'text/csv', 3 * 1024 * 1024);

    expect(shouldUseFileApi(file, settings)).toBe(true);
  });

  it('forces oversized PDFs onto the Files API even when inline is preferred', () => {
    const settings = makeSettings();
    const file = createFile('report.pdf', 'application/pdf', 51 * 1024 * 1024);

    expect(shouldUseFileApi(file, settings)).toBe(true);
  });

  it('forces oversized non-PDF payloads onto the Files API even when inline is preferred', () => {
    const settings = makeSettings();
    const file = createFile('clip.mp4', 'video/mp4', 101 * 1024 * 1024);

    expect(shouldUseFileApi(file, settings)).toBe(true);
  });

  it('forces binary files onto the Files API when base64 expansion pushes the inline payload past 100MB', () => {
    const settings = makeSettings();
    const file = createFile('clip.mp4', 'video/mp4', 76 * 1024 * 1024);

    expect(shouldUseFileApi(file, settings)).toBe(true);
  });

  it('promotes an inline batch to the Files API when the combined payload exceeds 100MB', () => {
    const settings = makeSettings();
    const first = createFile('frame-1.png', 'image/png', 60 * 1024 * 1024);
    const second = createFile('frame-2.png', 'image/png', 45 * 1024 * 1024);

    const filesRequiringApi = getFilesRequiringFileApi([first, second], settings);

    expect(filesRequiringApi.has(first)).toBe(true);
    expect(filesRequiringApi.has(second)).toBe(true);
    expect(checkBatchNeedsApiKey([first, second], settings)).toBe(true);
  });

  it('promotes an inline batch when encoded payload size exceeds 100MB even if raw bytes do not', () => {
    const settings = makeSettings();
    const first = createFile('frame-1.png', 'image/png', 38 * 1024 * 1024);
    const second = createFile('frame-2.png', 'image/png', 38 * 1024 * 1024);

    const filesRequiringApi = getFilesRequiringFileApi([first, second], settings);

    expect(filesRequiringApi.has(first)).toBe(true);
    expect(filesRequiringApi.has(second)).toBe(true);
    expect(checkBatchNeedsApiKey([first, second], settings)).toBe(true);
  });
});

describe('buildFileUploadPreflight', () => {
  it('skips duplicate incoming files while preserving the first occurrence', () => {
    const settings = makeSettings();
    const existingFile = {
      id: 'existing',
      name: 'report.pdf',
      type: 'application/pdf',
      size: 1024,
    };
    const duplicateOfExisting = createFile('report.pdf', 'application/pdf', 1024);
    const duplicateOne = createFile('photo.png', 'image/png', 2048);
    const duplicateTwo = createFile('photo.png', 'image/png', 2048);

    const result = buildFileUploadPreflight([duplicateOfExisting, duplicateOne, duplicateTwo], settings, [
      existingFile,
    ]);

    expect(result.filesToUpload).toEqual([duplicateOne]);
    expect(result.notice).toContain('Skipped duplicate files: report.pdf, photo.png');
  });

  it('surfaces unsupported file types before upload starts', () => {
    const settings = makeSettings();
    const unsupported = createFile('archive.rar', 'application/vnd.rar', 4096);

    const result = buildFileUploadPreflight([unsupported], settings, []);

    expect(result.filesToUpload).toEqual([unsupported]);
    expect(result.notice).toContain('Unsupported file types: archive.rar');
  });

  it('does not flag extensionless files as unsupported', () => {
    const settings = makeSettings();
    const makefile = createFile('Makefile', '', 4096);

    const result = buildFileUploadPreflight([makefile], settings, []);

    expect(result.filesToUpload).toEqual([makefile]);
    expect(result.notice).toBeNull();
  });

  it('surfaces audio MIME types that Gemini does not support', () => {
    const settings = makeSettings();
    const unsupportedAudio = createFile('voice.webm', 'audio/webm', 4096);

    const result = buildFileUploadPreflight([unsupportedAudio], settings, []);

    expect(result.filesToUpload).toEqual([unsupportedAudio]);
    expect(result.notice).toContain('Unsupported file types: voice.webm');
  });

  it('keeps generated-only archive and presentation MIME types out of the upload support set', () => {
    const settings = makeSettings();
    const archive = createFile('output.zip', 'application/zip', 4096);
    const presentation = createFile(
      'slides.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      4096,
    );

    const result = buildFileUploadPreflight([archive, presentation], settings, []);

    expect(result.notice).toContain('Unsupported file types: output.zip, slides.pptx');
  });
});
