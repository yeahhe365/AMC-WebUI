import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MediaNavPanel } from './MediaNavPanel';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { useChatStore } from '@/stores/chatStore';
import type { UploadedFile } from '@/types';

vi.mock('./MediaNavView', () => ({
  MediaNavView: ({ file }: { file: UploadedFile }) => <div data-testid="mock-media-nav-view">{file.name}</div>,
}));

const mockVideoFile: UploadedFile = {
  id: 'vid-1',
  name: 'clip.mp4',
  type: 'video/mp4',
  size: 1024,
};

describe('MediaNavPanel', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    useMediaNavStore.setState({
      isOpen: false,
      openKind: null,
      activeFileId: null,
      width: 480,
    });
    useChatStore.setState({
      selectedFiles: [],
      activeMessages: [],
    });
  });

  it('renders nothing when isOpen is false', () => {
    renderer.render(<MediaNavPanel />);
    expect(renderer.container.firstChild).toBeNull();
  });

  it('closes panel without resetting nav settings when close button is clicked', () => {
    const setCurrentChatSettings = vi.fn();
    useMediaNavStore.setState({
      isOpen: true,
      openKind: 'video',
      activeFileId: 'vid-1',
    });
    useChatStore.setState({
      selectedFiles: [mockVideoFile],
      activeMessages: [],
      setCurrentChatSettings,
    } as never);

    renderer.render(<MediaNavPanel />);

    const closeBtn = screen.getByTestId('media-nav-panel-close');
    expect(closeBtn).toBeDefined();

    fireEvent.click(closeBtn);

    // Verify useMediaNavStore isOpen was properly set to false, but settings were not wiped
    expect(useMediaNavStore.getState().isOpen).toBe(false);
    expect(setCurrentChatSettings).not.toHaveBeenCalled();
  });

  it('formats YouTube URLs as friendly display names in file title and options', () => {
    const youtubeFile: UploadedFile = {
      id: 'yt-1',
      name: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      type: 'video/mp4',
      size: 0,
    };
    useMediaNavStore.setState({
      isOpen: true,
      openKind: 'video',
      activeFileId: 'yt-1',
    });
    useChatStore.setState({
      selectedFiles: [youtubeFile],
      activeMessages: [],
    });

    renderer.render(<MediaNavPanel />);

    expect(screen.getByText('YouTube (dQw4w9WgXcQ)')).toBeDefined();
  });

  it('switches media kind and clears live artifacts from chat settings', () => {
    const audioFile: UploadedFile = {
      id: 'aud-1',
      name: 'voice.mp3',
      type: 'audio/mp3',
      size: 512,
    };
    const setCurrentChatSettings = vi.fn();
    useMediaNavStore.setState({
      isOpen: true,
      openKind: 'video',
      activeFileId: 'vid-1',
    });
    useChatStore.setState({
      selectedFiles: [mockVideoFile, audioFile],
      activeMessages: [],
      setCurrentChatSettings,
    } as never);

    renderer.render(<MediaNavPanel />);

    const select = screen.getByLabelText('Media Navigation');
    fireEvent.change(select, { target: { value: 'aud-1' } });

    expect(useMediaNavStore.getState().openKind).toBe('audio');
    expect(setCurrentChatSettings).toHaveBeenCalledWith(expect.any(Function));

    const updater = setCurrentChatSettings.mock.calls[0][0];
    const nextSettings = updater({
      isAudioNavEnabled: false,
      isVideoNavEnabled: true,
      systemInstruction: '[Live Artifacts Protocol - zh]\nPrompt',
    });
    expect(nextSettings.isAudioNavEnabled).toBe(true);
    expect(nextSettings.isVideoNavEnabled).toBe(false);
    expect(nextSettings.systemInstruction).toBe('');
  });
});
