import {
  isAudioFile,
  isAudioMimeType,
  isImageFile,
  isImageMimeType,
  isPdfFile,
  isPdfMimeType,
  isVideoFile,
  isVideoMimeType,
} from '@/utils/file/fileTypeClassification';
import { extractYoutubeVideoId, isYoutubeUrl } from '@/utils/file/youtubeUrl';
import type { ChatMessage, ContentPart, UploadedFile } from '@/types';

export { isAudioFile, isImageFile, isPdfFile, isVideoFile };

export const isYoutubeVideoFile = (file: { name?: string; type?: string; fileUri?: string }): boolean =>
  file.type === 'video/youtube-link' || isYoutubeUrl(file.fileUri) || isYoutubeUrl(file.name);

export const isNavigableVideoFile = (file: { name?: string; type?: string; fileUri?: string }): boolean =>
  isVideoFile(file) || isYoutubeVideoFile(file);

const partMimeType = (part: ContentPart): string | undefined =>
  'inlineData' in part ? part.inlineData?.mimeType : 'fileData' in part ? part.fileData?.mimeType : undefined;

const collectDeduped = (
  selectedFiles: UploadedFile[],
  activeMessages: ChatMessage[],
  keep: (file: UploadedFile) => boolean,
): UploadedFile[] => {
  const byId = new Map<string, UploadedFile>();
  for (const file of [...selectedFiles, ...activeMessages.flatMap((m) => m.files ?? [])]) {
    if (file && keep(file) && !byId.has(file.id)) {
      byId.set(file.id, file);
    }
  }
  return [...byId.values()];
};

/**
 * Collect every PDF of the current session: pending attachments first (they are
 * what the user is about to send), then files attached to historical messages.
 * Deduplicated by file id, order preserved.
 */
const collectSessionPdfFiles = (selectedFiles: UploadedFile[], activeMessages: ChatMessage[]): UploadedFile[] =>
  collectDeduped(selectedFiles, activeMessages, isPdfFile);

/** Collect every video attachment of the current session, same ordering rules (including YouTube). */
const collectSessionVideoFiles = (selectedFiles: UploadedFile[], activeMessages: ChatMessage[]): UploadedFile[] =>
  collectDeduped(selectedFiles, activeMessages, isNavigableVideoFile);

/** Collect every audio attachment of the current session, same ordering rules. */
export const collectSessionAudioFiles = (
  selectedFiles: UploadedFile[],
  activeMessages: ChatMessage[],
): UploadedFile[] => collectDeduped(selectedFiles, activeMessages, isAudioFile);

/** Collect every image attachment of the current session, same ordering rules. */
export const collectSessionImageFiles = (
  selectedFiles: UploadedFile[],
  activeMessages: ChatMessage[],
): UploadedFile[] => collectDeduped(selectedFiles, activeMessages, isImageFile);

export const collectSessionMediaFiles = (
  selectedFiles: UploadedFile[],
  activeMessages: ChatMessage[],
): { pdfs: UploadedFile[]; videos: UploadedFile[]; audios: UploadedFile[]; images: UploadedFile[] } => ({
  pdfs: collectSessionPdfFiles(selectedFiles, activeMessages),
  videos: collectSessionVideoFiles(selectedFiles, activeMessages),
  audios: collectSessionAudioFiles(selectedFiles, activeMessages),
  images: collectSessionImageFiles(selectedFiles, activeMessages),
});

/** True when any API part carries a PDF payload (inline or Files-API reference). */
export const partsContainPdf = (parts: ContentPart[] | undefined): boolean =>
  !!parts?.some((part) => isPdfMimeType(partMimeType(part)));

/** True when any API part carries a video payload (inline, Files-API reference, or YouTube URI). */
export const partsContainVideo = (parts: ContentPart[] | undefined): boolean =>
  !!parts?.some((part) => {
    const mime = partMimeType(part);
    if (isVideoMimeType(mime)) return true;
    if ('fileData' in part && isYoutubeUrl(part.fileData?.fileUri)) return true;
    return false;
  });

/** True when any API part carries an audio payload (inline or Files-API reference). */
export const partsContainAudio = (parts: ContentPart[] | undefined): boolean =>
  !!parts?.some((part) => isAudioMimeType(partMimeType(part)));

/** True when any API part carries an image payload (inline or Files-API reference). */
export const partsContainImage = (parts: ContentPart[] | undefined): boolean =>
  !!parts?.some((part) => isImageMimeType(partMimeType(part)));

/**
 * Resolves a target file from a list given an optional locator file name
 * (from locate markers or seek URLs) and an optional active file id.
 * Handles path prefixes, case insensitivity, missing extensions, and bidirectional substring matches.
 */
export const resolveNamedFile = <T extends { id: string; name: string; fileUri?: string }>(
  files: T[],
  locateName?: string,
  activeFileId?: string | null,
): T | undefined => {
  if (files.length === 0) return undefined;

  if (locateName) {
    const raw = locateName.trim();
    const base = raw.split('/').pop()?.split('\\').pop() ?? raw;
    const lowerRaw = raw.toLowerCase();
    const lowerBase = base.toLowerCase();
    const baseWithoutExt = lowerBase.replace(/\.[^/.]+$/, '');

    // 0. YouTube Video ID or URL match
    const locateYoutubeId = extractYoutubeVideoId(raw);
    if (locateYoutubeId) {
      const matchById = files.find((file) => {
        const fileId = extractYoutubeVideoId(file.fileUri) || extractYoutubeVideoId(file.name);
        return fileId === locateYoutubeId;
      });
      if (matchById) return matchById;
    }

    const matchByUri = files.find(
      (file) => file.fileUri && (file.fileUri === raw || file.fileUri.toLowerCase() === lowerRaw),
    );
    if (matchByUri) return matchByUri;

    // 1. Exact match (raw or base name)
    const exact = files.find((file) => file.name === raw || file.name === base);
    if (exact) return exact;

    // 2. Case-insensitive exact match
    const caseExact = files.find((file) => {
      const lowerName = file.name.toLowerCase();
      return lowerName === lowerRaw || lowerName === lowerBase;
    });
    if (caseExact) return caseExact;

    // 3. Name without extension match
    const noExtMatch = files.find((file) => {
      const nameWithoutExt = file.name.toLowerCase().replace(/\.[^/.]+$/, '');
      return nameWithoutExt === baseWithoutExt;
    });
    if (noExtMatch) return noExtMatch;

    // 4. Substring / bidirectional match
    const subMatch = files.find((file) => {
      const lowerName = file.name.toLowerCase();
      const nameWithoutExt = lowerName.replace(/\.[^/.]+$/, '');
      return (
        lowerName.includes(lowerBase) ||
        lowerBase.includes(lowerName) ||
        (baseWithoutExt.length >= 3 &&
          (nameWithoutExt.includes(baseWithoutExt) || baseWithoutExt.includes(nameWithoutExt)))
      );
    });
    if (subMatch) return subMatch;
  }

  if (activeFileId) {
    const current = files.find((file) => file.id === activeFileId);
    if (current) return current;
  }

  return files[0];
};

/** Returns a human-friendly display name for a media file (e.g. "YouTube (videoId)" for YouTube links). */
export const formatMediaNavDisplayName = (file: { name: string; fileUri?: string }): string => {
  const ytId = extractYoutubeVideoId(file.fileUri) || extractYoutubeVideoId(file.name);
  if (ytId) {
    return `YouTube (${ytId})`;
  }
  return file.name;
};
