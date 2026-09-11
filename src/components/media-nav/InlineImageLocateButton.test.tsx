import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import type { ChatMessage, UploadedFile } from '@/types';
import { InlineImageLocateButton } from './InlineImageLocateButton';

const makeImage = (id: string, name: string): UploadedFile => ({
  id,
  name,
  type: 'image/png',
  size: 100,
});

describe('InlineImageLocateButton', () => {
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

  it('renders button with scan search icon and label', () => {
    render(
      <InlineImageLocateButton imageName="chart.png" box2d={[100, 200, 300, 400]}>
        图表标题
      </InlineImageLocateButton>,
    );

    const btn = screen.getByTestId('inline-image-locate-btn');
    expect(btn.textContent).toContain('图表标题');
  });

  it('triggers seekSessionImage on click with box2d', () => {
    const img = makeImage('img-1', 'chart.png');
    const msg: ChatMessage = {
      id: 'm1',
      role: 'user',
      content: '',
      timestamp: new Date(),
      files: [img],
    };
    useChatStore.setState({ selectedFiles: [], activeMessages: [msg] });

    render(
      <InlineImageLocateButton imageName="chart.png" box2d={[100, 200, 300, 400]} label="目标区域">
        目标区域
      </InlineImageLocateButton>,
    );

    fireEvent.click(screen.getByTestId('inline-image-locate-btn'));
    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.openKind).toBe('image');
    expect(state.activeFileId).toBe('img-1');
    expect(state.imageHighlight?.box2d).toEqual([100, 200, 300, 400]);
    expect(state.imageHighlight?.label).toBe('目标区域');
  });

  it('triggers seekSessionImage on click with point', () => {
    const img = makeImage('img-2', 'photo.jpg');
    useChatStore.setState({ selectedFiles: [img], activeMessages: [] });

    render(
      <InlineImageLocateButton imageName="photo.jpg" point={[500, 600]} label="按钮位置">
        按钮位置
      </InlineImageLocateButton>,
    );

    fireEvent.click(screen.getByTestId('inline-image-locate-btn'));
    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.openKind).toBe('image');
    expect(state.activeFileId).toBe('img-2');
    expect(state.imageHighlight?.point).toEqual([500, 600]);
  });

  it('does not trigger seek when user is selecting text', () => {
    const spy = vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      toString: () => 'selected text',
    } as unknown as Selection);

    render(
      <InlineImageLocateButton imageName="photo.jpg" point={[100, 200]}>
        测试
      </InlineImageLocateButton>,
    );

    fireEvent.click(screen.getByTestId('inline-image-locate-btn'));
    expect(useMediaNavStore.getState().isOpen).toBe(false);
    spy.mockRestore();
  });

  it('highlights with data-active="true" when imageHighlight matches in image mode', () => {
    act(() => {
      useMediaNavStore.setState({
        isOpen: true,
        openKind: 'image',
        imageHighlight: {
          box2d: [100, 200, 300, 400],
          label: '目标区域',
        },
      });
    });

    render(
      <InlineImageLocateButton imageName="chart.png" box2d={[100, 200, 300, 400]} label="目标区域">
        目标区域
      </InlineImageLocateButton>,
    );

    const btn = screen.getByTestId('inline-image-locate-btn');
    expect(btn.getAttribute('data-active')).toBe('true');

    act(() => {
      useMediaNavStore.setState({
        imageHighlight: null,
      });
    });
    expect(btn.getAttribute('data-active')).toBeNull();
  });
});
