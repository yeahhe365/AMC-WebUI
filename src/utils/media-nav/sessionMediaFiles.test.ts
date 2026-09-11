import { describe, expect, it } from 'vitest';
import type { ChatMessage, UploadedFile } from '@/types';
import {
  collectSessionAudioFiles,
  collectSessionImageFiles,
  collectSessionMediaFiles,
  isAudioFile,
  isImageFile,
  isPdfFile,
  isVideoFile,
  isYoutubeVideoFile,
  isNavigableVideoFile,
  partsContainAudio,
  partsContainImage,
  partsContainPdf,
  partsContainVideo,
  resolveNamedFile,
  formatMediaNavDisplayName,
} from './sessionMediaFiles';

const makeFile = (overrides: Partial<UploadedFile> = {}): UploadedFile => ({
  id: 'f1',
  name: 'doc.pdf',
  type: 'application/pdf',
  size: 10,
  ...overrides,
});

const makeMessage = (files?: UploadedFile[]): ChatMessage => ({
  id: 'm1',
  role: 'user',
  content: '',
  timestamp: new Date(),
  files,
});

describe('file kind detection', () => {
  it('detects pdfs by mime type or extension', () => {
    expect(isPdfFile(makeFile())).toBe(true);
    expect(isPdfFile(makeFile({ type: '', name: 'x.PDF' }))).toBe(true);
    expect(isPdfFile(makeFile({ type: 'image/png', name: 'x.png' }))).toBe(false);
  });

  it('detects videos and audios by mime type', () => {
    expect(isVideoFile(makeFile({ type: 'video/mp4', name: 'clip' }))).toBe(true);
    expect(isVideoFile(makeFile({ type: 'application/pdf' }))).toBe(false);
    expect(isVideoFile(makeFile({ type: 'application/octet-stream', name: 'clip.mp4' }))).toBe(true);
    expect(isVideoFile(makeFile({ type: '', name: 'clip.mkv' }))).toBe(true);
    expect(isAudioFile(makeFile({ type: 'audio/mpeg', name: 'track' }))).toBe(true);
    expect(isAudioFile(makeFile({ type: 'application/octet-stream', name: 'voice.m4a' }))).toBe(true);
    expect(isAudioFile(makeFile({ type: 'image/png' }))).toBe(false);
    expect(isImageFile(makeFile({ type: 'image/png', name: 'photo' }))).toBe(true);
    expect(isImageFile(makeFile({ type: 'application/octet-stream', name: 'photo.JPG' }))).toBe(true);
    expect(isImageFile(makeFile({ type: 'video/mp4' }))).toBe(false);
  });
});

describe('collectSessionMediaFiles', () => {
  it('dedupes by id with selected files first, split by kind', () => {
    const draftPdf = makeFile({ id: 'a', name: 'draft.pdf' });
    const historyPdf = makeFile({ id: 'b', name: 'history.pdf' });
    const video = makeFile({ id: 'v', name: 'clip.mp4', type: 'video/mp4' });
    const audio = makeFile({ id: 'm', name: 'take.mp3', type: 'audio/mpeg' });
    const image = makeFile({ id: 'c', name: 'pic.png', type: 'image/png' });
    const messages = [makeMessage([historyPdf, draftPdf, video, audio, image])];
    const { pdfs, videos, audios, images } = collectSessionMediaFiles([draftPdf], messages);
    expect(pdfs.map((file) => file.id)).toEqual(['a', 'b']);
    expect(videos.map((file) => file.id)).toEqual(['v']);
    expect(audios.map((file) => file.id)).toEqual(['m']);
    expect(images.map((file) => file.id)).toEqual(['c']);
    expect(collectSessionAudioFiles([], messages)).toHaveLength(1);
    expect(collectSessionImageFiles([], messages)).toHaveLength(1);
  });

  it('returns empty for a session without media', () => {
    expect(collectSessionMediaFiles([], [makeMessage([])])).toEqual({ pdfs: [], videos: [], audios: [], images: [] });
  });
});

describe('partsContain', () => {
  it('detects inline and file-data PDF parts', () => {
    expect(partsContainPdf([{ inlineData: { mimeType: 'application/pdf', data: 'x' } }])).toBe(true);
    expect(partsContainPdf([{ fileData: { mimeType: 'application/pdf', fileUri: 'uri' } } as never])).toBe(true);
    expect(partsContainPdf([{ inlineData: { mimeType: 'image/png', data: 'x' } }])).toBe(false);
    expect(partsContainPdf(undefined)).toBe(false);
  });

  it('detects video parts', () => {
    expect(partsContainVideo([{ inlineData: { mimeType: 'video/mp4', data: 'x' } }])).toBe(true);
    expect(partsContainVideo([{ fileData: { mimeType: 'video/webm', fileUri: 'uri' } } as never])).toBe(true);
    expect(partsContainVideo([{ inlineData: { mimeType: 'application/pdf', data: 'x' } }])).toBe(false);
    expect(partsContainVideo(undefined)).toBe(false);
  });

  it('detects audio parts', () => {
    expect(partsContainAudio([{ inlineData: { mimeType: 'audio/mpeg', data: 'x' } }])).toBe(true);
    expect(partsContainAudio([{ fileData: { mimeType: 'audio/wav', fileUri: 'uri' } } as never])).toBe(true);
    expect(partsContainAudio([{ inlineData: { mimeType: 'video/mp4', data: 'x' } }])).toBe(false);
    expect(partsContainAudio(undefined)).toBe(false);
  });

  it('detects image parts', () => {
    expect(partsContainImage([{ inlineData: { mimeType: 'image/png', data: 'x' } }])).toBe(true);
    expect(partsContainImage([{ fileData: { mimeType: 'image/jpeg', fileUri: 'uri' } } as never])).toBe(true);
    expect(partsContainImage([{ inlineData: { mimeType: 'application/pdf', data: 'x' } }])).toBe(false);
    expect(partsContainImage(undefined)).toBe(false);
  });
});

describe('resolveNamedFile', () => {
  const files = [
    makeFile({ id: 'f1', name: '2024 Financial Report.pdf' }),
    makeFile({ id: 'f2', name: 'diagram_architecture.png', type: 'image/png' }),
    makeFile({ id: 'f3', name: 'keynote_presentation.mp4', type: 'video/mp4' }),
  ];

  it('returns undefined on empty file list', () => {
    expect(resolveNamedFile([])).toBeUndefined();
  });

  it('resolves exact match', () => {
    expect(resolveNamedFile(files, '2024 Financial Report.pdf')?.id).toBe('f1');
  });

  it('resolves case-insensitively', () => {
    expect(resolveNamedFile(files, 'DIAGRAM_ARCHITECTURE.PNG')?.id).toBe('f2');
  });

  it('resolves when path prefixes are present in the locator name', () => {
    expect(resolveNamedFile(files, '/workspace/docs/2024 Financial Report.pdf')?.id).toBe('f1');
    expect(resolveNamedFile(files, 'C:\\Users\\admin\\keynote_presentation.mp4')?.id).toBe('f3');
  });

  it('resolves when file extension is omitted in locateName', () => {
    expect(resolveNamedFile(files, 'diagram_architecture')?.id).toBe('f2');
  });

  it('resolves when file list has no extension but locateName includes it', () => {
    const filesNoExt = [makeFile({ id: 'no-ext', name: 'annual_summary' })];
    expect(resolveNamedFile(filesNoExt, 'annual_summary.pdf')?.id).toBe('no-ext');
  });

  it('resolves by substring match', () => {
    expect(resolveNamedFile(files, 'Financial Report')?.id).toBe('f1');
    expect(resolveNamedFile(files, 'keynote')?.id).toBe('f3');
  });

  it('falls back to activeFileId when no locateName is provided', () => {
    expect(resolveNamedFile(files, undefined, 'f2')?.id).toBe('f2');
  });

  it('falls back to first file when locator does not match and no activeFileId', () => {
    expect(resolveNamedFile(files, 'non-existent-doc.pdf')?.id).toBe('f1');
  });

  it('resolves YouTube videos by URL or Video ID', () => {
    const ytFile = makeFile({
      id: 'yt-1',
      name: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      type: 'video/youtube-link',
      fileUri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    const mediaFiles = [...files, ytFile];

    expect(resolveNamedFile(mediaFiles, 'dQw4w9WgXcQ')?.id).toBe('yt-1');
    expect(resolveNamedFile(mediaFiles, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.id).toBe('yt-1');
    expect(resolveNamedFile(mediaFiles, 'youtu.be/dQw4w9WgXcQ')?.id).toBe('yt-1');
  });
});

describe('YouTube navigable video support', () => {
  it('identifies YouTube files as navigable videos', () => {
    const yt1 = makeFile({ type: 'video/youtube-link', name: 'https://youtube.com/watch?v=abc12345678' });
    const yt2 = makeFile({ type: '', fileUri: 'https://youtu.be/abc12345678' });
    const localVideo = makeFile({ type: 'video/mp4', name: 'clip.mp4' });
    const notVideo = makeFile({ type: 'image/png', name: 'img.png' });

    expect(isYoutubeVideoFile(yt1)).toBe(true);
    expect(isYoutubeVideoFile(yt2)).toBe(true);
    expect(isYoutubeVideoFile(localVideo)).toBe(false);

    expect(isNavigableVideoFile(yt1)).toBe(true);
    expect(isNavigableVideoFile(yt2)).toBe(true);
    expect(isNavigableVideoFile(localVideo)).toBe(true);
    expect(isNavigableVideoFile(notVideo)).toBe(false);
  });

  it('collects YouTube videos into videos array in collectSessionMediaFiles', () => {
    const yt = makeFile({
      id: 'yt-1',
      name: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      type: 'video/youtube-link',
      fileUri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    const local = makeFile({ id: 'v-1', name: 'clip.mp4', type: 'video/mp4' });
    const { videos } = collectSessionMediaFiles([yt], [makeMessage([local])]);

    expect(videos.map((v) => v.id)).toEqual(['yt-1', 'v-1']);
  });

  it('detects YouTube fileData in partsContainVideo', () => {
    expect(partsContainVideo([{ fileData: { fileUri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } } as never])).toBe(
      true,
    );
  });

  describe('formatMediaNavDisplayName', () => {
    it('formats YouTube URLs as YouTube (videoId)', () => {
      expect(formatMediaNavDisplayName({ name: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })).toBe(
        'YouTube (dQw4w9WgXcQ)',
      );
      expect(
        formatMediaNavDisplayName({
          name: 'raw-upload.mp4',
          fileUri: 'https://youtu.be/dQw4w9WgXcQ',
        }),
      ).toBe('YouTube (dQw4w9WgXcQ)');
    });

    it('returns regular file name for standard files', () => {
      expect(formatMediaNavDisplayName({ name: 'summary.pdf' })).toBe('summary.pdf');
      expect(formatMediaNavDisplayName({ name: 'clip.mp4' })).toBe('clip.mp4');
    });
  });
});
