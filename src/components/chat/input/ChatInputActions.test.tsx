import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChatInputActionsContextValue,
  createChatInputComposerStatusContextValue,
} from '@/test/chat-input/contextFixtures';

const attachmentMenuMock = vi.fn();
const toolsMenuMock = vi.fn();
const liveControlsMock = vi.fn();
const auxiliaryButtonsMock = vi.fn();
const sendControlsMock = vi.fn();
const mockCapabilities = vi.hoisted(() => ({
  value: {
    isImageGenerationModel: false,
    isNativeAudioModel: false,
  },
}));

vi.mock('./AttachmentMenu', async () => {
  const { useChatInputActionsContext } =
    await vi.importActual<typeof import('./ChatInputContext')>('./ChatInputContext');

  return {
    AttachmentMenu: () => {
      const { disabled } = useChatInputActionsContext();
      const props = { disabled };

      attachmentMenuMock(props);
      return <div data-testid="attachment-menu" data-disabled={String(props.disabled)} />;
    },
  };
});

vi.mock('./ToolsMenu', () => ({
  ToolsMenu: (props: unknown) => {
    toolsMenuMock(props);
    return null;
  },
}));

vi.mock('./actions/WebSearchToggle', () => ({
  WebSearchToggle: () => null,
}));

vi.mock('./actions/LiveControls', async () => {
  const { useChatInputActionsContext } =
    await vi.importActual<typeof import('./ChatInputContext')>('./ChatInputContext');

  return {
    LiveControls: () => {
      const props = useChatInputActionsContext();
      liveControlsMock(props);
      return null;
    },
  };
});

vi.mock('./actions/RecordControls', () => ({
  RecordControls: () => null,
}));

vi.mock('./actions/ThinkingSpeedControl', () => ({
  // Consumes the main chat-input context at render; the actions row is tested
  // against scoped context providers only, so stub it like the other leaves.
  ThinkingSpeedControl: () => null,
}));

vi.mock('./actions/ComposerAuxiliaryButtons', () => ({
  ComposerAuxiliaryButtons: ({ actions }: { actions: Array<{ id: string; testId?: string; action: () => void }> }) => {
    auxiliaryButtonsMock({ actions });
    return (
      <div data-testid="composer-auxiliary-buttons">
        {actions.map((action) => (
          <button key={action.id} type="button" data-testid={action.testId} onClick={action.action}>
            {action.id}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock('./actions/SendControls', async () => {
  const { useChatInputComposerStatusContext } =
    await vi.importActual<typeof import('./ChatInputContext')>('./ChatInputContext');

  return {
    SendControls: () => {
      const { canSend, canQueueMessage, onFastSendMessage, onQueueMessage, onCancelPendingUploadSend } =
        useChatInputComposerStatusContext();
      const props = { canSend, canQueueMessage, onFastSendMessage, onQueueMessage, onCancelPendingUploadSend };
      sendControlsMock(props);
      return <div data-testid="send-controls" />;
    },
  };
});

import {
  ChatInputActionsContext,
  ChatInputComposerStatusContext,
  type ChatInputActionsContextValue,
  type ChatInputComposerStatusContextValue,
} from './ChatInputContext';
import { ChatInputActions } from './ChatInputActions';

type ActionRenderOverrides = Partial<ChatInputActionsContextValue> &
  Partial<ChatInputComposerStatusContextValue> & {
    inputText?: string;
  };

const splitRenderOverrides = (overrides: ActionRenderOverrides) => {
  const {
    inputText,
    hasTrimmedInput,
    canSend,
    canQueueMessage,
    onTranslate,
    onPasteFromClipboard,
    onClearInput,
    onFastSendMessage,
    onQueueMessage,
    onCancelPendingUploadSend,
    ...actionOverrides
  } = overrides;

  return {
    actionOverrides,
    composerOverrides: {
      ...(hasTrimmedInput !== undefined ? { hasTrimmedInput } : {}),
      ...(inputText !== undefined ? { hasTrimmedInput: inputText.trim().length > 0 } : {}),
      ...(canSend !== undefined ? { canSend } : {}),
      ...(canQueueMessage !== undefined ? { canQueueMessage } : {}),
      ...(onTranslate !== undefined ? { onTranslate } : {}),
      ...(onPasteFromClipboard !== undefined ? { onPasteFromClipboard } : {}),
      ...(onClearInput !== undefined ? { onClearInput } : {}),
      ...(onFastSendMessage !== undefined ? { onFastSendMessage } : {}),
      ...(onQueueMessage !== undefined ? { onQueueMessage } : {}),
      ...(onCancelPendingUploadSend !== undefined ? { onCancelPendingUploadSend } : {}),
    },
  };
};

describe('ChatInputActions', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });
  let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;
  let lastActionsValue: ChatInputActionsContextValue;

  const renderActions = (props: ActionRenderOverrides = {}) => {
    const { actionOverrides, composerOverrides } = splitRenderOverrides(props);
    const actionsValue = createChatInputActionsContextValue({
      isImageGenerationModel: mockCapabilities.value.isImageGenerationModel,
      isNativeAudioModel: mockCapabilities.value.isNativeAudioModel,
      ...actionOverrides,
    });
    const composerStatusValue = createChatInputComposerStatusContextValue({
      ...composerOverrides,
    });
    lastActionsValue = actionsValue;

    act(() => {
      renderer.root.render(
        <ChatInputActionsContext.Provider value={actionsValue}>
          <ChatInputComposerStatusContext.Provider value={composerStatusValue}>
            <ChatInputActions />
          </ChatInputComposerStatusContext.Provider>
        </ChatInputActionsContext.Provider>,
      );
    });
  };

  const mockActionRowMeasurements = ({
    containerWidth,
    leftWidth,
    rightWidth,
  }: {
    containerWidth: number;
    leftWidth: number;
    rightWidth: number;
  }) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const testId = this.getAttribute('data-testid');
      const widthByTestId: Record<string, number> = {
        'chat-input-actions-root': containerWidth,
        'chat-input-actions-left': leftWidth,
        'chat-input-actions-right': rightWidth,
      };
      const width = testId ? widthByTestId[testId] : undefined;

      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width ?? 0,
        bottom: 40,
        width: width ?? 0,
        height: 40,
        toJSON: () => {},
      } as DOMRect;
    });
  };

  const waitForActionRowMeasurement = async () => {
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  };

  beforeEach(() => {
    mockCapabilities.value = {
      isImageGenerationModel: false,
      isNativeAudioModel: false,
    };
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    attachmentMenuMock.mockClear();
    toolsMenuMock.mockClear();
    liveControlsMock.mockClear();
    auxiliaryButtonsMock.mockClear();
    sendControlsMock.mockClear();
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.restoreAllMocks();
  });

  it('keeps attachments enabled for Gemini image models that support reference images', () => {
    mockCapabilities.value = {
      ...mockCapabilities.value,
      isImageGenerationModel: true,
    };

    renderActions();

    expect(attachmentMenuMock).toHaveBeenCalledWith(expect.objectContaining({ disabled: false }));
  });

  it('keeps attachments enabled for Live models because selected files are sent through Live text turns', () => {
    mockCapabilities.value = {
      ...mockCapabilities.value,
      isNativeAudioModel: true,
    };

    renderActions();

    expect(attachmentMenuMock).toHaveBeenCalledWith(expect.objectContaining({ disabled: false }));
  });

  it('hides attachments on live translate and live transcribe models', () => {
    renderActions({ isLiveTranslate: true });
    expect(attachmentMenuMock).not.toHaveBeenCalled();

    attachmentMenuMock.mockClear();
    renderActions({ isLiveTranscribe: true });
    expect(attachmentMenuMock).not.toHaveBeenCalled();
  });

  it('hides MCP picker on image generation and native audio models', () => {
    renderActions({ isImageGenerationModel: true });
    expect(renderer.container.querySelector('[data-testid="mcp-picker-button"]')).toBeNull();

    renderActions({ isNativeAudioModel: true });
    expect(renderer.container.querySelector('[data-testid="mcp-picker-button"]')).toBeNull();
  });

  it('forwards Live disconnect and video controls into the live controls', () => {
    mockCapabilities.value = {
      ...mockCapabilities.value,
      isNativeAudioModel: true,
    };

    renderActions({ isLiveConnected: true, liveVideoSource: 'camera' });

    expect(liveControlsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isLiveConnected: true,
        onStartLiveSession: lastActionsValue.onStartLiveSession,
        onDisconnectLiveSession: lastActionsValue.onDisconnectLiveSession,
        onStartLiveCamera: lastActionsValue.onStartLiveCamera,
        onStartLiveScreenShare: lastActionsValue.onStartLiveScreenShare,
        onStopLiveVideo: lastActionsValue.onStopLiveVideo,
        liveVideoSource: 'camera',
      }),
    );
  });

  it('forwards only the current model id into the tools menu for capability derivation', () => {
    renderActions({ currentModelId: 'gemma-3-27b-it' });

    expect(toolsMenuMock).toHaveBeenCalledWith(expect.objectContaining({ currentModelId: 'gemma-3-27b-it' }));
    expect(toolsMenuMock.mock.calls[0]?.[0]).not.toHaveProperty('isGemmaModel');
    expect(toolsMenuMock.mock.calls[0]?.[0]).not.toHaveProperty('supportsBuiltInCustomToolCombination');
    expect(toolsMenuMock.mock.calls[0]?.[0]).not.toHaveProperty('isGemini3ImageModel');
  });

  it('allows active action effects to paint beyond their button bounds', () => {
    renderActions();

    const actionRow = renderer.container.querySelector('[data-testid="chat-input-actions-root"]');

    expect(actionRow?.className).toContain('overflow-visible');
    expect(actionRow?.className).not.toContain('overflow-hidden');
  });

  it('keeps auxiliary composer actions direct when the single action row has enough room', async () => {
    mockActionRowMeasurements({ containerWidth: 500, leftWidth: 88, rightWidth: 292 });

    renderActions({
      inputText: 'Translate or send this',
      canQueueMessage: true,
      showInputTranslationButton: true,
      showInputPasteButton: true,
      showInputClearButton: true,
    });
    await waitForActionRowMeasurement();

    expect(auxiliaryButtonsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ id: 'translate' }),
          expect.objectContaining({ id: 'clear' }),
          expect.objectContaining({ id: 'paste' }),
        ]),
      }),
    );
    expect(sendControlsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canQueueMessage: true,
      }),
    );
    expect(sendControlsMock.mock.calls[0]?.[0]).not.toHaveProperty('onPasteFromClipboard');
    expect(sendControlsMock.mock.calls[0]?.[0]).not.toHaveProperty('onClearInput');
    expect(sendControlsMock.mock.calls[0]?.[0]).not.toHaveProperty('showInputPasteButton');
    expect(sendControlsMock.mock.calls[0]?.[0]).not.toHaveProperty('showInputClearButton');
    expect(renderer.container.querySelector('[data-testid="clear-input-button"]')).not.toBeNull();
    expect(renderer.container.querySelector('[data-testid="paste-button"]')).not.toBeNull();
    expect(renderer.container.querySelector('[data-testid="composer-more-menu"]')).toBeNull();
  });

  it('keeps local input edit actions clickable while the model is responding', async () => {
    mockActionRowMeasurements({ containerWidth: 500, leftWidth: 88, rightWidth: 292 });

    renderActions({
      inputText: 'Translate or edit this while the model responds',
      isLoading: true,
      showInputTranslationButton: true,
      showInputPasteButton: true,
      showInputClearButton: true,
    });
    await waitForActionRowMeasurement();

    expect(auxiliaryButtonsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ id: 'translate', disabled: false }),
          expect.objectContaining({ id: 'clear', disabled: false }),
          expect.objectContaining({ id: 'paste', disabled: false }),
        ]),
      }),
    );
  });

  it('moves auxiliary composer actions into the more menu only when the direct row overflows', async () => {
    mockActionRowMeasurements({ containerWidth: 300, leftWidth: 88, rightWidth: 292 });

    renderActions({
      inputText: 'Translate or send this',
      canQueueMessage: true,
      showInputTranslationButton: true,
      showInputPasteButton: true,
      showInputClearButton: true,
    });
    await waitForActionRowMeasurement();

    expect(sendControlsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canQueueMessage: true,
      }),
    );
    expect(renderer.container.querySelector('[data-testid="clear-input-button"]')).toBeNull();
    expect(renderer.container.querySelector('[data-testid="paste-button"]')).toBeNull();
    expect(renderer.container.querySelector('[data-testid="composer-more-menu"]')).not.toBeNull();
  });

  it('collapses auxiliary composer actions before the row becomes visually cramped on narrow screens', async () => {
    mockActionRowMeasurements({ containerWidth: 318, leftWidth: 96, rightWidth: 188 });

    renderActions({
      showInputPasteButton: true,
      showInputClearButton: true,
    });
    await waitForActionRowMeasurement();

    expect(renderer.container.querySelector('[data-testid="paste-button"]')).toBeNull();
    expect(renderer.container.querySelector('[data-testid="composer-more-menu"]')).not.toBeNull();
  });
});
