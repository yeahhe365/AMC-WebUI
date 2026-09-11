import type { File as GeminiFile } from '@google/genai';
import { getConfiguredApiClient, getConfiguredApiClientContext } from './apiClient';
import { createUploadAbortError, uploadGeminiFileResumable } from './geminiResumableUpload';
import { logService } from '@/services/logService';

/**
 * Uploads a file using the Gemini resumable Files API and reports aggregate
 * progress after each completed chunk.
 */
export const uploadFileApi = async (
  apiKey: string,
  file: File,
  mimeType: string,
  displayName: string,
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<GeminiFile> => {
  logService.info(`Uploading file (resumable): ${displayName}`, { mimeType, size: file.size });

  if (signal.aborted) {
    throw createUploadAbortError();
  }

  try {
    const { uploadApiClient, apiBaseUrl, proxyBaseUrl } = await getConfiguredApiClientContext(apiKey);

    return await uploadGeminiFileResumable({
      apiClient: uploadApiClient,
      apiBaseUrl,
      proxyBaseUrl,
      apiKey,
      file,
      mimeType,
      displayName,
      signal,
      onProgress,
    });
  } catch (error) {
    logService.error(`Failed to upload file "${displayName}" to Gemini API:`, error);

    if (signal.aborted) {
      throw createUploadAbortError();
    }

    throw error;
  }
};

export const getFileMetadataApi = async (apiKey: string, fileApiName: string): Promise<GeminiFile | null> => {
  if (!fileApiName || !fileApiName.startsWith('files/')) {
    logService.error(`Invalid fileApiName format: ${fileApiName}. Must start with "files/".`);
    throw new Error('Invalid file ID format. Expected "files/your_file_id".');
  }
  try {
    logService.info(`Fetching metadata for file: ${fileApiName}`);
    const ai = await getConfiguredApiClient(apiKey);
    const file = await ai.files.get({ name: fileApiName });
    return file;
  } catch (error) {
    logService.error(`Failed to get metadata for file "${fileApiName}" from Gemini API:`, error);
    if (error instanceof Error && (error.message.includes('NOT_FOUND') || error.message.includes('404'))) {
      return null;
    }
    throw error;
  }
};

export const listFilesApi = async (
  apiKey: string,
  pageSize = 100,
  pageToken?: string,
): Promise<{ files: GeminiFile[]; nextPageToken?: string }> => {
  logService.info(`Listing files from Gemini Files API`, { pageSize, pageToken });
  try {
    const ai = await getConfiguredApiClient(apiKey);
    const pager = await ai.files.list({
      config: {
        pageSize,
        ...(pageToken ? { pageToken } : {}),
      },
    });

    let files: GeminiFile[] = [];
    if (Array.isArray(pager?.page)) {
      files = [...pager.page];
    } else if (pager && typeof (pager as AsyncIterable<GeminiFile>)[Symbol.asyncIterator] === 'function') {
      for await (const file of pager) {
        files.push(file);
      }
    }

    const nextPageToken = (pager?.params as { pageToken?: string } | undefined)?.pageToken;
    return { files, nextPageToken };
  } catch (error) {
    logService.error('Failed to list files from Gemini API:', error);
    throw error;
  }
};

export const deleteFileApi = async (apiKey: string, fileApiName: string): Promise<void> => {
  if (!fileApiName || !fileApiName.startsWith('files/')) {
    logService.error(`Invalid fileApiName format for deletion: ${fileApiName}.`);
    throw new Error('Invalid file ID format. Expected "files/your_file_id".');
  }
  logService.info(`Deleting file from Gemini Files API: ${fileApiName}`);
  try {
    const ai = await getConfiguredApiClient(apiKey);
    await ai.files.delete({ name: fileApiName });
  } catch (error) {
    logService.error(`Failed to delete file "${fileApiName}" from Gemini API:`, error);
    throw error;
  }
};

export const registerGcsFilesApi = async (apiKey: string, uris: string[]): Promise<GeminiFile[]> => {
  if (!uris || uris.length === 0) {
    return [];
  }
  logService.info(`Registering GCS files with Gemini Files API`, { uris });
  try {
    const ai = await getConfiguredApiClient(apiKey);
    if (typeof ai.files.registerFiles === 'function') {
      try {
        const response = await ai.files.registerFiles({ uris });
        return response.files ?? [];
      } catch (sdkError) {
        logService.warn('ai.files.registerFiles failed via SDK, attempting REST fallback', sdkError);
      }
    }
    const { uploadApiClient, apiBaseUrl } = await getConfiguredApiClientContext(apiKey);
    const response = await uploadApiClient.request({
      path: 'v1beta/files:register',
      body: JSON.stringify({ uris }),
      httpMethod: 'POST',
      httpOptions: {
        baseUrl: apiBaseUrl,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
      },
    });
    const data = (await response.json()) as { files?: GeminiFile[] };
    return data.files ?? [];
  } catch (error) {
    logService.error(`Failed to register GCS files in Gemini API:`, error);
    throw error;
  }
};
