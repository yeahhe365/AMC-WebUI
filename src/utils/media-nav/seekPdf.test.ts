import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import type { ChatMessage, UploadedFile } from '@/types';
import { seekSessionPdf } from './seekPdf';

const makePdf = (id: string, name: string): UploadedFile => ({
  id,
  name,
  type: 'application/pdf',
  size: 100,
});

describe('seekSessionPdf', () => {
  beforeEach(() => {
    useMediaNavStore.setState({
      isOpen: false,
      openKind: null,
      activeFileId: null,
      targetPage: null,
      currentPage: 1,
      highlight: null,
      videoTarget: null,
    });
    useChatStore.setState({ selectedFiles: [], activeMessages: [] });
  });

  it('returns false when no PDF is attached to the session', () => {
    const success = seekSessionPdf({ pageNumber: 2 });
    expect(success).toBe(false);
    expect(useMediaNavStore.getState().isOpen).toBe(false);
  });

  it('opens PDF navigation and jumps to target page with highlight', () => {
    const pdf = makePdf('pdf-1', 'annual-report.pdf');
    const message: ChatMessage = {
      id: 'm1',
      role: 'user',
      content: '',
      timestamp: new Date(),
      files: [pdf],
    };
    useChatStore.setState({ selectedFiles: [], activeMessages: [message] });

    const success = seekSessionPdf({
      pageNumber: 5,
      docName: 'annual-report.pdf',
      box2d: [100, 200, 300, 400],
      snippet: '利润表',
      messageId: 'm1',
    });

    expect(success).toBe(true);
    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.openKind).toBe('pdf');
    expect(state.activeFileId).toBe('pdf-1');
    expect(state.targetPage).toBe(5);
    expect(state.highlight).toMatchObject({
      docName: 'annual-report.pdf',
      pageNumber: 5,
      box2d: [100, 200, 300, 400],
      snippet: '利润表',
      messageId: 'm1',
    });
  });

  it('falls back to message content to extract box2d and docName', () => {
    const pdf = makePdf('pdf-2', 'spec.pdf');
    const userMsg: ChatMessage = {
      id: 'u1',
      role: 'user',
      content: '',
      timestamp: new Date(),
      files: [pdf],
    };
    const modelMsg: ChatMessage = {
      id: 'm2',
      role: 'model',
      content: '详见规格说明：<pdf-locate doc="spec.pdf" page="3" box="120,80,340,560">电气参数</pdf-locate>',
      timestamp: new Date(),
    };
    useChatStore.setState({ selectedFiles: [], activeMessages: [userMsg, modelMsg] });

    const success = seekSessionPdf({
      pageNumber: 3,
      messageId: 'm2',
    });

    expect(success).toBe(true);
    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.activeFileId).toBe('pdf-2');
    expect(state.targetPage).toBe(3);
    expect(state.highlight?.box2d).toEqual([120, 80, 340, 560]);
    expect(state.highlight?.snippet).toBe('电气参数');
  });

  it('sets isPdfNavEnabled to true and clears Live Artifacts from chat settings', () => {
    const pdf = makePdf('pdf-3', 'guide.pdf');
    const setCurrentChatSettings = vi.fn();
    useChatStore.setState({
      selectedFiles: [pdf],
      activeMessages: [],
      setCurrentChatSettings,
    } as never);

    const success = seekSessionPdf({ pageNumber: 1, docName: 'guide.pdf' });
    expect(success).toBe(true);
    expect(setCurrentChatSettings).toHaveBeenCalledWith(expect.any(Function));

    const updater = setCurrentChatSettings.mock.calls[0][0];
    const updated = updater({
      isPdfNavEnabled: false,
      isVideoNavEnabled: true,
      systemInstruction: '[Live Artifacts Protocol - zh]\nPrompt content',
    });
    expect(updated.isPdfNavEnabled).toBe(true);
    expect(updated.isVideoNavEnabled).toBe(false);
    expect(updated.systemInstruction).toBe('');
  });

  it('accurately selects docB when docName is specified in multi-PDF session', () => {
    const pdfA = makePdf('pdf-a', 'docA.pdf');
    const pdfB = makePdf('pdf-b', 'docB.pdf');
    useChatStore.setState({
      selectedFiles: [pdfA, pdfB],
      activeMessages: [],
    });

    const success = seekSessionPdf({ pageNumber: 2, docName: 'docB.pdf' });
    expect(success).toBe(true);
    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.activeFileId).toBe('pdf-b');
    expect(state.targetPage).toBe(2);
  });

  it('extracts docName from message pdf-locate tag in multi-PDF session', () => {
    const pdfA = makePdf('pdf-a', 'docA.pdf');
    const pdfB = makePdf('pdf-b', 'docB.pdf');
    const modelMsg: ChatMessage = {
      id: 'm-reply',
      role: 'model',
      content: '请参阅：<pdf-locate doc="docB.pdf" page="7" box="10,20,30,40">结论</pdf-locate>',
      timestamp: new Date(),
    };
    useChatStore.setState({
      selectedFiles: [pdfA, pdfB],
      activeMessages: [modelMsg],
    });

    const success = seekSessionPdf({ pageNumber: 7, messageId: 'm-reply' });
    expect(success).toBe(true);
    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.activeFileId).toBe('pdf-b');
    expect(state.targetPage).toBe(7);
    expect(state.highlight?.snippet).toBe('结论');
  });
});
