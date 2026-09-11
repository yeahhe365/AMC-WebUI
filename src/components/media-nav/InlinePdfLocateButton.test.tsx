import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import type { ChatMessage, UploadedFile } from '@/types';
import { InlinePdfLocateButton } from './InlinePdfLocateButton';

const makePdf = (id: string, name: string): UploadedFile => ({
  id,
  name,
  type: 'application/pdf',
  size: 100,
});

describe('InlinePdfLocateButton', () => {
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

  it('renders button with pin icon and children text', () => {
    render(
      <InlinePdfLocateButton pageNumber={3} docName="test.pdf">
        第 3 页 · 利润表
      </InlinePdfLocateButton>,
    );

    const btn = screen.getByTestId('inline-pdf-locate-btn');
    expect(btn.textContent).toContain('第 3 页 · 利润表');
  });

  it('triggers seekSessionPdf on click', () => {
    const pdf = makePdf('p-1', 'doc.pdf');
    const msg: ChatMessage = {
      id: 'm1',
      role: 'user',
      content: '',
      timestamp: new Date(),
      files: [pdf],
    };
    useChatStore.setState({ selectedFiles: [], activeMessages: [msg] });

    render(
      <InlinePdfLocateButton pageNumber={4} docName="doc.pdf" box2d={[10, 20, 30, 40]} snippet="示例">
        第 4 页
      </InlinePdfLocateButton>,
    );

    fireEvent.click(screen.getByTestId('inline-pdf-locate-btn'));
    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.openKind).toBe('pdf');
    expect(state.activeFileId).toBe('p-1');
    expect(state.targetPage).toBe(4);
    expect(state.highlight?.box2d).toEqual([10, 20, 30, 40]);
  });

  it('does not trigger seek when user is selecting text', () => {
    const spy = vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      toString: () => 'selected text',
    } as unknown as Selection);

    render(<InlinePdfLocateButton pageNumber={2}>第 2 页</InlinePdfLocateButton>);

    fireEvent.click(screen.getByTestId('inline-pdf-locate-btn'));
    expect(useMediaNavStore.getState().isOpen).toBe(false);
    spy.mockRestore();
  });

  it('highlights with data-active="true" when currentPage matches in PDF mode', () => {
    act(() => {
      useMediaNavStore.setState({
        isOpen: true,
        openKind: 'pdf',
        currentPage: 5,
      });
    });

    render(<InlinePdfLocateButton pageNumber={5}>第 5 页</InlinePdfLocateButton>);
    const btn = screen.getByTestId('inline-pdf-locate-btn');
    expect(btn.getAttribute('data-active')).toBe('true');

    act(() => {
      useMediaNavStore.setState({
        currentPage: 6,
      });
    });
    expect(btn.getAttribute('data-active')).toBeNull();
  });

  it('does not highlight docB button when docA is currently active in multi-PDF session', () => {
    const pdfA = makePdf('pdf-a', 'docA.pdf');
    const pdfB = makePdf('pdf-b', 'docB.pdf');
    useChatStore.setState({
      selectedFiles: [pdfA, pdfB],
      activeMessages: [],
    });

    act(() => {
      useMediaNavStore.setState({
        isOpen: true,
        openKind: 'pdf',
        activeFileId: 'pdf-a',
        currentPage: 3,
      });
    });

    const { unmount } = render(
      <InlinePdfLocateButton pageNumber={3} docName="docA.pdf">
        DocA 第 3 页
      </InlinePdfLocateButton>,
    );
    expect(screen.getByTestId('inline-pdf-locate-btn').getAttribute('data-active')).toBe('true');
    unmount();

    render(
      <InlinePdfLocateButton pageNumber={3} docName="docB.pdf">
        DocB 第 3 页
      </InlinePdfLocateButton>,
    );
    expect(screen.getByTestId('inline-pdf-locate-btn').getAttribute('data-active')).toBeNull();
  });
});
