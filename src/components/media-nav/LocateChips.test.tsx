import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import type { ChatMessage, UploadedFile } from '@/types';

import { LocateChips } from './LocateChips';

const makePdf = (): UploadedFile => ({ id: 'p1', name: 'report.pdf', type: 'application/pdf', size: 10 });
const makeVideo = (): UploadedFile => ({ id: 'v1', name: 'demo.mp4', type: 'video/mp4', size: 10 });

const seedSession = (files: UploadedFile[]) => {
  const message: ChatMessage = { id: 'm1', role: 'user', content: '', timestamp: new Date(), files };
  useChatStore.setState({ selectedFiles: [], activeMessages: [message] });
};

const resetStores = () => {
  useMediaNavStore.setState({
    isOpen: false,
    activeFileId: null,
    targetPage: null,
    currentPage: 1,
    highlight: null,
    videoTarget: null,
  });
  useChatStore.setState({ selectedFiles: [], activeMessages: [] });
};

describe('LocateChips', () => {
  beforeEach(resetStores);

  it('renders nothing without locates', () => {
    const { container } = render(<LocateChips messageId="m" pdfLocates={[]} videoLocates={[]} audioLocates={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a video moment chip that jumps to the timestamp', () => {
    seedSession([makeVideo()]);
    render(
      <LocateChips
        messageId="m"
        pdfLocates={[]}
        videoLocates={[{ videoName: 'demo.mp4', startSeconds: 205, snippet: 'demo' }]}
        audioLocates={[]}
      />,
    );

    const chip = screen.getByTestId('video-locate-chip-205');
    expect(chip.textContent).toContain('03:25');
    fireEvent.click(chip);

    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.activeFileId).toBe('v1');
    expect(state.openKind).toBe('video');
    expect(state.videoTarget).toMatchObject({ seconds: 205, end: undefined });
  });

  it('renders a segment chip that carries the loop bounds', () => {
    seedSession([makeVideo()]);
    render(
      <LocateChips
        messageId="m"
        pdfLocates={[]}
        videoLocates={[{ startSeconds: 60, endSeconds: 90 }]}
        audioLocates={[]}
      />,
    );

    expect(screen.getByTestId('video-locate-chip-60').textContent).toContain('01:00');
    expect(screen.getByTestId('video-locate-chip-60').textContent).toContain('01:30');
    fireEvent.click(screen.getByTestId('video-locate-chip-60'));
    expect(useMediaNavStore.getState().videoTarget).toMatchObject({ seconds: 60, end: 90 });
  });

  it('renders a pdf chip that jumps to the page with highlight', () => {
    seedSession([makePdf()]);
    render(
      <LocateChips
        messageId="m"
        pdfLocates={[{ docName: 'report.pdf', pageNumber: 4, box2d: [1, 2, 3, 4], snippet: 's' }]}
        videoLocates={[]}
        audioLocates={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('pdf-locate-chip-4'));
    const state = useMediaNavStore.getState();
    expect(state.activeFileId).toBe('p1');
    expect(state.openKind).toBe('pdf');
    expect(state.targetPage).toBe(4);
    expect(state.highlight).toMatchObject({ pageNumber: 4, messageId: 'm' });
  });
});

describe('LocateChips audio', () => {
  beforeEach(resetStores);

  it('renders an audio moment chip that jumps to the timestamp', () => {
    seedSession([{ id: 'a1', name: 'take.mp3', type: 'audio/mpeg', size: 10 }]);
    render(
      <LocateChips
        messageId="m"
        pdfLocates={[]}
        videoLocates={[]}
        audioLocates={[{ audioName: 'take.mp3', startSeconds: 130, snippet: '关键回答' }]}
      />,
    );

    const chip = screen.getByTestId('audio-locate-chip-130');
    expect(chip.textContent).toContain('02:10');
    fireEvent.click(chip);

    const state = useMediaNavStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.activeFileId).toBe('a1');
    expect(state.openKind).toBe('audio');
    expect(state.videoTarget).toMatchObject({ seconds: 130 });
  });

  it('renders an audio segment chip with loop bounds', () => {
    seedSession([{ id: 'a1', name: 'take.mp3', type: 'audio/mpeg', size: 10 }]);
    render(
      <LocateChips
        messageId="m"
        pdfLocates={[]}
        videoLocates={[]}
        audioLocates={[{ startSeconds: 30, endSeconds: 75 }]}
      />,
    );

    expect(screen.getByTestId('audio-locate-chip-30').textContent).toContain('01:15');
    fireEvent.click(screen.getByTestId('audio-locate-chip-30'));
    expect(useMediaNavStore.getState().videoTarget).toMatchObject({ seconds: 30, end: 75 });
  });
});
