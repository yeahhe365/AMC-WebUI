import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { collectSessionMediaFiles, isPdfFile, resolveNamedFile } from './sessionMediaFiles';
import { parseLocateMarkers, toPdfNavHighlight } from './locateMarker';
import { applyMediaNavKindToSettings } from './mediaNavSettings';

export interface SeekSessionPdfParams {
  pageNumber: number;
  docName?: string;
  box2d?: [number, number, number, number];
  point?: [number, number];
  snippet?: string;
  messageId?: string;
}

export interface RotatedPdfCoords {
  isPoint: boolean;
  top: number;
  left: number;
  width: number;
  height: number;
}

export const getRotatedCoords = (
  box2d: [number, number, number, number] | undefined,
  point: [number, number] | undefined,
  rotationDegrees: number = 0,
): RotatedPdfCoords | null => {
  const normDeg = ((rotationDegrees % 360) + 360) % 360;

  if (box2d && box2d.length === 4) {
    const [ymin, xmin, ymax, xmax] = box2d;
    const y0 = Math.min(ymin, ymax);
    const y1 = Math.max(ymin, ymax);
    const x0 = Math.min(xmin, xmax);
    const x1 = Math.max(xmin, xmax);

    let newYmin: number;
    let newXmin: number;
    let newYmax: number;
    let newXmax: number;

    switch (normDeg) {
      case 90:
        newYmin = x0;
        newYmax = x1;
        newXmin = 1000 - y1;
        newXmax = 1000 - y0;
        break;
      case 180:
        newYmin = 1000 - y1;
        newYmax = 1000 - y0;
        newXmin = 1000 - x1;
        newXmax = 1000 - x0;
        break;
      case 270:
        newYmin = 1000 - x1;
        newYmax = 1000 - x0;
        newXmin = y0;
        newXmax = y1;
        break;
      default:
        newYmin = y0;
        newYmax = y1;
        newXmin = x0;
        newXmax = x1;
        break;
    }

    return {
      isPoint: false,
      top: newYmin / 10,
      left: newXmin / 10,
      height: Math.max((newYmax - newYmin) / 10, 0.5),
      width: Math.max((newXmax - newXmin) / 10, 0.5),
    };
  }

  if (point && point.length === 2) {
    const [y, x] = point;
    let newY: number;
    let newX: number;

    switch (normDeg) {
      case 90:
        newY = x;
        newX = 1000 - y;
        break;
      case 180:
        newY = 1000 - y;
        newX = 1000 - x;
        break;
      case 270:
        newY = 1000 - x;
        newX = y;
        break;
      default:
        newY = y;
        newX = x;
        break;
    }

    return {
      isPoint: true,
      top: newY / 10,
      left: newX / 10,
      width: 0,
      height: 0,
    };
  }

  return null;
};

/**
 * Open the PDF navigation panel, jump to a target page, and highlight visual bounding box.
 * Automatically resolves the active PDF document in the current session.
 */
export const seekSessionPdf = (params: SeekSessionPdfParams): boolean => {
  const { selectedFiles, activeMessages } = useChatStore.getState();
  const { pdfs } = collectSessionMediaFiles(selectedFiles, activeMessages);
  if (pdfs.length === 0) return false;

  let { docName, box2d, point, snippet } = params;

  // Fallback to inspect message context if docName or box2d/point wasn't embedded in the link
  if (params.messageId && (!docName || (!box2d && !point))) {
    const msg = activeMessages.find((m) => m.id === params.messageId);
    if (msg) {
      if (!box2d && !point && msg.content) {
        const { pdfLocates } = parseLocateMarkers(msg.content);
        const matched = pdfLocates.find((loc) => loc.pageNumber === params.pageNumber);
        if (matched) {
          docName = docName || matched.docName;
          box2d = box2d || matched.box2d;
          point = point || matched.point;
          snippet = snippet || matched.snippet;
        }
      }
      if (!docName && msg.files) {
        const msgPdfs = msg.files.filter(isPdfFile);
        if (msgPdfs.length === 1) {
          docName = msgPdfs[0].name;
        }
      }
    }
  }

  const store = useMediaNavStore.getState();
  const target = resolveNamedFile(pdfs, docName, store.activeFileId);
  if (!target) return false;

  store.openAs('pdf');
  store.setActiveFile(target.id);
  store.setHighlight(
    toPdfNavHighlight(
      {
        docName: target.name,
        pageNumber: params.pageNumber,
        box2d,
        point,
        snippet,
      },
      { messageId: params.messageId },
    ),
  );
  store.jumpToPage(params.pageNumber);

  const chatStore = useChatStore.getState();
  if (typeof chatStore.setCurrentChatSettings === 'function') {
    chatStore.setCurrentChatSettings((prev) => applyMediaNavKindToSettings(prev, 'pdf'));
  }

  return true;
};
