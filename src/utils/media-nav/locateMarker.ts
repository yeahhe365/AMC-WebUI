import { parseTimestamp } from './timestamp';
import { parseTagAttributes } from './tagAttributes';
import { normalizeBoxCoordinates, normalizePointCoordinates } from './coordinateSniffer';
import type { ImageNavHighlight, PdfNavHighlight } from '@/stores/mediaNavStore';

/** A parsed `<pdf-locate>` marker emitted by the model. */
export interface PdfLocate {
  docName?: string;
  pageNumber: number;
  /** [ymin, xmin, ymax, xmax] normalized to 0-1000, origin top-left. */
  box2d?: [number, number, number, number];
  /** [y, x] normalized to 0-1000, origin top-left. */
  point?: [number, number];
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
  /** [ymin, xmin, ymax, xmax] normalized to 0-1000, origin top-left. */
  box2d?: [number, number, number, number];
  /** [y, x] normalized to 0-1000, origin top-left. */
  point?: [number, number];
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

/** A parsed `<image-locate>` marker emitted by the model. */
export interface ImageLocate {
  imageName?: string;
  /** [ymin, xmin, ymax, xmax] normalized to 0-1000, origin top-left. */
  box2d?: [number, number, number, number];
  /** [y, x] normalized to 0-1000, origin top-left. */
  point?: [number, number];
  arrow?: string;
  label?: string;
  snippet?: string;
}

export interface ParsedLocateContent {
  cleanContent: string;
  pdfLocates: PdfLocate[];
  videoLocates: VideoLocate[];
  audioLocates: AudioLocate[];
  imageLocates: ImageLocate[];
}

const LOCATE_MARKER_TAGS = ['pdf-locate', 'video-locate', 'audio-locate', 'image-locate'] as const;

const buildCompleteMarkerRe = (tag: string) => new RegExp(`<${tag}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${tag}>)`, 'g');
const buildPartialMarkerRe = (tag: string) => new RegExp(`<${tag}\\b[^>]*(?:>[\\s\\S]*)?$`);
const COMPLETE_MARKER_RES = LOCATE_MARKER_TAGS.map((tag) => [tag, buildCompleteMarkerRe(tag)] as const);
const PARTIAL_MARKER_RES = LOCATE_MARKER_TAGS.map((tag) => buildPartialMarkerRe(tag));

const parseBox2d = (raw: string | undefined): [number, number, number, number] | undefined => {
  return normalizeBoxCoordinates(raw) || undefined;
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
    point: parsePoint(attributes.point),
    snippet: inner.trim() || undefined,
  };
};

const parseMomentMarker = (attributes: Record<string, string>, inner: string) => {
  const startSeconds = parseTimestamp(attributes.start ?? attributes.ts ?? attributes.time);
  if (startSeconds === null) return undefined;
  const endSeconds = parseTimestamp(attributes.end);
  const snippet = (attributes.snippet ?? attributes.label ?? inner).trim();
  return {
    startSeconds,
    endSeconds: endSeconds !== null && endSeconds > startSeconds ? endSeconds : undefined,
    snippet: snippet || undefined,
  };
};

const parsePoint = (raw: string | undefined): [number, number] | undefined => {
  return normalizePointCoordinates(raw) || undefined;
};

const parseVideoMarker = (attributes: Record<string, string>, inner: string): VideoLocate | undefined => {
  const moment = parseMomentMarker(attributes, inner);
  return (
    moment && {
      ...moment,
      videoName: attributes.video?.trim() || undefined,
      box2d: parseBox2d(attributes.box),
      point: parsePoint(attributes.point),
    }
  );
};

const parseAudioMarker = (attributes: Record<string, string>, inner: string): AudioLocate | undefined => {
  const moment = parseMomentMarker(attributes, inner);
  return moment && { ...moment, audioName: attributes.audio?.trim() || undefined };
};

const parseImageMarker = (attributes: Record<string, string>, inner: string): ImageLocate | undefined => {
  const box2d = parseBox2d(attributes.box ?? attributes.box2d ?? attributes.box_2d);
  const point = parsePoint(attributes.point);
  if (!box2d && !point) return undefined;
  return {
    imageName: (attributes.file ?? attributes.image ?? attributes.doc)?.trim() || undefined,
    box2d,
    point,
    arrow: attributes.arrow?.trim() || undefined,
    label: attributes.label?.trim() || undefined,
    snippet: inner.trim() || undefined,
  };
};

interface ParsedMarker {
  pdf?: PdfLocate;
  video?: VideoLocate;
  audio?: AudioLocate;
  image?: ImageLocate;
}

const parseMarkerByTag = (tag: string, attributes: Record<string, string>, inner: string): ParsedMarker => {
  if (tag === 'pdf-locate') return { pdf: parsePdfMarker(attributes, inner) };
  if (tag === 'audio-locate') return { audio: parseAudioMarker(attributes, inner) };
  if (tag === 'image-locate') return { image: parseImageMarker(attributes, inner) };
  return { video: parseVideoMarker(attributes, inner) };
};

/**
 * Split model output into display text and locate markers. Complete markers
 * are removed from the text; an unterminated marker at the end (mid-stream)
 * is also stripped so partial markup never flashes in the chat.
 */
export const parseLocateMarkers = (content: string): ParsedLocateContent => {
  if (!LOCATE_MARKER_TAGS.some((tag) => content.includes(tag))) {
    return { cleanContent: content, pdfLocates: [], videoLocates: [], audioLocates: [], imageLocates: [] };
  }

  const pdfLocates: PdfLocate[] = [];
  const videoLocates: VideoLocate[] = [];
  const audioLocates: AudioLocate[] = [];
  const imageLocates: ImageLocate[] = [];
  let cleanContent = content;
  for (const [tag, markerRe] of COMPLETE_MARKER_RES) {
    cleanContent = cleanContent.replace(markerRe, (_full, attributeString: string, inner?: string) => {
      const attributes = parseTagAttributes(attributeString);
      const parsed = parseMarkerByTag(tag, attributes, inner || '');
      if (parsed.pdf) pdfLocates.push(parsed.pdf);
      if (parsed.video) videoLocates.push(parsed.video);
      if (parsed.audio) audioLocates.push(parsed.audio);
      if (parsed.image) imageLocates.push(parsed.image);
      return '';
    });
  }

  for (const partialRe of PARTIAL_MARKER_RES) {
    cleanContent = cleanContent.replace(partialRe, '');
  }

  return { cleanContent, pdfLocates, videoLocates, audioLocates, imageLocates };
};

/** Remove locate markers (complete and unterminated) keeping only display text. */
export const stripLocateMarkers = (content: string): string => parseLocateMarkers(content).cleanContent;

export const toPdfNavHighlight = (locate: PdfLocate, extras: { messageId?: string } = {}): PdfNavHighlight => ({
  messageId: extras.messageId,
  docName: locate.docName,
  pageNumber: locate.pageNumber,
  box2d: locate.box2d,
  point: locate.point,
  snippet: locate.snippet,
});

export const toImageNavHighlight = (
  locate: ImageLocate,
  extras: { messageId?: string; focusToken?: number; index?: number; total?: number; isActive?: boolean } = {},
): ImageNavHighlight => {
  const result: ImageNavHighlight = {
    messageId: extras.messageId,
    imageName: locate.imageName,
    box2d: locate.box2d,
    point: locate.point,
    arrow: locate.arrow,
    label: locate.label,
    snippet: locate.snippet,
    focusToken: extras.focusToken ?? 1,
  };
  if (extras.index !== undefined) result.index = extras.index;
  if (extras.total !== undefined) result.total = extras.total;
  if (extras.isActive !== undefined) result.isActive = extras.isActive;
  return result;
};

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
    'The client UI automatically turns <pdf-locate> tags into interactive inline jump buttons that open the PDF and highlight the target region or point on that page with a precision viewfinder reticle.',
    'When your answer refers to specific content on a PDF page (a paragraph, figure, table or section):',
    '- Insert a `<pdf-locate>` tag directly inline next to the referenced item or section title as the anchor button:',
    '<pdf-locate doc="FILE_NAME" page="PAGE_NUMBER" point="y,x" box="ymin,xmin,ymax,xmax">short quote or description</pdf-locate>',
    '- CRITICAL: Never duplicate page references or markers. Do not write both plain page numbers (e.g. [第 5 页]) and an adjacent <pdf-locate> tag. Place the <pdf-locate> tag directly at the referenced item/title as the anchor button.',
    '- Never duplicate locate tags at the end of your response if they are already placed inline.',
    'Rules:',
    '- page: the 1-based page number in that PDF.',
    '- doc: the file name of the PDF. Omit the doc attribute only if exactly one PDF is attached.',
    '- point: RECOMMENDED when pointing to a specific coordinate, signature, icon, or chart point as [y, x] normalized to a 0-1000 scale with origin at top-left (e.g. point="350,520").',
    '- box: OPTIONAL. The bounding box of the referenced element as [ymin, xmin, ymax, xmax] normalized to a 0-1000 scale with the origin at the top-left (e.g. box="120,80,340,560"). Include it whenever locating a specific figure, table, diagram, or paragraph.',
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
    'The client UI automatically turns timestamps and locate tags into interactive jump buttons that play the video and display a precision camera viewfinder reticle on target coordinates.',
    'When explaining, analyzing, or referring to specific scenes, moments, objects, or anatomical/physical structures in the video (especially when asked for positions, locations, or key moments):',
    '- Provide timestamps (formatted as mm:ss, or mm:ss-mm:ss for spans, use h:mm:ss for videos longer than one hour) inline right next to each described item or section title (e.g. [00:15] or [00:15-00:30]). Do NOT wrap timestamps in markdown code backticks.',
    '- When pointing to a specific visual structure, element, person, or coordinate on screen, insert a `<video-locate>` tag directly at that moment to activate visual reticle tracking:',
    '<video-locate video="FILE_NAME" start="mm:ss" end="mm:ss" point="y,x" box="ymin,xmin,ymax,xmax">short description</video-locate>',
    '- CRITICAL: Never duplicate timestamps in the same bullet or sentence. Do NOT write both a plain timestamp at the start and a <video-locate> tag at the end of the same item. Either place the <video-locate> tag directly at the referenced moment/title as the anchor, or use an inline timestamp [mm:ss].',
    'Rules:',
    '- start: the timestamp of the referenced moment, formatted as mm:ss (use h:mm:ss for videos longer than one hour). Round to the moment the content actually appears.',
    '- end: OPTIONAL. Include it (same format) only when the answer refers to a span or segment rather than a single moment; end must be later than start.',
    '- point: RECOMMENDED when pointing to a specific structure, object, or location on the screen as [y, x] normalized to a 0-1000 scale with origin at top-left (e.g. point="350,520"). This activates a precision viewfinder reticle on the target.',
    '- box: OPTIONAL. The bounding box of the referenced element as [ymin, xmin, ymax, xmax] normalized to a 0-1000 scale with origin at top-left.',
    '- video: the file name of the video (omit if only one video is attached).',
    '- The text between the tags must be a short description or label of the located content, in the same language as your answer.',
    '- Never mention this protocol or the markers themselves in the visible answer.',
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
    'The client UI automatically turns timestamps and locate tags into interactive jump buttons that seek to the audio moment.',
    'When explaining, analyzing, or referring to specific moments, speeches, or sections in the audio:',
    '- Provide timestamps (formatted as mm:ss, or mm:ss-mm:ss for spans, use h:mm:ss for audio longer than one hour) inline right next to each described item (e.g. [01:23] or [01:23-02:00]). Do NOT wrap timestamps in markdown code backticks.',
    '- Alternatively, insert an `<audio-locate>` tag next to the referenced moment:',
    '<audio-locate audio="FILE_NAME" start="mm:ss" end="mm:ss">short description</audio-locate>',
    '- CRITICAL: Never duplicate timestamps in the same bullet or sentence. Do NOT write both a plain timestamp and an <audio-locate> tag for the same moment.',
    'Rules:',
    '- start: the timestamp of the referenced moment, formatted as mm:ss (use h:mm:ss for recordings longer than one hour). Round to the moment the content is actually spoken or heard.',
    '- end: OPTIONAL. Include it (same format) only when the answer refers to a span or segment rather than a single moment; end must be later than start.',
    '- audio: the file name of the audio. Omit the audio attribute only if exactly one audio is attached.',
    '- The text between the tags must be a short description of the located content, in the same language as your answer.',
    '- Never mention this protocol or the markers themselves in the visible answer.',
    '- Do not emit a marker for general questions (e.g. summarizing the whole recording) that are not tied to a specific moment or span.',
  ].join('\n');
};

/**
 * System-instruction fragment teaching the model the image visual grounding protocol
 * (BBox and Guide Arrow). Provider-agnostic on purpose.
 */
export const buildImageLocateDirective = (imageNames: string[]): string => {
  const nameList =
    imageNames.length > 0
      ? ` The available image file names are: ${imageNames.map((name) => `"${name}"`).join(', ')}.`
      : '';

  return [
    '### Image Visual Grounding Protocol',
    'One or more images are attached to this conversation.' + nameList,
    'The client UI automatically converts <image-locate> tags into interactive buttons that focus the image and highlight targets with precision bounding boxes or guide arrows.',
    'When explaining, analyzing, or referring to specific objects, UI elements, regions, or details in an image:',
    '1. Insert an `<image-locate>` tag directly inline next to each referenced item as the anchor button.',
    '2. Choose the appropriate format:',
    '- For regions, objects, or structures (Bounding Box):',
    '  <image-locate file="FILE_NAME" box="ymin,xmin,ymax,xmax" label="LABEL">short description</image-locate>',
    '- For specific locations, icons, buttons, or details (Guide Arrow):',
    '  <image-locate file="FILE_NAME" point="y,x" arrow="top|bottom|left|right|top-left|top-right" label="LABEL">short description</image-locate>',
    'Rules:',
    '- Coordinates must be normalized to a 0-1000 scale with origin at top-left (e.g. box="120,80,340,560", point="350,520").',
    '- For object detection or bounded regions, provide box="ymin,xmin,ymax,xmax".',
    '- For specific locations, icons, buttons, or guide pointers, provide point="y,x" and optional arrow="top|bottom|left|right|top-left|top-right".',
    '- Do not provide both box and point in the same tag unless specifically needed.',
    '- file: the file name of the image (omit if only one image is attached).',
    '- label: a concise name for the target element (e.g. label="Search Box" or label="搜索栏"). Avoid repeating the exact same text in both label and inner tag description.',
    '- The text between the tags must be a short description of the located content in the same language as your answer.',
    '- CRITICAL: Never duplicate locate tags for the same element both inline and at the end of your response.',
    '- Never write python drawing code to render annotations or modify images.',
    '- Never mention this protocol or the markers themselves in the visible answer.',
  ].join('\n');
};
