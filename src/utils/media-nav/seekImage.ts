import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { collectSessionMediaFiles, isImageFile, resolveNamedFile } from './sessionMediaFiles';
import { parseLocateMarkers, toImageNavHighlight } from './locateMarker';
import { applyMediaNavKindToSettings } from './mediaNavSettings';

export interface SeekSessionImageParams {
  fileName?: string;
  box2d?: [number, number, number, number];
  point?: [number, number];
  arrow?: string;
  label?: string;
  snippet?: string;
  messageId?: string;
}

let focusTokenCounter = 0;

/**
 * Open the media navigation panel anchored to image view, switch to target image,
 * and activate visual grounding highlight (BBox / arrow) with automatic viewport focus.
 */
export const seekSessionImage = (params: SeekSessionImageParams): boolean => {
  const { selectedFiles, activeMessages } = useChatStore.getState();
  const { images } = collectSessionMediaFiles(selectedFiles, activeMessages);
  if (images.length === 0) return false;

  let { fileName, box2d, point, arrow, label, snippet } = params;

  if (params.messageId && (!fileName || (!box2d && !point))) {
    const msg = activeMessages.find((m) => m.id === params.messageId);
    if (msg) {
      if (!fileName && msg.files) {
        const msgImg = msg.files.find(isImageFile);
        if (msgImg) fileName = msgImg.name;
      }
      if (!box2d && !point && msg.content) {
        const { imageLocates } = parseLocateMarkers(msg.content);
        if (imageLocates.length > 0) {
          const matched =
            imageLocates.find((loc) => (label && loc.label === label) || (snippet && loc.snippet === snippet)) ??
            imageLocates[0];
          if (matched) {
            fileName = fileName || matched.imageName;
            box2d = box2d || matched.box2d;
            point = point || matched.point;
            arrow = arrow || matched.arrow;
            label = label || matched.label;
            snippet = snippet || matched.snippet;
          }
        }
      }
    }
  }

  const store = useMediaNavStore.getState();
  const target = resolveNamedFile(images, fileName, store.activeFileId);
  if (!target) return false;

  // Gather sibling highlights for the same image in the message or session
  const allHighlights: ReturnType<typeof toImageNavHighlight>[] = [];
  if (params.messageId) {
    const msg = activeMessages.find((m) => m.id === params.messageId);
    if (msg?.content) {
      const { imageLocates } = parseLocateMarkers(msg.content);
      const matchingLocates = imageLocates.filter(
        (loc) => !loc.imageName || loc.imageName === target.name || loc.imageName === fileName,
      );

      if (matchingLocates.length > 1) {
        let hasActive = false;
        matchingLocates.forEach((loc, idx) => {
          const isSelected =
            !hasActive &&
            Boolean(
              (label && loc.label === label) ||
              (snippet && loc.snippet === snippet) ||
              (box2d && loc.box2d && box2d[0] === loc.box2d[0] && box2d[1] === loc.box2d[1]) ||
              (point && loc.point && point[0] === loc.point[0] && point[1] === loc.point[1]),
            );

          if (isSelected) hasActive = true;

          allHighlights.push(
            toImageNavHighlight(loc, {
              messageId: params.messageId,
              index: idx + 1,
              total: matchingLocates.length,
              isActive: isSelected,
              focusToken: isSelected ? ++focusTokenCounter : 0,
            }),
          );
        });

        // If none strictly matched, mark first as active
        if (!hasActive && allHighlights.length > 0) {
          allHighlights[0].isActive = true;
          allHighlights[0].focusToken = ++focusTokenCounter;
        }
      }
    }
  }

  const primaryHighlight = toImageNavHighlight(
    { imageName: target.name, box2d, point, arrow, label, snippet },
    { messageId: params.messageId, index: 1, total: 1, isActive: true, focusToken: ++focusTokenCounter },
  );

  store.openAs('image');
  store.setActiveFile(target.id);
  if (allHighlights.length > 1) {
    store.setImageHighlights(allHighlights);
  } else {
    store.setImageHighlight(primaryHighlight);
  }

  const chatStore = useChatStore.getState();
  if (typeof chatStore.setCurrentChatSettings === 'function') {
    chatStore.setCurrentChatSettings((prev) => applyMediaNavKindToSettings(prev, 'image'));
  }

  return true;
};
