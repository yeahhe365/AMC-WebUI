import { describe, expect, it } from 'vitest';
import { createChatMessage, createUploadedFile } from '@/test/data/factories';
import { formatHistoryFileApiUnavailablePartText } from '@/utils/chat/geminiFilesApi';
import { prepareHistoryForOpenAICompatibleMode } from './openaiCompatibleFiles';

const translate = (key: string) => {
  if (key === 'messageSenderHistoryFileReferenceUnavailable') {
    return 'unavailable:{filename}';
  }
  return key;
};

describe('prepareHistoryForOpenAICompatibleMode', () => {
  it('inlines historical Gemini Files API attachments that have a local backup', async () => {
    const rawFile = new File(['img'], 'shot.png', { type: 'image/png' });
    const messages = [
      createChatMessage({
        id: 'user-1',
        content: 'look',
        files: [
          createUploadedFile({
            id: 'file-1',
            name: 'shot.png',
            type: 'image/png',
            rawFile,
            fileApiName: 'files/gemini',
            fileUri: 'https://files/gemini',
            transferStrategy: 'files-api',
          }),
        ],
        apiParts: [{ fileData: { mimeType: 'image/png', fileUri: 'https://files/gemini' } }, { text: 'look' }],
      }),
    ];

    const result = await prepareHistoryForOpenAICompatibleMode({ messages, translate });

    expect(result.changed).toBe(true);
    expect(result.messages[0].content).toBe('look');
    expect(result.messages[0].files?.[0]).toEqual(
      expect.objectContaining({
        id: 'file-1',
        rawFile,
        fileApiName: undefined,
        fileUri: undefined,
        transferStrategy: 'inline',
      }),
    );
    expect(result.messages[0].apiParts?.[0]).toEqual({
      inlineData: { mimeType: 'image/png', data: expect.any(String) },
    });
    expect(result.messages[0].apiParts?.[1]).toEqual({ text: 'look' });
  });

  it('omits historical Gemini Files API ids that cannot be inlined, without rewriting user content', async () => {
    const messages = [
      createChatMessage({
        id: 'user-1',
        content: 'summarize this',
        files: [
          createUploadedFile({
            id: 'file-remote',
            name: 'remote-only.pdf',
            type: 'application/pdf',
            fileApiName: 'files/expired',
            fileUri: 'https://files/expired',
            transferStrategy: 'remote-file-id',
          }),
        ],
        apiParts: [
          { fileData: { mimeType: 'application/pdf', fileUri: 'https://files/expired' } },
          { text: 'summarize this' },
        ],
      }),
    ];

    const result = await prepareHistoryForOpenAICompatibleMode({ messages, translate });

    expect(result.changed).toBe(true);
    expect(result.messages[0].content).toBe('summarize this');
    expect(result.messages[0].files?.[0]).toEqual(
      expect.objectContaining({
        omittedFromApiHistory: true,
        fileApiName: undefined,
        fileUri: undefined,
        uploadState: 'failed',
        error: 'unavailable:remote-only.pdf',
      }),
    );
    expect(result.messages[0].apiParts).toEqual([
      { text: formatHistoryFileApiUnavailablePartText('remote-only.pdf') },
      { text: 'summarize this' },
    ]);
  });

  it('leaves history unchanged when there are no Gemini Files API references', async () => {
    const messages = [createChatMessage({ content: 'hello' })];
    const result = await prepareHistoryForOpenAICompatibleMode({ messages, translate });
    expect(result).toEqual({ changed: false, messages });
  });
});
