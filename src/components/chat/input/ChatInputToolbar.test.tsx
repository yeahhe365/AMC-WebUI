import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { createChatInputToolbarContextValue } from '@/test/chat-input/contextFixtures';
import { getModelCapabilities } from '@/utils/model/modelCapabilities';

const imageOutputModeSelectorMock = vi.fn();
const mockCapabilities = vi.hoisted(() => ({
  value: {
    isImageGenerationModel: false,
    isGemini3ImageModel: false,
    isTtsModel: false,
    isNativeAudioModel: false,
    isTranscribeModel: false,
    supportedAspectRatios: [] as string[],
    supportedImageSizes: [] as string[],
  },
}));

vi.mock('./toolbar/AddFileByIdInput', () => ({ AddFileByIdInput: () => null }));
vi.mock('./toolbar/AddUrlInput', () => ({ AddUrlInput: () => null }));
vi.mock('./toolbar/AspectRatioSelector', () => ({ AspectRatioSelector: () => null }));
vi.mock('./toolbar/ImageSizeSelector', () => ({ ImageSizeSelector: () => null }));
vi.mock('./toolbar/ImageOutputModeSelector', () => ({
  ImageOutputModeSelector: (props: unknown) => {
    imageOutputModeSelectorMock(props);
    return <div data-testid="image-output-mode-selector" />;
  },
}));
vi.mock('./toolbar/QuadImageToggle', () => ({ QuadImageToggle: () => null }));
vi.mock('./toolbar/TtsVoiceSelector', () => ({ TtsVoiceSelector: () => null }));
vi.mock('./toolbar/MediaResolutionSelector', () => ({ MediaResolutionSelector: () => null }));
import { ChatInputToolbarContext } from './ChatInputContext';
import { ChatInputToolbar } from './ChatInputToolbar';

describe('ChatInputToolbar', () => {
  const renderer = setupTestRenderer();

  const renderToolbar = () => {
    act(() => {
      renderer.root.render(
        <ChatInputToolbarContext.Provider
          value={createChatInputToolbarContextValue({
            capabilities: {
              ...getModelCapabilities('gemini-3.1-flash-image-preview'),
              ...mockCapabilities.value,
            },
          })}
        >
          <ChatInputToolbar />
        </ChatInputToolbarContext.Provider>,
      );
    });
  };

  beforeEach(() => {
    imageOutputModeSelectorMock.mockClear();
    useChatStore.setState({
      activeSessionId: null,
      savedSessions: [],
      activeMessages: [],
      imageOutputMode: 'IMAGE_TEXT',
    });
    mockCapabilities.value = {
      isImageGenerationModel: false,
      isGemini3ImageModel: false,
      isTtsModel: false,
      isNativeAudioModel: false,
      isTranscribeModel: false,
      supportedAspectRatios: [],
      supportedImageSizes: [],
    };
  });

  it('shows image output mode selector for Gemini image models', () => {
    mockCapabilities.value = {
      ...mockCapabilities.value,
      isImageGenerationModel: true,
    };

    renderToolbar();

    expect(imageOutputModeSelectorMock).toHaveBeenCalled();
    expect(renderer.container.querySelector('[data-testid="image-settings-cluster"]')).not.toBeNull();
  });

  it('shows transcribe cluster for transcribe models', () => {
    mockCapabilities.value = {
      ...mockCapabilities.value,
      isTranscribeModel: true,
    };

    renderToolbar();

    expect(renderer.container.querySelector('[data-testid="transcribe-settings-cluster"]')).not.toBeNull();
  });
});
