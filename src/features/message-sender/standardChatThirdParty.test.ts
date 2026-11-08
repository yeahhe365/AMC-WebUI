import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentPart } from '@/types/chat';
import {
  executeThirdPartyChat,
  normalizePartsForNonAnthropicProvider,
  normalizeHistoryForNonAnthropicProvider,
  routeThrownStreamError,
} from './standardChatThirdParty';

vi.mock('@/utils/file/pdfTextExtraction', () => ({
  extractPdfTextFromBase64: vi.fn(async (base64: string) => {
    if (base64 === 'empty-doc') return '';
    return 'Extracted sample PDF text';
  }),
  extractPdfTextFromBase64WithMeta: vi.fn(async (base64: string) => {
    if (base64 === 'empty-doc') return { numPages: 2, text: '' };
    if (base64 === 'long-doc') return { numPages: 200, text: 'Page text', pagesRead: 50, truncated: true };
    return { numPages: 3, text: 'Extracted sample PDF text', pagesRead: 3, truncated: false };
  }),
}));

vi.mock('@/services/api/protocols/openai-responses/openaiResponsesApi', () => ({
  generateOpenAIResponsesTurnApi: vi.fn(),
  generateOpenAIResponsesTurnStreamApi: vi.fn(),
  sendOpenAIResponsesNonStream: vi.fn(),
  sendOpenAIResponsesStream: vi.fn(),
}));

vi.mock('@/services/api/protocols/openai-compatible/openaiCompatibleApi', () => ({
  generateOpenAICompatibleTurnApi: vi.fn(),
  generateOpenAICompatibleTurnStreamApi: vi.fn(),
  sendOpenAICompatibleMessageNonStream: vi.fn(),
  sendOpenAICompatibleMessageStream: vi.fn(),
}));

vi.mock('@/services/api/protocols/anthropic/anthropicApi', () => ({
  generateAnthropicTurnApi: vi.fn(),
  generateAnthropicTurnStreamApi: vi.fn(),
  sendAnthropicMessageNonStream: vi.fn(),
  sendAnthropicMessageStream: vi.fn(),
}));

describe('standardChatThirdParty utilities', () => {
  describe('normalizePartsForNonAnthropicProvider', () => {
    it('extracts text from PDF inlineData and converts to text part', async () => {
      const parts: ContentPart[] = [
        { text: 'Hello' },
        { inlineData: { mimeType: 'application/pdf', data: 'valid-base64' } } as unknown as ContentPart,
      ];

      const result = await normalizePartsForNonAnthropicProvider(parts);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: 'Hello' });
      expect(result[1]).toEqual({
        text: '[Document (PDF)]\nExtracted sample PDF text',
      });
    });

    it('handles empty extracted text with a fallback notice', async () => {
      const parts: ContentPart[] = [
        { inlineData: { mimeType: 'application/pdf', data: 'empty-doc' } } as unknown as ContentPart,
      ];

      const result = await normalizePartsForNonAnthropicProvider(parts);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        text: '[Document (PDF)]\n(Text content could not be extracted from this PDF)',
      });
    });

    it('leaves non-pdf inlineData parts untouched', async () => {
      const imagePart = { inlineData: { mimeType: 'image/png', data: 'png-bytes' } } as unknown as ContentPart;
      const result = await normalizePartsForNonAnthropicProvider([imagePart]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(imagePart);
    });
  });

  describe('normalizeHistoryForNonAnthropicProvider', () => {
    it('normalizes parts across all history turns', async () => {
      const history = [
        {
          role: 'user' as const,
          parts: [{ inlineData: { mimeType: 'application/pdf', data: 'valid-base64' } } as unknown as ContentPart],
        },
        {
          role: 'model' as const,
          parts: [{ text: 'Here is the summary' }],
        },
      ];

      const result = await normalizeHistoryForNonAnthropicProvider(history);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[0].parts[0]).toEqual({
        text: '[Document (PDF)]\nExtracted sample PDF text',
      });
      expect(result[1].parts[0]).toEqual({ text: 'Here is the summary' });
    });

    // CTX-1：历史里同一个 PDF 每轮都会被重新物化，没有缓存时线性变慢。
    it('reuses the extracted text for a PDF that repeats across turns', async () => {
      const { extractPdfTextFromBase64WithMeta } = await import('@/utils/file/pdfTextExtraction');
      const { clearAttachmentTextCache } = await import('@/utils/file/attachmentTextCache');
      clearAttachmentTextCache();
      vi.mocked(extractPdfTextFromBase64WithMeta).mockClear();
      const pdfPart = {
        inlineData: { mimeType: 'application/pdf', data: 'cached-base64-payload' },
      } as unknown as ContentPart;

      const history = [
        { role: 'user' as const, parts: [pdfPart] },
        { role: 'model' as const, parts: [{ text: 'summary' }] },
        { role: 'user' as const, parts: [pdfPart] },
      ];

      await normalizeHistoryForNonAnthropicProvider(history);
      await normalizeHistoryForNonAnthropicProvider(history);

      // 两次完整历史各出现两次同一个 PDF，但真正的 pdf.js 解析只该发生一次。
      expect(extractPdfTextFromBase64WithMeta).toHaveBeenCalledTimes(1);
    });

    it('tells the model when only part of a PDF was extracted', async () => {
      const { clearAttachmentTextCache } = await import('@/utils/file/attachmentTextCache');
      clearAttachmentTextCache();

      const result = await normalizePartsForNonAnthropicProvider([
        { inlineData: { mimeType: 'application/pdf', data: 'long-doc' } } as unknown as ContentPart,
      ]);

      expect(result[0]).toEqual({
        text: '[Document (PDF)] [Pages 1-50 of 200 extracted; the rest is not included]\nPage text',
      });
    });
  });

  describe('routeThrownStreamError', () => {
    it('calls streamOnError when runner throws', async () => {
      const onError = vi.fn();
      await routeThrownStreamError(async () => {
        throw new Error('Boom');
      }, onError);

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Boom' }));
    });

    it('does not call streamOnError when runner succeeds', async () => {
      const onError = vi.fn();
      await routeThrownStreamError(async () => {
        // success
      }, onError);

      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('executeThirdPartyChat with tools', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('dispatches to generateOpenAIResponsesTurnStreamApi when isStreamingEnabled is true', async () => {
      const { generateOpenAIResponsesTurnStreamApi, generateOpenAIResponsesTurnApi } =
        await import('@/services/api/protocols/openai-responses/openaiResponsesApi');

      (generateOpenAIResponsesTurnStreamApi as any).mockResolvedValue({
        modelContent: { role: 'model', parts: [{ text: 'done' }] },
        parts: [{ text: 'done' }],
        thoughts: undefined,
        usage: undefined,
        functionCalls: [],
      });

      const streamOnPart = vi.fn();
      const wrappedStreamOnComplete = vi.fn();

      await executeThirdPartyChat({
        activeProvider: {
          id: 'p-1',
          name: 'ResponsesProvider',
          protocol: 'openai-responses',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'test-key',
        } as any,
        apiModelId: 'gpt-4o',
        keyToUse: 'test-key',
        sessionToUpdate: {} as any,
        historyForChat: [],
        finalRole: 'user',
        finalParts: [{ text: 'use tool' }],
        combinedClientFunctions: {
          testTool: {
            declaration: { name: 'testTool', description: 'desc', parameters: {} },
            handler: vi.fn(),
          },
        },
        newAbortController: new AbortController(),
        generationId: 'gen-1',
        insertInternalToolMessages: vi.fn(),
        streamOnPart,
        onThoughtChunk: vi.fn(),
        streamOnError: vi.fn(),
        streamOnComplete: vi.fn(),
        wrappedStreamOnComplete,
        nonStreamOnComplete: vi.fn(),
        isStreamingEnabled: true,
      });

      expect(generateOpenAIResponsesTurnStreamApi).toHaveBeenCalled();
      expect(generateOpenAIResponsesTurnApi).not.toHaveBeenCalled();
      expect(wrappedStreamOnComplete).toHaveBeenCalled();
    });

    it('dispatches to generateOpenAIResponsesTurnApi when isStreamingEnabled is false', async () => {
      const { generateOpenAIResponsesTurnStreamApi, generateOpenAIResponsesTurnApi } =
        await import('@/services/api/protocols/openai-responses/openaiResponsesApi');

      (generateOpenAIResponsesTurnApi as any).mockResolvedValue({
        modelContent: { role: 'model', parts: [{ text: 'done non-stream' }] },
        parts: [{ text: 'done non-stream' }],
        thoughts: undefined,
        usage: undefined,
        functionCalls: [],
      });

      const streamOnPart = vi.fn();
      const wrappedStreamOnComplete = vi.fn();

      await executeThirdPartyChat({
        activeProvider: {
          id: 'p-1',
          name: 'ResponsesProvider',
          protocol: 'openai-responses',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'test-key',
        } as any,
        apiModelId: 'gpt-4o',
        keyToUse: 'test-key',
        sessionToUpdate: {} as any,
        historyForChat: [],
        finalRole: 'user',
        finalParts: [{ text: 'use tool' }],
        combinedClientFunctions: {
          testTool: {
            declaration: { name: 'testTool', description: 'desc', parameters: {} },
            handler: vi.fn(),
          },
        },
        newAbortController: new AbortController(),
        generationId: 'gen-1',
        insertInternalToolMessages: vi.fn(),
        streamOnPart,
        onThoughtChunk: vi.fn(),
        streamOnError: vi.fn(),
        streamOnComplete: vi.fn(),
        wrappedStreamOnComplete,
        nonStreamOnComplete: vi.fn(),
        isStreamingEnabled: false,
      });

      expect(generateOpenAIResponsesTurnApi).toHaveBeenCalled();
      expect(generateOpenAIResponsesTurnStreamApi).not.toHaveBeenCalled();
      expect(streamOnPart).toHaveBeenCalledWith(
        { text: 'done non-stream' },
        { recordFirstToken: false, source: 'third-party' },
      );
      expect(wrappedStreamOnComplete).toHaveBeenCalled();
    });

    it('dispatches to generateOpenAICompatibleTurnStreamApi when protocol is openai-compatible and isStreamingEnabled is true', async () => {
      const { generateOpenAICompatibleTurnStreamApi } =
        await import('@/services/api/protocols/openai-compatible/openaiCompatibleApi');

      (generateOpenAICompatibleTurnStreamApi as any).mockResolvedValue({
        modelContent: { role: 'model', parts: [{ text: 'done stream' }] },
        parts: [{ text: 'done stream' }],
        thoughts: undefined,
        usage: undefined,
        functionCalls: [],
      });

      const wrappedStreamOnComplete = vi.fn();

      await executeThirdPartyChat({
        activeProvider: {
          id: 'p-2',
          name: 'OpenAIProvider',
          protocol: 'openai-compatible',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'test-key',
        } as any,
        apiModelId: 'gpt-4o',
        keyToUse: 'test-key',
        sessionToUpdate: {} as any,
        historyForChat: [],
        finalRole: 'user',
        finalParts: [{ text: 'use tool' }],
        combinedClientFunctions: {
          testTool: {
            declaration: { name: 'testTool', description: 'desc', parameters: {} },
            handler: vi.fn(),
          },
        },
        newAbortController: new AbortController(),
        generationId: 'gen-2',
        insertInternalToolMessages: vi.fn(),
        streamOnPart: vi.fn(),
        onThoughtChunk: vi.fn(),
        streamOnError: vi.fn(),
        streamOnComplete: vi.fn(),
        wrappedStreamOnComplete,
        nonStreamOnComplete: vi.fn(),
        isStreamingEnabled: true,
      });

      expect(generateOpenAICompatibleTurnStreamApi).toHaveBeenCalled();
      expect(wrappedStreamOnComplete).toHaveBeenCalled();
    });

    it('dispatches to generateAnthropicTurnStreamApi when protocol is anthropic and isStreamingEnabled is true', async () => {
      const { generateAnthropicTurnStreamApi } = await import('@/services/api/protocols/anthropic/anthropicApi');

      (generateAnthropicTurnStreamApi as any).mockResolvedValue({
        modelContent: { role: 'model', parts: [{ text: 'done anthropic stream' }] },
        parts: [{ text: 'done anthropic stream' }],
        thoughts: undefined,
        usage: undefined,
        functionCalls: [],
      });

      const wrappedStreamOnComplete = vi.fn();

      await executeThirdPartyChat({
        activeProvider: {
          id: 'p-3',
          name: 'AnthropicProvider',
          protocol: 'anthropic',
          baseUrl: 'https://api.anthropic.com',
          apiKey: 'test-key',
        } as any,
        apiModelId: 'claude-3-7-sonnet',
        keyToUse: 'test-key',
        sessionToUpdate: {} as any,
        historyForChat: [],
        finalRole: 'user',
        finalParts: [{ text: 'use tool' }],
        combinedClientFunctions: {
          testTool: {
            declaration: { name: 'testTool', description: 'desc', parameters: {} },
            handler: vi.fn(),
          },
        },
        newAbortController: new AbortController(),
        generationId: 'gen-3',
        insertInternalToolMessages: vi.fn(),
        streamOnPart: vi.fn(),
        onThoughtChunk: vi.fn(),
        streamOnError: vi.fn(),
        streamOnComplete: vi.fn(),
        wrappedStreamOnComplete,
        nonStreamOnComplete: vi.fn(),
        isStreamingEnabled: true,
      });

      expect(generateAnthropicTurnStreamApi).toHaveBeenCalled();
      expect(wrappedStreamOnComplete).toHaveBeenCalled();
    });

    it('bypasses tool loop when activeModel has enableTools === false', async () => {
      const { sendAnthropicMessageStream } = await import('@/services/api/protocols/anthropic/anthropicApi');
      const { generateAnthropicTurnStreamApi } = await import('@/services/api/protocols/anthropic/anthropicApi');

      const wrappedStreamOnComplete = vi.fn();

      await executeThirdPartyChat({
        activeProvider: {
          id: 'p-3',
          name: 'AnthropicProvider',
          protocol: 'anthropic',
          baseUrl: 'https://api.anthropic.com',
          apiKey: 'test-key',
          models: [
            {
              id: 'claude-3-7-sonnet',
              name: 'Claude 3.7',
              enableTools: false,
            },
          ],
        } as any,
        apiModelId: 'claude-3-7-sonnet',
        keyToUse: 'test-key',
        sessionToUpdate: {} as any,
        historyForChat: [],
        finalRole: 'user',
        finalParts: [{ text: 'tools disabled' }],
        combinedClientFunctions: {
          testTool: {
            declaration: { name: 'testTool', description: 'desc', parameters: {} },
            handler: vi.fn(),
          },
        },
        newAbortController: new AbortController(),
        generationId: 'gen-4',
        insertInternalToolMessages: vi.fn(),
        streamOnPart: vi.fn(),
        onThoughtChunk: vi.fn(),
        streamOnError: vi.fn(),
        streamOnComplete: vi.fn(),
        wrappedStreamOnComplete,
        nonStreamOnComplete: vi.fn(),
        isStreamingEnabled: true,
      });

      expect(generateAnthropicTurnStreamApi).not.toHaveBeenCalled();
      expect(sendAnthropicMessageStream).toHaveBeenCalled();
    });
  });
});
