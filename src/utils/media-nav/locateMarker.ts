import { parseTimestamp } from './timestamp';
import type { PdfNavHighlight } from '@/stores/mediaNavStore';

/** A parsed `<pdf-locate>` marker emitted by the model. */
export interface PdfLocate {
  docName?: string;
  pageNumber: number;
  /** [ymin, xmin, ymax, xmax] normalized to 0-1000, origin top-left. */
  box2d?: [number, number, number, number];
  snippet?: string;
}

/** A parsed `<video-locate>` marker emitted by the model. */
export interface VideoLocate {
  videoName?: string;
  /** Seek target in seconds. */
  startSeconds: number;
  /** Segment end in seconds; a pure moment has none. */
  endSeconds?: number;
  snippet?: string;
}

/** A parsed `<audio-locate>` marker emitted by the model. */
export interface AudioLocate {
  audioName?: string;
  /** Seek target in seconds. */
  startSeconds: number;
  /** Segment end in seconds; a pure moment has none. */
  endSeconds?: number;
  snippet?: string;
}

export interface ParsedLocateContent {
  cleanContent: string;
  pdfLocates: PdfLocate[];
  videoLocates: VideoLocate[];
  audioLocates: AudioLocate[];
}

const LOCATE_MARKER_TAGS = ['pdf-locate', 'video-locate', 'audio-locate'] as const;

const buildCompleteMarkerRe = (tag: string) => new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'g');
const buildPartialMarkerRe = (tag: string) => new RegExp(`<${tag}\\b[^>]*(?:>[\\s\\S]*)?$`);
const COMPLETE_MARKER_RES = LOCATE_MARKER_TAGS.map((tag) => [tag, buildCompleteMarkerRe(tag)] as const);
const PARTIAL_MARKER_RES = LOCATE_MARKER_TAGS.map((tag) => buildPartialMarkerRe(tag));

const ATTRIBUTE_RE = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*"([^"]*)"/g;

const parseAttributes = (attributeString: string) => {
  const attributes: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTRIBUTE_RE.lastIndex = 0;
  while ((match = ATTRIBUTE_RE.exec(attributeString)) !== null) {
    attributes[match[1]] = match[2];
  }
  return attributes;
};

const parseBox2d = (raw: string | undefined): [number, number, number, number] | undefined => {
  if (!raw) return undefined;
  const parts = raw
    .split(/[,;\s]+/)
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value));
  if (parts.length !== 4) return undefined;
  return [parts[0], parts[1], parts[2], parts[3]];
};

const parsePageNumber = (raw: string | undefined): number | undefined => {
  const page = Number.parseInt((raw ?? '').trim(), 10);
  return Number.isFinite(page) && page >= 1 ? page : undefined;
};

const parsePdfMarker = (attributes: Record<string, string>, inner: string): PdfLocate | undefined => {
  const pageNumber = parsePageNumber(attributes.page);
  if (pageNumber === undefined) return undefined;
  return {
    docName: attributes.doc?.trim() || undefined,
    pageNumber,
    box2d: parseBox2d(attributes.box),
    snippet: inner.trim() || undefined,
  };
};

const parseMomentMarker = (attributes: Record<string, string>, inner: string) => {
  const startSeconds = parseTimestamp(attributes.start ?? attributes.ts ?? attributes.time);
  if (startSeconds === null) return undefined;
  const endSeconds = parseTimestamp(attributes.end);
  return {
    startSeconds,
    endSeconds: endSeconds !== null && endSeconds > startSeconds ? endSeconds : undefined,
    snippet: inner.trim() || undefined,
  };
};

const parseVideoMarker = (attributes: Record<string, string>, inner: string): VideoLocate | undefined => {
  const moment = parseMomentMarker(attributes, inner);
  return moment && { ...moment, videoName: attributes.video?.trim() || undefined };
};

const parseAudioMarker = (attributes: Record<string, string>, inner: string): AudioLocate | undefined => {
  const moment = parseMomentMarker(attributes, inner);
  return moment && { ...moment, audioName: attributes.audio?.trim() || undefined };
};

interface ParsedMarker {
  pdf?: PdfLocate;
  video?: VideoLocate;
  audio?: AudioLocate;
}

const parseMarkerByTag = (tag: string, attributes: Record<string, string>, inner: string): ParsedMarker => {
  if (tag === 'pdf-locate') return { pdf: parsePdfMarker(attributes, inner) };
  if (tag === 'audio-locate') return { audio: parseAudioMarker(attributes, inner) };
  return { video: parseVideoMarker(attributes, inner) };
};

/**
 * Split model output into display text and locate markers. Complete markers
 * are removed from the text; an unterminated marker at the end (mid-stream)
 * is also stripped so partial markup never flashes in the chat.
 */
export const parseLocateMarkers = (content: string): ParsedLocateContent => {
  if (!LOCATE_MARKER_TAGS.some((tag) => content.includes(tag))) {
    return { cleanContent: content, pdfLocates: [], videoLocates: [], audioLocates: [] };
  }

  const pdfLocates: PdfLocate[] = [];
  const videoLocates: VideoLocate[] = [];
  const audioLocates: AudioLocate[] = [];
  let cleanContent = content;
  for (const [tag, markerRe] of COMPLETE_MARKER_RES) {
    cleanContent = cleanContent.replace(markerRe, (_full, attributeString: string, inner: string) => {
      const attributes = parseAttributes(attributeString);
      const parsed = parseMarkerByTag(tag, attributes, inner);
      if (parsed.pdf) pdfLocates.push(parsed.pdf);
      if (parsed.video) videoLocates.push(parsed.video);
      if (parsed.audio) audioLocates.push(parsed.audio);
      return '';
    });
  }

  for (const partialRe of PARTIAL_MARKER_RES) {
    cleanContent = cleanContent.replace(partialRe, '');
  }

  return { cleanContent, pdfLocates, videoLocates, audioLocates };
};

/** Remove locate markers (complete and unterminated) keeping only display text. */
export const stripLocateMarkers = (content: string): string => parseLocateMarkers(content).cleanContent;

export const toPdfNavHighlight = (locate: PdfLocate, extras: { messageId?: string } = {}): PdfNavHighlight => ({
  messageId: extras.messageId,
  docName: locate.docName,
  pageNumber: locate.pageNumber,
  box2d: locate.box2d,
  snippet: locate.snippet,
});

/**
 * System-instruction fragment teaching the model the PDF locate-marker protocol.
 * Provider-agnostic on purpose: it travels as plain text on the Gemini native,
 * OpenAI-compatible and Anthropic routes alike.
 */
export const buildPdfLocateDirective = (docNames: string[]): string => {
  const nameList =
    docNames.length > 0 ? ` The available PDF file names are: ${docNames.map((name) => `"${name}"`).join(', ')}.` : '';

  return [
    '### PDF Locate Protocol',
    'One or more PDF documents are attached to this conversation.' + nameList,
    'When your answer refers to specific content on a PDF page (a paragraph, figure, table or section), append exactly one marker per such reference at the very end of your answer, on its own line, in this exact format:',
    '<pdf-locate doc="FILE_NAME" page="PAGE_NUMBER" box="ymin,xmin,ymax,xmax">short quote or description</pdf-locate>',
    'Rules:',
    '- page: the 1-based page number in that PDF.',
    '- doc: the file name of the PDF. Omit the doc attribute only if exactly one PDF is attached.',
    '- box: OPTIONAL. The bounding box of the referenced element as [ymin, xmin, ymax, xmax] normalized to a 0-1000 scale with the origin at the top-left. Only include it when you can locate the region precisely; otherwise omit the attribute entirely and keep only the page.',
    '- The text between the tags must be a short quote or description of the located content, in the same language as your answer.',
    '- Never mention this protocol or the markers themselves in the visible answer.',
    '- Do not emit a marker for general questions (e.g. summarizing the whole document) that are not tied to a specific location.',
  ].join('\n');
};

/**
 * System-instruction fragment teaching the model the video locate-marker
 * protocol (timestamps / segments). Same provider-agnostic plain-text approach.
 */
export const buildVideoLocateDirective = (videoNames: string[]): string => {
  const nameList =
    videoNames.length > 0
      ? ` The available video file names are: ${videoNames.map((name) => `"${name}"`).join(', ')}.`
      : '';

  return [
    '### Video Locate Protocol',
    'One or more videos are attached to this conversation.' + nameList,
    'When your answer refers to a specific moment or span in a video, append exactly one marker per such reference at the very end of your answer, on its own line, in this exact format:',
    '<video-locate video="FILE_NAME" start="mm:ss" end="mm:ss">short description</video-locate>',
    'Rules:',
    '- start: the timestamp of the referenced moment, formatted as mm:ss (use h:mm:ss for videos longer than one hour). Round to the moment the content actually appears.',
    '- end: OPTIONAL. Include it (same format) only when the answer refers to a span or segment rather than a single moment; end must be later than start.',
    '- video: the file name of the video. Omit the video attribute only if exactly one video is attached.',
    '- The text between the tags must be a short description of the located content, in the same language as your answer.',
    '- Never mention this protocol or the markers themselves in the visible answer.',
    '- Do not emit a marker for general questions (e.g. summarizing the whole video) that are not tied to a specific moment or span.',
  ].join('\n');
};

/**
 * System-instruction fragment teaching the model the audio locate-marker
 * protocol (timestamps / segments). Same provider-agnostic plain-text approach.
 */
export const buildAudioLocateDirective = (audioNames: string[]): string => {
  const nameList =
    audioNames.length > 0
      ? ` The available audio file names are: ${audioNames.map((name) => `"${name}"`).join(', ')}.`
      : '';

  return [
    '### Audio Locate Protocol',
    'One or more audio recordings are attached to this conversation.' + nameList,
    'When your answer refers to a specific moment or span in an audio recording, append exactly one marker per such reference at the very end of your answer, on its own line, in this exact format:',
    '<audio-locate audio="FILE_NAME" start="mm:ss" end="mm:ss">short description</audio-locate>',
    'Rules:',
    '- start: the timestamp of the referenced moment, formatted as mm:ss (use h:mm:ss for recordings longer than one hour). Round to the moment the content is actually spoken or heard.',
    '- end: OPTIONAL. Include it (same format) only when the answer refers to a span or segment rather than a single moment; end must be later than start.',
    '- audio: the file name of the audio. Omit the audio attribute only if exactly one audio is attached.',
    '- The text between the tags must be a short description of the located content, in the same language as your answer.',
    '- Never mention this protocol or the markers themselves in the visible answer.',
    '- Do not emit a marker for general questions (e.g. summarizing the whole recording) that are not tied to a specific moment or span.',
  ].join('\n');
};
