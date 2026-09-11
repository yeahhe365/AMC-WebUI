import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import type { ChatMessage, UploadedFile } from '@/types';
import { seekSessionImage } from './seekImage';

const makeImage = (id: string, name: string): UploadedFile => ({
  id,
  name,
  type: 'image/png',
  size: 100,
});

describe('seekSessionImage', () => {
  beforeEach(() => {
    useMediaNavStore.setState({
      isOpen: false,
      openKind: null,
      activeFileId: null,
      targetPage: null,
      currentPage: 1,
      highlight: null,
      videoTarget: null,
      imageHighlight: null,
    });
    useChatStore.setState({ selectedFiles: [], activeMessages: [] });
  });

  it('returns false when no image is attached to the session', () => {
    const success = seekSessionImage({ box2d: [100, 200, 300, 400] });
    expect(success).toBe(false);
    expect(useMediaNavStore.getState().isOpen).toBe(false);
  });

  it('opens image navigation, sets active file, and sets imageHighlight with focusToken', () => {
    const img = makeImage('img-1', 'screenshot.png');
    const message: ChatMessage = {
      id: 'm1',
      role: 'user',
      content: '',
      timestamp: new Date(),
      files: [img],
    };
    useChatStore.setState({ selectedFiles: [], activeMessages: [message] });

    const success = seekSessionImage({
      fileName: 'screenshot.png',
      box2d: [100, 200, 300, 400],
      point: [150, 250],
      arrow: 'top-left',
      label: '搜索栏',
      snippet: '输入框',
      messageId: 'm1',
    });

    expect(success).toBe(true);
    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.openKind).toBe('image');
    expect(state.activeFileId).toBe('img-1');
    expect(state.imageHighlight).toMatchObject({
      imageName: 'screenshot.png',
      box2d: [100, 200, 300, 400],
      point: [150, 250],
      arrow: 'top-left',
      label: '搜索栏',
      snippet: '输入框',
      messageId: 'm1',
    });
    expect(typeof state.imageHighlight?.focusToken).toBe('number');
  });

  it('falls back to message content when coordinates or fileName are omitted', () => {
    const img = makeImage('img-2', 'app.png');
    const assistantMsg: ChatMessage = {
      id: 'a1',
      role: 'model',
      content:
        '分析界面如下：<image-locate file="app.png" box="50,60,70,80" point="55,65" arrow="top" label="登录">点击登录</image-locate>',
      timestamp: new Date(),
      files: [img],
    };
    useChatStore.setState({ selectedFiles: [], activeMessages: [assistantMsg] });

    const success = seekSessionImage({ messageId: 'a1', label: '登录' });
    expect(success).toBe(true);
    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.activeFileId).toBe('img-2');
    expect(state.imageHighlight?.box2d).toEqual([50, 60, 70, 80]);
    expect(state.imageHighlight?.point).toEqual([55, 65]);
    expect(state.imageHighlight?.arrow).toBe('top');
  });

  it('sets isImageNavEnabled to true and clears Live Artifacts from chat settings', () => {
    const img = makeImage('img-3', 'chart.png');
    const setCurrentChatSettings = vi.fn();
    useChatStore.setState({
      selectedFiles: [img],
      activeMessages: [],
      setCurrentChatSettings,
    } as never);

    const success = seekSessionImage({ fileName: 'chart.png' });
    expect(success).toBe(true);
    expect(setCurrentChatSettings).toHaveBeenCalledWith(expect.any(Function));

    const updater = setCurrentChatSettings.mock.calls[0][0];
    const updated = updater({
      isImageNavEnabled: false,
      isPdfNavEnabled: true,
      systemInstruction: '[Live Artifacts Protocol - zh]\nPrompt content',
    });
    expect(updated.isImageNavEnabled).toBe(true);
    expect(updated.isPdfNavEnabled).toBe(false);
    expect(updated.systemInstruction).toBe('');
  });

  it('collects all sibling image locates for the same image into imageHighlights', () => {
    const img = makeImage('img-4', 'multi.png');
    const msg: ChatMessage = {
      id: 'm-multi',
      role: 'model',
      content:
        '1. <image-locate file="multi.png" box="10,10,50,50" label="Item A">A</image-locate>\n' +
        '2. <image-locate file="multi.png" box="60,60,90,90" label="Item B">B</image-locate>',
      timestamp: new Date(),
      files: [img],
    };
    useChatStore.setState({ selectedFiles: [], activeMessages: [msg] });

    const success = seekSessionImage({ messageId: 'm-multi', label: 'Item B' });
    expect(success).toBe(true);

    const state = useMediaNavStore.getState();
    expect(state.imageHighlights).toHaveLength(2);
    expect(state.imageHighlight?.label).toBe('Item B');
    expect(state.imageHighlights[1].isActive).toBe(true);
    expect(state.imageHighlights[0].isActive).toBe(false);
    expect(state.imageHighlights[0].index).toBe(1);
    expect(state.imageHighlights[1].index).toBe(2);
  });
});
