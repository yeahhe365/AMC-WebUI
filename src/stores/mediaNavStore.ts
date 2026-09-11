import { create } from 'zustand';

export interface PdfNavHighlight {
  messageId?: string;
  docName?: string;
  pageNumber: number;
  /** [ymin, xmin, ymax, xmax] normalized to a 0-1000 scale, origin at top-left. */
  box2d?: [number, number, number, number];
  /** [y, x] normalized to a 0-1000 scale. */
  point?: [number, number];
  snippet?: string;
}

export interface VideoNavTarget {
  /** Seek target in seconds. */
  seconds: number;
  /** Segment bounds in seconds; a pure moment has no end. */
  end?: number;
  /** Monotonic token so repeating the same timestamp still retriggers a seek. */
  seekToken: number;
  /** [ymin, xmin, ymax, xmax] normalized to a 0-1000 scale. */
  box2d?: [number, number, number, number];
  /** [y, x] normalized to a 0-1000 scale. */
  point?: [number, number];
  snippet?: string;
}

export interface ImageNavHighlight {
  id?: string;
  messageId?: string;
  imageName?: string;
  /** [ymin, xmin, ymax, xmax] normalized to a 0-1000 scale, origin at top-left. */
  box2d?: [number, number, number, number];
  /** [y, x] normalized to a 0-1000 scale. */
  point?: [number, number];
  /** Recommended arrow direction: top | bottom | left | right | top-left etc. */
  arrow?: string;
  label?: string;
  snippet?: string;
  index?: number;
  total?: number;
  isActive?: boolean;
  /** Monotonic token so repeating the same locate target retriggers camera focus. */
  focusToken?: number;
}

export type MediaNavKind = 'pdf' | 'video' | 'audio' | 'image';

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
  imageHighlight: ImageNavHighlight | null;
  imageHighlights: ImageNavHighlight[];
  /** Current active media playback time in seconds (for video and audio reverse-grounding sync). */
  currentPlayTime: number | null;
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
  setImageHighlight: (highlight: ImageNavHighlight | null) => void;
  setImageHighlights: (highlights: ImageNavHighlight[]) => void;
  setActiveImageHighlightIndex: (index: number) => void;
  clearImageHighlight: () => void;
  /** Queue a video seek; an optional end turns it into a loopable segment; optional annotation adds spatial highlight. */
  jumpToTime: (
    seconds: number,
    segmentEnd?: number,
    annotation?: { box2d?: [number, number, number, number]; point?: [number, number]; snippet?: string },
  ) => void;
  consumeVideoTarget: () => void;
  setCurrentPlayTime: (time: number | null) => void;
  setWidth: (width: number) => void;
}

export const MEDIA_NAV_MIN_WIDTH = 320;
export const MEDIA_NAV_MAX_WIDTH = 840;
const MEDIA_NAV_DEFAULT_WIDTH = 540;

let seekTokenCounter = 0;
let focusTokenCounter = 0;

export const useMediaNavStore = create<MediaNavState>((set) => ({
  isOpen: false,
  openKind: null,
  activeFileId: null,
  targetPage: null,
  currentPage: 1,
  highlight: null,
  videoTarget: null,
  imageHighlight: null,
  imageHighlights: [],
  currentPlayTime: null,
  width: MEDIA_NAV_DEFAULT_WIDTH,
  openAs: (kind) => set({ isOpen: true, openKind: kind }),
  close: () => set({ isOpen: false, openKind: null, currentPlayTime: null }),
  setActiveFile: (fileId) =>
    set({
      activeFileId: fileId,
      targetPage: null,
      highlight: null,
      videoTarget: null,
      imageHighlight: null,
      imageHighlights: [],
      currentPlayTime: null,
    }),
  jumpToPage: (page) => set({ targetPage: page }),
  consumeTargetPage: () => set({ targetPage: null }),
  setPage: (page) => set({ currentPage: page }),
  setHighlight: (highlight) => set({ highlight }),
  clearHighlight: () => set({ highlight: null }),
  setImageHighlight: (highlight) =>
    set({
      imageHighlight: highlight,
      imageHighlights: highlight ? [highlight] : [],
    }),
  setImageHighlights: (highlights) => {
    const active = highlights.find((h) => h.isActive) || highlights[0] || null;
    set({
      imageHighlights: highlights,
      imageHighlight: active,
    });
  },
  setActiveImageHighlightIndex: (index) =>
    set((state) => {
      const target = state.imageHighlights[index];
      if (!target) return state;
      const updatedTarget = {
        ...target,
        isActive: true,
        focusToken: ++focusTokenCounter,
      };
      const updatedList = state.imageHighlights.map((item, idx) => ({
        ...item,
        isActive: idx === index,
      }));
      return {
        imageHighlight: updatedTarget,
        imageHighlights: updatedList,
      };
    }),
  clearImageHighlight: () => set({ imageHighlight: null, imageHighlights: [] }),
  jumpToTime: (seconds, segmentEnd, annotation) =>
    set({
      videoTarget: {
        seconds,
        end: segmentEnd,
        seekToken: ++seekTokenCounter,
        box2d: annotation?.box2d,
        point: annotation?.point,
        snippet: annotation?.snippet,
      },
    }),
  consumeVideoTarget: () => set({ videoTarget: null }),
  setCurrentPlayTime: (time) => set({ currentPlayTime: time }),
  setWidth: (width) => set({ width: Math.min(MEDIA_NAV_MAX_WIDTH, Math.max(MEDIA_NAV_MIN_WIDTH, Math.round(width))) }),
}));

/** Imperative helpers for callers outside React trees. */
export const closeMediaNavPanel = () => useMediaNavStore.getState().close();
