import { render, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InlineTimestampSeekButton } from './InlineTimestampSeekButton';
import * as seekVideoModule from '@/utils/media-nav/seekVideo';
import * as seekAudioModule from '@/utils/media-nav/seekAudio';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { useChatStore } from '@/stores/chatStore';
import type { UploadedFile } from '@/types';

vi.mock('@/utils/media-nav/seekVideo', () => ({
  seekSessionVideo: vi.fn(),
}));

vi.mock('@/utils/media-nav/seekAudio', () => ({
  seekSessionAudio: vi.fn(),
}));

describe('InlineTimestampSeekButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers seekSessionVideo when clicked without text selection', () => {
    const { container } = render(
      <InlineTimestampSeekButton startSeconds={15} endSeconds={30} videoName="test.mp4">
        00:15 - 00:30
      </InlineTimestampSeekButton>,
    );

    const btn = container.querySelector('[data-testid="inline-timestamp-seek-btn"]')!;
    expect(btn).not.toBeNull();

    fireEvent.click(btn);
    expect(seekVideoModule.seekSessionVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        startSeconds: 15,
        endSeconds: 30,
        videoName: 'test.mp4',
      }),
    );
  });

  it('does NOT trigger seekSessionVideo when user has an active text selection (e.g. dragging to copy)', () => {
    // Mock active window text selection
    const mockSelection = {
      isCollapsed: false,
      toString: () => '00:15 - 00:30',
    };
    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

    const { container } = render(
      <InlineTimestampSeekButton startSeconds={15} endSeconds={30} videoName="test.mp4">
        00:15 - 00:30
      </InlineTimestampSeekButton>,
    );

    const btn = container.querySelector('[data-testid="inline-timestamp-seek-btn"]')!;
    fireEvent.click(btn);

    // Seeking should be prevented to avoid conflicting with copy
    expect(seekVideoModule.seekSessionVideo).not.toHaveBeenCalled();

    getSelectionSpy.mockRestore();
  });

  it('marks play icon with data-selection-copy="exclude" and keeps text selectable', () => {
    const { container } = render(<InlineTimestampSeekButton startSeconds={15}>00:15</InlineTimestampSeekButton>);

    const icon = container.querySelector('[data-selection-copy="exclude"]');
    expect(icon).not.toBeNull();

    const textSpan = container.querySelector('.select-text');
    expect(textSpan).not.toBeNull();
    expect(textSpan?.textContent).toBe('00:15');

    // Outer button must NOT have .select-none to avoid being stripped by copy utilities
    const btn = container.querySelector('[data-testid="inline-timestamp-seek-btn"]')!;
    expect(btn.classList.contains('select-none')).toBe(false);
  });

  it('highlights with data-active="true" during reverse grounding sync', () => {
    act(() => {
      useMediaNavStore.setState({
        isOpen: true,
        openKind: 'video',
        currentPlayTime: 20,
      });
    });

    const { container } = render(
      <InlineTimestampSeekButton startSeconds={15} endSeconds={30} videoName="test.mp4">
        00:15 - 00:30
      </InlineTimestampSeekButton>,
    );

    const btn = container.querySelector('[data-testid="inline-timestamp-seek-btn"]')!;
    expect(btn.getAttribute('data-active')).toBe('true');

    // Scrub outside range
    act(() => {
      useMediaNavStore.setState({
        currentPlayTime: 50,
      });
    });

    expect(btn.getAttribute('data-active')).toBeNull();
  });

  it('triggers seekSessionAudio when clicked with mediaKind="audio"', () => {
    const { container } = render(
      <InlineTimestampSeekButton startSeconds={45} endSeconds={90} videoName="speech.mp3" mediaKind="audio">
        00:45 - 01:30
      </InlineTimestampSeekButton>,
    );

    const btn = container.querySelector('[data-testid="inline-timestamp-seek-btn"]')!;
    fireEvent.click(btn);

    expect(seekAudioModule.seekSessionAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        startSeconds: 45,
        endSeconds: 90,
        audioName: 'speech.mp3',
      }),
    );
    expect(seekVideoModule.seekSessionVideo).not.toHaveBeenCalled();
  });

  it('does not highlight clipB button when clipA is currently playing in multi-video session', () => {
    const videoA: UploadedFile = {
      id: 'vid-a',
      name: 'clipA.mp4',
      type: 'video/mp4',
      size: 1000,
    };
    const videoB: UploadedFile = {
      id: 'vid-b',
      name: 'clipB.mp4',
      type: 'video/mp4',
      size: 2000,
    };
    useChatStore.setState({
      selectedFiles: [videoA, videoB],
      activeMessages: [],
    });

    act(() => {
      useMediaNavStore.setState({
        isOpen: true,
        openKind: 'video',
        activeFileId: 'vid-a',
        currentPlayTime: 20,
      });
    });

    const { container: containerA, unmount } = render(
      <InlineTimestampSeekButton startSeconds={15} endSeconds={30} videoName="clipA.mp4">
        ClipA 00:15 - 00:30
      </InlineTimestampSeekButton>,
    );
    const btnA = containerA.querySelector('[data-testid="inline-timestamp-seek-btn"]')!;
    expect(btnA.getAttribute('data-active')).toBe('true');
    unmount();

    const { container: containerB } = render(
      <InlineTimestampSeekButton startSeconds={15} endSeconds={30} videoName="clipB.mp4">
        ClipB 00:15 - 00:30
      </InlineTimestampSeekButton>,
    );
    const btnB = containerB.querySelector('[data-testid="inline-timestamp-seek-btn"]')!;
    expect(btnB.getAttribute('data-active')).toBeNull();
  });
});
