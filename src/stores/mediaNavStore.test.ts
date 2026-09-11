import { beforeEach, describe, expect, it } from 'vitest';
import { MEDIA_NAV_MAX_WIDTH, MEDIA_NAV_MIN_WIDTH, useMediaNavStore } from './mediaNavStore';

const resetStore = () => {
  useMediaNavStore.setState({
    isOpen: false,
    openKind: null,
    activeFileId: null,
    targetPage: null,
    currentPage: 1,
    highlight: null,
    videoTarget: null,
    width: 480,
  });
};

describe('mediaNavStore', () => {
  beforeEach(resetStore);

  it('opens the panel anchored to a navigation kind and closes cleanly', () => {
    useMediaNavStore.getState().openAs('video');
    expect(useMediaNavStore.getState().isOpen).toBe(true);
    expect(useMediaNavStore.getState().openKind).toBe('video');

    useMediaNavStore.getState().close();
    expect(useMediaNavStore.getState().isOpen).toBe(false);
    expect(useMediaNavStore.getState().openKind).toBeNull();
  });

  it('clears highlight and jump targets when switching documents', () => {
    const store = useMediaNavStore.getState();
    store.setActiveFile('a');
    store.setHighlight({ pageNumber: 3, box2d: [1, 2, 3, 4] });
    store.jumpToPage(3);
    expect(useMediaNavStore.getState().targetPage).toBe(3);
    expect(useMediaNavStore.getState().highlight?.pageNumber).toBe(3);

    store.setActiveFile('b');
    expect(useMediaNavStore.getState().activeFileId).toBe('b');
    expect(useMediaNavStore.getState().highlight).toBeNull();
    expect(useMediaNavStore.getState().targetPage).toBeNull();
  });

  it('consumes the PDF jump target after the viewer scrolled', () => {
    useMediaNavStore.getState().jumpToPage(9);
    useMediaNavStore.getState().consumeTargetPage();
    expect(useMediaNavStore.getState().targetPage).toBeNull();
  });

  it('queues a video seek with a fresh token on every jump', () => {
    const store = useMediaNavStore.getState();
    store.setActiveFile('v1');
    store.jumpToTime(205);
    const first = useMediaNavStore.getState().videoTarget;
    expect(first).toMatchObject({ seconds: 205, end: undefined });
    expect(first?.seekToken).toBeGreaterThan(0);

    store.jumpToTime(205, 250);
    const second = useMediaNavStore.getState().videoTarget;
    // Same timestamp must still retrigger the seek via a new token.
    expect(second?.seekToken).toBeGreaterThan(first!.seekToken);
    expect(second).toMatchObject({ seconds: 205, end: 250 });
  });

  it('consumes the video target after the player seeked', () => {
    useMediaNavStore.getState().jumpToTime(10);
    useMediaNavStore.getState().consumeVideoTarget();
    expect(useMediaNavStore.getState().videoTarget).toBeNull();
  });

  it('clamps the panel width to the allowed range', () => {
    useMediaNavStore.getState().setWidth(10);
    expect(useMediaNavStore.getState().width).toBe(MEDIA_NAV_MIN_WIDTH);
    useMediaNavStore.getState().setWidth(99999);
    expect(useMediaNavStore.getState().width).toBe(MEDIA_NAV_MAX_WIDTH);
    useMediaNavStore.getState().setWidth(513.6);
    expect(useMediaNavStore.getState().width).toBe(514);
  });

  it('updates currentPlayTime and resets on close or document switch', () => {
    useMediaNavStore.getState().setCurrentPlayTime(42.5);
    expect(useMediaNavStore.getState().currentPlayTime).toBe(42.5);

    useMediaNavStore.getState().setActiveFile('next-file');
    expect(useMediaNavStore.getState().currentPlayTime).toBeNull();

    useMediaNavStore.getState().setCurrentPlayTime(18.2);
    expect(useMediaNavStore.getState().currentPlayTime).toBe(18.2);

    useMediaNavStore.getState().close();
    expect(useMediaNavStore.getState().currentPlayTime).toBeNull();
  });

  it('manages multiple image highlights and active highlight index', () => {
    const hl1 = { box2d: [100, 100, 200, 200] as [number, number, number, number], label: 'Item 1' };
    const hl2 = { box2d: [300, 300, 400, 400] as [number, number, number, number], label: 'Item 2' };

    useMediaNavStore.getState().setImageHighlights([hl1, hl2]);
    expect(useMediaNavStore.getState().imageHighlights).toHaveLength(2);
    expect(useMediaNavStore.getState().imageHighlight?.label).toBe('Item 1');

    useMediaNavStore.getState().setActiveImageHighlightIndex(1);
    expect(useMediaNavStore.getState().imageHighlight?.label).toBe('Item 2');
    expect(useMediaNavStore.getState().imageHighlight?.isActive).toBe(true);
    expect(useMediaNavStore.getState().imageHighlight?.focusToken).toBeDefined();

    useMediaNavStore.getState().clearImageHighlight();
    expect(useMediaNavStore.getState().imageHighlights).toHaveLength(0);
    expect(useMediaNavStore.getState().imageHighlight).toBeNull();
  });
});
