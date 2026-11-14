import type { AppSettings, UploadedFile } from '@/types';
import { getConfiguredApiClient } from '@/services/api/apiClient';
import { getServerAuthHeaders } from '@/services/api/apiAuthHeaders';
import {
  getGeminiApiBaseUrlForSettings,
  getNormalizedUpstreamBaseUrl,
  shouldAttachGeminiUpstreamHeader,
} from '@/services/api/geminiApiBaseUrl';
import { base64ToBlob, blobToBase64 } from '@/utils/file/fileEncoding';

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 120;

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException('Video generation cancelled', 'AbortError');
};

const waitForNextPoll = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, POLL_INTERVAL_MS);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Video generation cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });

interface GenerateOmniVideoParams {
  apiKey: string;
  appSettings: AppSettings;
  text: string;
  files: UploadedFile[];
  previousInteractionId?: string;
  signal: AbortSignal;
}

export const generateOmniVideo = async ({
  apiKey,
  appSettings,
  text,
  files,
  previousInteractionId,
  signal,
}: GenerateOmniVideoParams): Promise<{ interactionId: string; video?: Blob; text?: string }> => {
  throwIfAborted(signal);
  const images = await Promise.all(
    files.map(async (file) => {
      if (!(file.rawFile instanceof Blob)) {
        throw new Error(`Image data for "${file.name}" is unavailable. Please attach it again.`);
      }
      return { type: 'image' as const, mime_type: file.type, data: await blobToBase64(file.rawFile) };
    }),
  );
  throwIfAborted(signal);

  const baseUrl = getGeminiApiBaseUrlForSettings(appSettings);
  const client = await getConfiguredApiClient(apiKey, { baseUrl, timeout: 20 * 60 * 1000 });
  throwIfAborted(signal);
  const interaction = await client.interactions.create(
    {
      model: 'gemini-omni-1.2-flash',
      input: images.length ? [...images, { type: 'text', text }] : text,
      ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
      response_format: { type: 'video', delivery: 'uri' },
      store: true,
    },
    { signal, retries: { strategy: 'none' } },
  );
  throwIfAborted(signal);

  if (!interaction.id || interaction.status !== 'completed') {
    throw new Error(`Video generation did not complete (status: ${interaction.status ?? 'unknown'}).`);
  }
  const outputText = interaction.output_text?.trim() ? interaction.output_text : undefined;
  const result = { interactionId: interaction.id, ...(outputText ? { text: outputText } : {}) };
  const output = interaction.output_video;
  if (!output && outputText) return result;
  if (output?.data) {
    return { ...result, video: base64ToBlob(output.data, output.mime_type || 'video/mp4') };
  }
  const fileId = output?.uri?.match(/(?:^|\/)files\/([a-zA-Z0-9_-]+)(?::download)?(?:[/?#]|$)/)?.[1];
  if (!fileId) throw new Error('Video generation returned no downloadable video.');

  const name = `files/${fileId}`;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal);
    const metadata = await client.files.get({ name, config: { abortSignal: signal } });
    if (metadata.state === 'ACTIVE') {
      const upstream = shouldAttachGeminiUpstreamHeader(appSettings) ? getNormalizedUpstreamBaseUrl(appSettings) : null;
      const response = await fetch(`${baseUrl}/v1beta/${name}:download?alt=media`, {
        headers: {
          'x-goog-api-key': apiKey,
          ...getServerAuthHeaders(appSettings.serverAccessPassword),
          ...(upstream ? { 'x-gemini-upstream-base-url': upstream } : {}),
        },
        signal,
      });
      if (!response.ok) throw new Error(`Video download failed (HTTP ${response.status}).`);
      const downloaded = await response.blob();
      if (!downloaded.size) throw new Error('Video download was empty.');
      const video = downloaded.type.startsWith('video/')
        ? downloaded
        : downloaded.slice(0, downloaded.size, 'video/mp4');
      return { ...result, video };
    }
    if (metadata.state === 'FAILED') throw new Error('Video processing failed.');
    await waitForNextPoll(signal);
  }
  throw new Error('Video processing timed out. The generated interaction may still be available in Google AI Studio.');
};
