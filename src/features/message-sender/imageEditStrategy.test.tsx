import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslator } from '@/i18n/translations';
import { createAppSettings, createChatSettings } from '@/test/data/factories';

const {
  handleApiErrorMock,
  editImageMock,
  buildContentPartsMock,
  createChatHistoryForApiMock,
  performOptimisticSessionUpdateMock,
  createMessageMock,
  createUploadedFileFromBase64Mock,
} = vi.hoisted(() => ({
  handleApiErrorMock: vi.fn(),
  editImageMock: vi.fn(),
  buildContentPartsMock: vi.fn(),
  createChatHistoryForApiMock: vi.fn(),
  performOptimisticSessionUpdateMock: vi.fn((prev: unknown) => prev),
  createMessageMock: vi.fn((role: string, content: string, options: Record<string, unknown> = {}) => ({
    id: options.id ?? `${role}-message`,
    role,
    content,
    timestamp: new Date('2026-04-21T00:00:00.000Z'),
    ...options,
  })),
  createUploadedFileFromBase64Mock: vi.fn(() => ({
    id: 'file-1',
    name: 'edited-image-1.png',
    type: 'image/png',
    size: 123,
  })),
}));

vi.mock('./useApiErrorHandler', () => ({
  useApiErrorHandler: () => ({
    handleApiError: handleApiErrorMock,
  }),
}));

vi.mock('@/services/api/generation/imageEditApi', () => ({
  editImageApi: editImageMock,
}));

vi.mock('@/utils/chat/builder', () => ({
  buildContentParts: buildContentPartsMock,
  createChatHistoryForApi: createChatHistoryForApiMock,
  GEMINI_IMAGE_HISTORY_REHYDRATION_ERROR:
    'A previously generated image is missing from this image edit history. Please reattach the image or start a new image edit turn.',
}));

vi.mock('@/utils/chat/session', async () => {
  const { createChatSessionMockModule } = await import('@/test/doubles/moduleMocks');

  return createChatSessionMockModule({
    performOptimisticSessionUpdate: performOptimisticSessionUpdateMock,
    createMessage: createMessageMock,
  });
});

vi.mock('@/utils/chat/parsing', () => ({
  createUploadedFileFromBase64: createUploadedFileFromBase64Mock,
}));

vi.mock('@/utils/model/modelCapabilities', () => ({
  shouldStripThinkingFromContext: vi.fn(() => false),
}));

vi.mock('@/utils/browserCompletionFeedback', () => ({
  playCompletionSound: vi.fn(),
}));

vi.mock('@/utils/chat/ids', () => ({
  generateUniqueId: vi.fn(() => 'generated-session'),
}));

import { sendImageEditMessage } from './imageEditStrategy';

describe('imageEditStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildContentPartsMock.mockResolvedValue({ contentParts: [{ text: 'edit this image' }] });
    createChatHistoryForApiMock.mockResolvedValue([]);
    editImageMock.mockResolvedValue([
      { text: 'Updated image', thoughtSignature: 'sig-text' },
      {
        inlineData: {
          mimeType: 'image/png',
          data: 'base64-image',
        },
        thoughtSignature: 'sig-image',
      },
    ]);
  });

  it('persists returned apiParts so image edits can participate in future turns', async () => {
    const updateAndPersistSessions = vi.fn();
    const setActiveSessionId = vi.fn();
    const runMessageLifecycle = vi.fn(async ({ execute }) => execute());

    const abortController = new AbortController();

    await act(async () => {
      await sendImageEditMessage({
        keyToUse: 'api-key',
        activeSessionId: 'session-1',
        messages: [],
        generationId: 'generation-1',
        abortController,
        appSettings: createAppSettings({
          generateQuadImages: false,
          isCompletionSoundEnabled: false,
        }),
        currentChatSettings: createChatSettings({
          modelId: 'gemini-3.1-flash-image-preview',
          systemInstruction: '',
        }),
        text: 'edit this image',
        files: [],
        editingMessageId: null,
        aspectRatio: '1:1',
        imageSize: '2K',
        imageOutputMode: 'IMAGE_TEXT',
        t: getTranslator('en'),
        updateAndPersistSessions,
        setActiveSessionId,
        runMessageLifecycle,
      });
    });

    const finalUpdater = updateAndPersistSessions.mock.calls[1]?.[0];
    expect(finalUpdater).toBeTypeOf('function');

    const finalState = finalUpdater([
      {
        id: 'session-1',
        title: 'Session',
        timestamp: 1,
        settings: createChatSettings(),
        messages: [
          {
            id: 'generation-1',
            role: 'model',
            content: '',
            isLoading: true,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          },
        ],
      },
    ]);

    expect(finalState[0].messages[0]).toEqual(
      expect.objectContaining({
        content: 'Updated image',
        apiParts: [
          { text: 'Updated image', thoughtSignature: 'sig-text' },
          {
            inlineData: {
              mimeType: 'image/png',
              data: '',
            },
            thoughtSignature: 'sig-image',
          },
        ],
      }),
    );
    expect(runMessageLifecycle).toHaveBeenCalledOnce();
    expect(createMessageMock).toHaveBeenCalledWith(
      'user',
      'edit this image',
      expect.objectContaining({
        apiParts: [{ text: 'edit this image' }],
      }),
    );
  });

  it('uses translated image edit errors and partial failure notes', async () => {
    const updateAndPersistSessions = vi.fn();
    const setActiveSessionId = vi.fn();
    const runMessageLifecycle = vi.fn(async ({ execute }) => execute());
    editImageMock
      .mockResolvedValueOnce([
        {
          inlineData: {
            mimeType: 'image/png',
            data: 'base64-image',
          },
        },
      ])
      .mockRejectedValueOnce(new Error('blocked by policy'))
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce('network down');

    await act(async () => {
      await sendImageEditMessage({
        keyToUse: 'api-key',
        activeSessionId: 'session-1',
        messages: [],
        generationId: 'generation-1',
        abortController: new AbortController(),
        appSettings: createAppSettings({
          generateQuadImages: true,
          isCompletionSoundEnabled: false,
        }),
        currentChatSettings: createChatSettings({
          modelId: 'gemini-3.1-flash-image-preview',
          systemInstruction: '',
        }),
        text: 'edit this image',
        files: [],
        editingMessageId: null,
        aspectRatio: '1:1',
        imageSize: '2K',
        imageOutputMode: 'IMAGE_TEXT',
        t: getTranslator('zh'),
        updateAndPersistSessions,
        setActiveSessionId,
        runMessageLifecycle,
      });
    });

    expect(runMessageLifecycle).toHaveBeenCalledWith(expect.objectContaining({ errorPrefix: '图像编辑错误' }));

    const finalUpdater = updateAndPersistSessions.mock.calls[1]?.[0];
    const finalState = finalUpdater([
      {
        id: 'session-1',
        title: 'Session',
        timestamp: 1,
        settings: createChatSettings(),
        messages: [
          {
            id: 'generation-1',
            role: 'model',
            content: '',
            isLoading: true,
            timestamp: new Date('2026-04-21T00:00:00.000Z'),
          },
        ],
      },
    ]);

    expect(finalState[0].messages[0].content).toContain('图片 2：请求失败。错误：blocked by policy');
    expect(finalState[0].messages[0].content).toContain('图片 3：这次请求没有生成图片。');
    expect(finalState[0].messages[0].content).toContain('图片 4：请求失败。错误：network down');
    expect(finalState[0].messages[0].content).toContain(
      '*[提示：4 张图片中仅 1 张生成成功。部分图片可能因安全策略被拦截。]*',
    );
  });

  it('translates missing generated image history errors before the image edit request starts', async () => {
    createChatHistoryForApiMock.mockRejectedValueOnce(
      new Error(
        'A previously generated image is missing from this image edit history. Please reattach the image or start a new image edit turn.',
      ),
    );

    const runMessageLifecycle = vi.fn(async ({ execute }) => {
      try {
        return await execute();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(
          '之前生成的图片已无法从历史记录中恢复。请重新附加这张图片，或开启新的图片编辑回合。',
        );
        return undefined;
      }
    });

    await act(async () => {
      await sendImageEditMessage({
        keyToUse: 'api-key',
        activeSessionId: 'session-1',
        messages: [],
        generationId: 'generation-1',
        abortController: new AbortController(),
        appSettings: createAppSettings({
          generateQuadImages: false,
          isCompletionSoundEnabled: false,
        }),
        currentChatSettings: createChatSettings({
          modelId: 'gemini-3.1-flash-image-preview',
          systemInstruction: '',
        }),
        text: 'edit this image',
        files: [],
        editingMessageId: null,
        aspectRatio: '1:1',
        imageSize: '2K',
        imageOutputMode: 'IMAGE_TEXT',
        t: getTranslator('zh'),
        updateAndPersistSessions: vi.fn(),
        setActiveSessionId: vi.fn(),
        runMessageLifecycle,
      });
    });

    expect(editImageMock).not.toHaveBeenCalled();
  });
});
