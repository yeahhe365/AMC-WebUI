import { create } from 'zustand';

export interface PdfNavHighlight {
  messageId?: string;
  docName?: string;
  pageNumber: number;
  /** [ymin, xmin, ymax, xmax] normalized to a 0-1000 scale, origin at top-left. */
  box2d?: [number, number, number, number];
  snippet?: string;
}

export interface VideoNavTarget {
  /** Seek target in seconds. */
  seconds: number;
  /** Segment bounds in seconds; a pure moment has no end. */
  end?: number;
  /** Monotonic token so repeating the same timestamp still retriggers a seek. */
  seekToken: number;
}

export type MediaNavKind = 'pdf' | 'video' | 'audio';

interface MediaNavState {
  isOpen: boolean;
  /** Which navigation entry (PDF 导航 / 视频导航) the panel was opened from. */
  openKind: MediaNavKind | null;
  activeFileId: string | null;
  /** Page requested by an external jump (locate chip); consumed by the panel viewer. */
  targetPage: number | null;
  /** Page the PDF viewer is currently displaying (synced back from scroll tracking). */
  currentPage: number;
  highlight: PdfNavHighlight | null;
  /** Pending video seek (locate chip); consumed by the video view. */
  videoTarget: VideoNavTarget | null;
  width: number;
  /** Open the panel anchored to one navigation entry. */
  openAs: (kind: MediaNavKind) => void;
  close: () => void;
  setActiveFile: (fileId: string | null) => void;
  /** Queue an external jump to a page (from locate chips or page pickers). */
  jumpToPage: (page: number) => void;
  /** Consume the queued jump target after the viewer has scrolled to it. */
  consumeTargetPage: () => void;
  setPage: (page: number) => void;
  setHighlight: (highlight: PdfNavHighlight | null) => void;
  clearHighlight: () => void;
  /** Queue a video seek; an optional end turns it into a loopable segment. */
  jumpToTime: (seconds: number, segmentEnd?: number) => void;
  consumeVideoTarget: () => void;
  setWidth: (width: number) => void;
}

export const MEDIA_NAV_MIN_WIDTH = 320;
export const MEDIA_NAV_MAX_WIDTH = 720;
const MEDIA_NAV_DEFAULT_WIDTH = 480;

let seekTokenCounter = 0;

export const useMediaNavStore = create<MediaNavState>((set) => ({
  isOpen: false,
  openKind: null,
  activeFileId: null,
  targetPage: null,
  currentPage: 1,
  highlight: null,
  videoTarget: null,
  width: MEDIA_NAV_DEFAULT_WIDTH,
  openAs: (kind) => set({ isOpen: true, openKind: kind }),
  close: () => set({ isOpen: false, openKind: null }),
  setActiveFile: (fileId) =>
    set({
      activeFileId: fileId,
      targetPage: null,
      highlight: null,
      videoTarget: null,
    }),
  jumpToPage: (page) => set({ targetPage: page }),
  consumeTargetPage: () => set({ targetPage: null }),
  setPage: (page) => set({ currentPage: page }),
  setHighlight: (highlight) => set({ highlight }),
  clearHighlight: () => set({ highlight: null }),
  jumpToTime: (seconds, segmentEnd) =>
    set({ videoTarget: { seconds, end: segmentEnd, seekToken: ++seekTokenCounter } }),
  consumeVideoTarget: () => set({ videoTarget: null }),
  setWidth: (width) => set({ width: Math.min(MEDIA_NAV_MAX_WIDTH, Math.max(MEDIA_NAV_MIN_WIDTH, Math.round(width))) }),
}));

/** Imperative helpers for callers outside React trees (toggle chips, locate chips). */
export const openPdfNavPanel = () => useMediaNavStore.getState().openAs('pdf');
export const openVideoNavPanel = () => useMediaNavStore.getState().openAs('video');
export const openAudioNavPanel = () => useMediaNavStore.getState().openAs('audio');
export const closeMediaNavPanel = () => useMediaNavStore.getState().close();
