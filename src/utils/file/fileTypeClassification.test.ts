import { describe, expect, it } from 'vitest';
import {
  getFileKindFlags,
  getFileTypeCategory,
  isAudioMimeType,
  isImageMimeType,
  isMarkdownFile,
  isTextFile,
  isVideoMimeType,
} from './fileTypeClassification';

describe('fileTypeClassification', () => {
  it('classifies MIME families from one shared helper surface', () => {
    expect(isImageMimeType('image/png')).toBe(true);
    expect(isImageMimeType('image/svg+xml')).toBe(true);
    expect(isAudioMimeType('audio/mpeg')).toBe(true);
    expect(isVideoMimeType('video/mp4')).toBe(true);
    expect(getFileKindFlags({ name: 'youtube.url', type: 'video/youtube-link' }).isYoutube).toBe(true);
    expect(getFileKindFlags({ name: 'report.pdf', type: '' }).isPdf).toBe(true);
  });

  it('uses Gemini-supported media flags for inline-data eligibility', () => {
    expect(getFileKindFlags({ type: 'image/webp' }).isInlineData).toBe(true);
    expect(getFileKindFlags({ type: 'audio/wav' }).isInlineData).toBe(true);
    expect(getFileKindFlags({ type: 'audio/webm' })).toMatchObject({ isAudio: true, isInlineData: false });
    expect(getFileKindFlags({ type: 'video/webm' }).isInlineData).toBe(true);
    expect(getFileKindFlags({ type: 'application/pdf' }).isInlineData).toBe(true);
    expect(getFileKindFlags({ type: 'application/vnd.ms-excel' }).isInlineData).toBe(false);
  });

  it('returns reusable kind flags that components can consume without parsing MIME strings', () => {
    const flags = getFileKindFlags({ name: 'diagram.svg', type: 'image/svg+xml' });

    expect(flags).toMatchObject({
      category: 'image',
      isImage: true,
      isAudio: false,
      isVideo: false,
      isYoutube: false,
      isPdf: false,
      isInlineData: true,
    });
  });

  it('keeps getFileTypeCategory compatible with existing UI categories', () => {
    expect(getFileTypeCategory('video/youtube-link')).toBe('youtube');
    expect(getFileTypeCategory('application/pdf')).toBe('pdf');
    expect(getFileTypeCategory('text/plain')).toBe('text');
    expect(getFileTypeCategory('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('doc');
    expect(getFileTypeCategory('application/vnd.ms-powerpoint')).toBe('presentation');
    expect(getFileTypeCategory('application/zip')).toBe('archive');
    expect(getFileTypeCategory('application/x-unknown')).toBe('text');
    expect(getFileTypeCategory('image/png', 'upload failed')).toBe('error');
  });

  it('classifies text and Markdown files from the same helper surface', () => {
    expect(isTextFile({ name: 'notes.md', type: '' })).toBe(true);
    expect(isTextFile({ name: 'config.json', type: 'application/json' })).toBe(true);
    expect(isTextFile({ name: 'photo.png', type: 'image/png' })).toBe(false);
    expect(isMarkdownFile({ name: 'README.markdown', type: '' })).toBe(true);
    expect(isMarkdownFile({ name: 'README.txt', type: 'text/plain' })).toBe(false);
  });

  it('imports extensionless files as text without treating the whole name as an extension', () => {
    expect(isTextFile({ name: 'Dockerfile', type: '' })).toBe(true);
    expect(isTextFile({ name: 'LICENSE', type: 'application/octet-stream' })).toBe(true);
    expect(isTextFile({ name: 'sql', type: '' })).toBe(true);
    expect(isMarkdownFile({ name: 'markdown', type: '' })).toBe(false);
    expect(isTextFile({ name: 'photo', type: 'image/png' })).toBe(false);
    expect(isTextFile({ name: 'Gemini 3.8 Flash 专项核验', type: '' })).toBe(true);
    expect(isTextFile({ name: 'Gemini 3.8 Flash 专项核验', type: 'application/octet-stream' })).toBe(true);
    expect(isTextFile({ name: 'notes.md', type: '' })).toBe(true);
    expect(isTextFile({ name: 'report.pdf', type: '' })).toBe(false);
  });
});
