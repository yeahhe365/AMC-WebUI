import { type ChatMessage, type ContentPart, type UploadedFile, type ChatHistoryItem, MediaResolution } from '@/types';
import type { PartMediaResolutionLevel } from '@google/genai';
import { logService } from '@/services/logService';
import { isGemini3Model } from '@/utils/model/modelCapabilities';
import { normalizeModelId } from '@/utils/model/modelId';
import { blobToBase64, fileToString } from '@/utils/file/fileEncoding';
import { getFileKindFlags, isImageMimeType, isTextFile } from '@/utils/file/fileTypeClassification';

import { usesRemoteFileReference } from './fileTransferStrategy';
import { formatHistoryFileApiUnavailablePartText } from './geminiFilesApi';
import { stripReasoningMarkup } from './reasoning';

export const GEMINI_IMAGE_HISTORY_REHYDRATION_ERROR =
  'A previously generated image is missing from this image edit history. Please reattach the image or start a new image edit turn.';

const isGeminiImageHistoryTarget = (modelId?: string): boolean => {
  if (!modelId) return false;

  const normalizedId = normalizeModelId(modelId);
  return (
    normalizedId === 'gemini-3-pro-image-preview' ||
    normalizedId === 'gemini-3.1-flash-image-preview' ||
    normalizedId === 'gemini-3.1-flash-lite-image'
  );
};

// PART_MEDIA_RESOLUTION_LEVEL bridges the local MediaResolution string enum to
// @google/genai's PartMediaResolutionLevel literal union via per-case `as const`
// literals (a single-layer assertion) rather than a double cast through unknown.
const PART_MEDIA_RESOLUTION_LEVEL = {
  MEDIA_RESOLUTION_UNSPECIFIED: 'MEDIA_RESOLUTION_UNSPECIFIED',
  MEDIA_RESOLUTION_LOW: 'MEDIA_RESOLUTION_LOW',
  MEDIA_RESOLUTION_MEDIUM: 'MEDIA_RESOLUTION_MEDIUM',
  MEDIA_RESOLUTION_HIGH: 'MEDIA_RESOLUTION_HIGH',
  MEDIA_RESOLUTION_ULTRA_HIGH: 'MEDIA_RESOLUTION_ULTRA_HIGH',
} as const;

const toPartMediaResolutionLevel = (resolution: MediaResolution): PartMediaResolutionLevel => {
  switch (resolution) {
    case MediaResolution.MEDIA_RESOLUTION_LOW:
      return PART_MEDIA_RESOLUTION_LEVEL.MEDIA_RESOLUTION_LOW as PartMediaResolutionLevel;
    case MediaResolution.MEDIA_RESOLUTION_MEDIUM:
      return PART_MEDIA_RESOLUTION_LEVEL.MEDIA_RESOLUTION_MEDIUM as PartMediaResolutionLevel;
    case MediaResolution.MEDIA_RESOLUTION_HIGH:
      return PART_MEDIA_RESOLUTION_LEVEL.MEDIA_RESOLUTION_HIGH as PartMediaResolutionLevel;
    case MediaResolution.MEDIA_RESOLUTION_ULTRA_HIGH:
      return PART_MEDIA_RESOLUTION_LEVEL.MEDIA_RESOLUTION_ULTRA_HIGH as PartMediaResolutionLevel;
    default:
      return PART_MEDIA_RESOLUTION_LEVEL.MEDIA_RESOLUTION_UNSPECIFIED as PartMediaResolutionLevel;
  }
};

const normalizePartMediaResolution = (resolution: MediaResolution, isImage: boolean): MediaResolution => {
  if (resolution === MediaResolution.MEDIA_RESOLUTION_ULTRA_HIGH && !isImage) {
    return MediaResolution.MEDIA_RESOLUTION_HIGH;
  }

  return resolution;
};

interface FilePartBuildContext {
  modelId?: string;
  mediaResolution?: MediaResolution;
  preferCodeExecutionFileInputs: boolean;
}

/** Builds a single ContentPart for one uploaded file (or null if it contributes nothing). */
const buildFilePart = async (
  file: UploadedFile,
  context: FilePartBuildContext,
): Promise<{ file: UploadedFile; part: ContentPart | null }> => {
  const enrichedFile = { ...file };
  let part: ContentPart | null = null;

  if (file.omittedFromApiHistory) {
    return { file: enrichedFile, part: { text: formatHistoryFileApiUnavailablePartText(file.name) } };
  }

  if (file.isProcessing || file.error || file.uploadState !== 'active') {
    return { file: enrichedFile, part };
  }

  const fileKindFlags = getFileKindFlags(file);
  const { isImage, isVideo, isYoutube, isPdf } = fileKindFlags;
  const isTextLike = isTextFile(file);
  const supportsPartMediaResolution = !!context.modelId && isGemini3Model(context.modelId);

  if (usesRemoteFileReference(file) && file.fileUri) {
    // Remote file references are already available to Gemini by URI.
    if (isYoutube) {
      // YouTube URLs should be sent without a mimeType.
      part = { fileData: { fileUri: file.fileUri } };
    } else {
      part = { fileData: { mimeType: file.type, fileUri: file.fileUri } };
    }
  } else {
    // Local files are sent as text or inline data.
    const fileSource = file.rawFile;
    const urlSource = file.dataUrl;

    if (isTextLike) {
      if (context.preferCodeExecutionFileInputs) {
        let base64DataForApi: string | undefined;

        if (fileSource && fileSource instanceof Blob) {
          try {
            base64DataForApi = await blobToBase64(fileSource);
          } catch (error) {
            logService.error(`Failed to convert text file to base64 for ${file.name}`, { error });
          }
        } else if (urlSource) {
          try {
            const response = await fetch(urlSource);
            const blob = await response.blob();
            base64DataForApi = await blobToBase64(blob);

            if (!enrichedFile.rawFile) {
              enrichedFile.rawFile = new File([blob], file.name, { type: file.type || 'text/plain' });
            }
          } catch (error) {
            logService.error(`Failed to fetch text blob and convert to base64 for ${file.name}`, { error });
          }
        }

        if (base64DataForApi) {
          part = {
            inlineData: {
              mimeType: file.type || 'text/plain',
              data: base64DataForApi,
            },
          };
        }
      }

      if (!part) {
        let textContent = '';
        if (fileSource && (fileSource instanceof File || fileSource instanceof Blob)) {
          textContent = await fileToString(fileSource as File);
        } else if (urlSource) {
          // Fetch from URL when rawFile is missing.
          const response = await fetch(urlSource);
          textContent = await response.text();
        }
        if (textContent) {
          part = { text: textContent };
        }
      }
    } else {
      // Only allow known inline media types to prevent API 400 errors.
      if (fileKindFlags.isInlineData) {
        let base64DataForApi: string | undefined;

        if (fileSource && fileSource instanceof Blob) {
          try {
            base64DataForApi = await blobToBase64(fileSource);
          } catch (error) {
            logService.error(`Failed to convert rawFile to base64 for ${file.name}`, { error });
          }
        } else if (urlSource) {
          try {
            const response = await fetch(urlSource);
            const blob = await response.blob();
            base64DataForApi = await blobToBase64(blob);

            // Recreate rawFile when persistence kept only a blob/data URL.
            if (!enrichedFile.rawFile) {
              enrichedFile.rawFile = new File([blob], file.name, { type: file.type });
            }
          } catch (error) {
            logService.error(`Failed to fetch blob and convert to base64 for ${file.name}`, { error });
          }
        }

        if (base64DataForApi) {
          part = { inlineData: { mimeType: file.type, data: base64DataForApi } };
        }
      } else {
        part = { text: `[Attachment: ${file.name} (Binary content not supported for direct reading)]` };
      }
    }
  }

  // Video metadata works for both inline and fileUri video/youtube parts.
  if (part && (isVideo || isYoutube) && file.videoMetadata) {
    part.videoMetadata = { ...part.videoMetadata };

    if (file.videoMetadata.startOffset) {
      part.videoMetadata.startOffset = file.videoMetadata.startOffset;
    }
    if (file.videoMetadata.endOffset) {
      part.videoMetadata.endOffset = file.videoMetadata.endOffset;
    }
    if (file.videoMetadata.fps) {
      part.videoMetadata.fps = file.videoMetadata.fps;
    }
  }

  // File-level media resolution overrides the global setting.
  const effectiveResolution = file.mediaResolution || context.mediaResolution;

  if (
    part &&
    supportsPartMediaResolution &&
    effectiveResolution &&
    effectiveResolution !== MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED
  ) {
    const isResolutionEligibleMedia = isImage || isVideo || isYoutube || isPdf;
    const shouldAttachMediaResolution = isResolutionEligibleMedia && Boolean(part.fileData || part.inlineData);
    if (shouldAttachMediaResolution) {
      part.mediaResolution = {
        level: toPartMediaResolutionLevel(normalizePartMediaResolution(effectiveResolution, isImage)),
      };
    }
  }

  return { file: enrichedFile, part };
};

export const buildContentParts = async (
  text: string,
  files?: UploadedFile[],
  modelId?: string,
  mediaResolution?: MediaResolution,
  preferCodeExecutionFileInputs: boolean = false,
): Promise<{
  contentParts: ContentPart[];
  enrichedFiles: UploadedFile[];
}> => {
  const context: FilePartBuildContext = { modelId, mediaResolution, preferCodeExecutionFileInputs };

  const processedResults = await Promise.all((files || []).map((file) => buildFilePart(file, context)));

  const enrichedFiles = processedResults.map((result) => result.file);
  const dataParts = processedResults.flatMap((result): ContentPart[] => {
    if (!result.part) return [];

    const isTextLike = isTextFile(result.file);
    if (isTextLike && result.part.text) {
      return [
        { text: 'Attached text file:' },
        { text: result.file.name },
        { text: 'Text file content:' },
        result.part,
        { text: 'End of attached text file.' },
      ];
    }

    return [result.part];
  });

  const userTypedText = text.trim();
  const contentPartsResult: ContentPart[] = [];

  // Place media parts first as recommended by Gemini documentation for better multimodal performance.
  contentPartsResult.push(...dataParts);

  if (userTypedText) {
    contentPartsResult.push({ text: userTypedText });
  }

  return { contentParts: contentPartsResult, enrichedFiles };
};

export const createChatHistoryForApi = async (
  messages: ChatMessage[],
  stripThinking: boolean = false,
  modelId?: string,
  preferCodeExecutionFileInputs: boolean = false,
  alwaysKeepThinkingInContext: boolean = false,
): Promise<ChatHistoryItem[]> => {
  const historyItems: ChatHistoryItem[] = [];

  for (const message of messages) {
    if (message.excludeFromContext) continue;
    if (message.role !== 'user' && message.role !== 'model') continue;

    const apiParts = message.apiParts;
    const hasApiParts = !!apiParts && apiParts.length > 0;
    const parts: ContentPart[] = hasApiParts
      ? await (async () => {
          const generatedFiles = [...(message.files || [])];
          const hasCodeExecutionArtifacts = apiParts.some((part) =>
            Boolean(part.executableCode || part.codeExecutionResult),
          );

          const takeGeneratedFile = (mimeType?: string) => {
            if (generatedFiles.length === 0) return undefined;
            if (!mimeType) return generatedFiles.shift();

            const matchingIndex = generatedFiles.findIndex((file) => file.type === mimeType);
            if (matchingIndex === -1) return generatedFiles.shift();
            const [file] = generatedFiles.splice(matchingIndex, 1);
            return file;
          };

          return Promise.all(
            apiParts
              .filter((apiPart) => !(stripThinking && apiPart.thought))
              .map(async (apiPart) => {
                const partCopy = structuredClone(apiPart);

                if (stripThinking && message.role === 'model' && typeof partCopy.text === 'string') {
                  const strippedText = stripReasoningMarkup(partCopy.text);
                  if (strippedText) {
                    partCopy.text = strippedText;
                  } else {
                    delete partCopy.text;
                    delete partCopy.thoughtSignature;
                  }
                }

                if (partCopy.inlineData) {
                  const mimeType = partCopy.inlineData.mimeType || 'unknown';
                  const isGeminiImageHistoryPart = isImageMimeType(mimeType) && isGeminiImageHistoryTarget(modelId);
                  const canRehydrateGeneratedMedia =
                    isImageMimeType(mimeType) && (hasCodeExecutionArtifacts || isGeminiImageHistoryPart);
                  if (partCopy.inlineData.data && canRehydrateGeneratedMedia) {
                    return partCopy;
                  }

                  const generatedFile = canRehydrateGeneratedMedia ? takeGeneratedFile(mimeType) : undefined;

                  if (generatedFile?.rawFile instanceof Blob) {
                    try {
                      return {
                        ...partCopy,
                        inlineData: {
                          ...partCopy.inlineData,
                          data: await blobToBase64(generatedFile.rawFile),
                        },
                      };
                    } catch (error) {
                      logService.error(`Failed to rehydrate generated media for history: ${generatedFile.name}`, {
                        error,
                      });
                    }
                  }

                  if (isGeminiImageHistoryPart) {
                    throw new Error(GEMINI_IMAGE_HISTORY_REHYDRATION_ERROR);
                  }

                  return {
                    text: `[System Note: The model previously generated a media file of type '${mimeType}'. Content omitted from history to preserve memory and context window.]`,
                  };
                }
                return partCopy;
              }),
          ).then((candidateParts) => candidateParts.filter((part) => Object.keys(part).length > 0));
        })()
      : await (async () => {
          let contentToUse = message.content;
          if (stripThinking) {
            contentToUse = stripReasoningMarkup(contentToUse);
          }
          const { contentParts } = await buildContentParts(
            contentToUse,
            message.files,
            modelId,
            undefined,
            preferCodeExecutionFileInputs,
          );
          return contentParts;
        })();

    // Fallback for older sessions that only stored a flat list of signatures.
    if (
      !hasApiParts &&
      message.role === 'model' &&
      message.thoughtSignatures &&
      message.thoughtSignatures.length > 0 &&
      parts.length > 0
    ) {
      parts[parts.length - 1].thoughtSignature = message.thoughtSignatures[message.thoughtSignatures.length - 1];
    }

    // "Always keep thinking in context": inject the full reasoning text as a
    // leading text part on model messages so it is replayed in future context.
    // Runs after the signature fallback so any thoughtSignature stays last.
    // Plain text part — downstream converters map it to each protocol's text
    // content, and since shouldStripThinkingFromContext is forced false when
    // this switch is on, the pipeline will not strip it back out.
    if (alwaysKeepThinkingInContext && message.role === 'model' && message.thoughts && message.thoughts.trim()) {
      parts.unshift({ text: `<thinking>\n${message.thoughts.trim()}\n</thinking>` });
    }

    const role = message.role as 'user' | 'model';

    // Merge consecutive messages of the same role to prevent API 400 errors.
    const lastHistoryItem = historyItems[historyItems.length - 1];
    if (lastHistoryItem && lastHistoryItem.role === role) {
      lastHistoryItem.parts = lastHistoryItem.parts.concat(parts);
    } else {
      historyItems.push({ role, parts });
    }
  }

  return historyItems;
};
