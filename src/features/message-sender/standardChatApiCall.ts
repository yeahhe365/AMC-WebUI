import { createChatHistoryForApi, appendTurnToHistory } from '@/utils/chat/builder';
import {
  buildAudioLocateDirective,
  buildImageLocateDirective,
  buildPdfLocateDirective,
  buildVideoLocateDirective,
} from '@/utils/media-nav/locateMarker';
import { isLiveArtifactsModeFromSettings } from '@/utils/live-artifacts/liveArtifactsMode';
import { getLiveArtifactsSystemPromptOverride } from '@/utils/live-artifacts/liveArtifactsPromptSettings';
import { composeSystemInstruction } from '@/features/prompts/promptCompositor';
import {
  collectSessionMediaFiles,
  isAudioFile,
  isImageFile,
  isPdfFile,
  isNavigableVideoFile,
  partsContainAudio,
  partsContainImage,
  partsContainPdf,
  partsContainVideo,
} from '@/utils/media-nav/sessionMediaFiles';
import { toError } from '@/utils/errorMessage';
import { createMessage } from '@/utils/chat/session';
import { isServerCodeExecutionMode } from '@/utils/codeExecution';
import {
  isGemini3Model,
  isGemmaModel,
  isImageGenerationModel,
  shouldStripThinkingFromContext,
} from '@/utils/model/modelCapabilities';
import { appendFunctionDeclarationsToTools, buildGenerationConfig } from '@/services/api/generationConfig';
import {
  generateContentTurnApi,
  sendStatelessMessageNonStreamApi,
  sendStatelessMessageStreamApi,
} from '@/services/api/chatApi';
import {
  sendOpenAICompatibleMessageNonStream,
  sendOpenAICompatibleMessageStream,
} from '@/services/api/openaiCompatibleApi';
import { sendOpenAIResponsesNonStream, sendOpenAIResponsesStream } from '@/services/api/openaiResponsesApi';
import { sendAnthropicMessageNonStream, sendAnthropicMessageStream } from '@/services/api/anthropicApi';
import { createMcpClientFunctions } from '@/features/mcp/mcpClientFunctions';
import { requestToolApproval } from '@/stores/mcpApprovalStore';
import { selectServersForTurn, useMcpRuntimeStore } from '@/stores/mcpRuntimeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { createStandardClientFunctions } from '@/features/standard-chat/standardClientFunctions';
import { runStandardToolLoop } from '@/features/standard-chat/standardToolLoop';
import { collectLocalPythonInputFiles } from '@/features/local-python/executionFiles';
import { getPyodideService } from '@/features/local-python/loadPyodideService';
import { updateSessionById } from '@/utils/chat/sessionMutations';
import {
  recordPendingStreamJob,
  advancePendingStreamJobSeq,
  clearPendingStreamJob,
  generateJobSecret,
} from '@/features/stream-jobs/amcStreamJobs';
import { isGeminiProxyRelativePath } from '@/services/api/geminiApiBaseUrl';
import type {
  ChatMessage,
  ChatSettings as IndividualChatSettings,
  NonStreamMessageCompleteHandler,
  UploadedFile,
} from '@/types';
import type { ContentPart } from '@/types/chat';
import type {
  GetStreamHandlers,
  SessionsUpdater,
  StandardChatProps,
  StreamHandlerFunctions,
} from './messageSenderTypes';
import type { resolveStandardChatTurn } from './standardChatTurn';
import { resolveChatApiRoute, isUnavailableThirdPartyRoute } from '@/utils/chatApiRoute';
import { getProxyProviderHeader } from '@/utils/thirdPartyApiProviders';
import { useChatStore } from '@/stores/chatStore';
import { ensureHistoryFilesApiReferences, resolveUploadableFile } from './fileApiReference';
import { uploadFileApi } from '@/services/api/fileApi';
import { getUploadLifecycleForGeminiState } from '@/utils/file-upload/fileUploadPolicy';
import {
  extractFilesApiIdentifierFromError,
  formatHistoryFileApiUnavailablePartText,
  getApiKeyFingerprint,
  getGeminiFilesApiNameFromUri,
  invalidateSessionFilesApiReferences,
  isFilesApiPermissionDeniedError,
  toFileApiExpirationTime,
} from '@/utils/chat/geminiFilesApi';
import { getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { getTranslator } from '@/i18n/translations';
import { resolveAppLanguage } from '@/i18n/languageRegistry';
import { logService } from '@/services/logService';

interface StandardChatApiCallContext {
  appSettings: StandardChatProps['appSettings'];
  messages: ChatMessage[];
  updateAndPersistSessions: SessionsUpdater;
  getStreamHandlers: GetStreamHandlers;
  aspectRatio: string;
  imageSize?: string;
  imageOutputMode: StandardChatProps['imageOutputMode'];
  resolveTurn: typeof resolveStandardChatTurn;
}

interface PerformStandardChatApiCallParams extends StandardChatApiCallContext {
  finalSessionId: string;
  generationId: string;
  generationStartTime: Date;
  keyToUse: string;
  activeModelId: string;
  promptParts: ContentPart[];
  effectiveEditingId: string | null;
  isContinueMode: boolean;
  isRawMode: boolean;
  sessionToUpdate: IndividualChatSettings;
  newAbortController: AbortController;
  textToUse: string;
  enrichedFiles: UploadedFile[];
}

const routeThrownStreamError = async (
  run: () => Promise<void>,
  streamOnError: (error: Error) => void | Promise<void>,
) => {
  try {
    await run();
  } catch (error) {
    await streamOnError(toError(error));
  }
};

const createNonStreamCompleteHandler =
  ({
    streamOnPart,
    onThoughtChunk,
    streamOnComplete,
    source,
  }: Pick<StreamHandlerFunctions, 'streamOnPart' | 'onThoughtChunk' | 'streamOnComplete'> & {
    source?: 'gemini' | 'third-party';
  }): NonStreamMessageCompleteHandler =>
  (parts, thoughts, usage, grounding, urlContext) => {
    for (const part of parts) {
      streamOnPart(part, { recordFirstToken: false, source });
    }
    if (thoughts) {
      onThoughtChunk(thoughts, { recordFirstToken: false, source });
    }
    streamOnComplete(usage, grounding, urlContext);
  };

export const performStandardChatApiCall = async ({
  appSettings,
  messages,
  updateAndPersistSessions,
  getStreamHandlers,
  aspectRatio,
  imageSize,
  imageOutputMode,
  resolveTurn,
  finalSessionId,
  generationId,
  generationStartTime,
  keyToUse,
  activeModelId,
  promptParts,
  effectiveEditingId,
  isContinueMode,
  isRawMode,
  sessionToUpdate,
  newAbortController,
  textToUse,
  enrichedFiles,
}: PerformStandardChatApiCallParams) => {
  const apiRoute = resolveChatApiRoute(appSettings, sessionToUpdate);
  const activeProvider = apiRoute.provider ?? null;
  const apiModelId = apiRoute.modelId || activeModelId;
  const { baseMessagesForApi, finalRole, finalParts, shouldSkipApiCall } = resolveTurn({
    messages,
    promptParts,
    textToUse,
    enrichedFiles,
    effectiveEditingId,
    isContinueMode,
    isRawMode,
    apiModelId,
  });

  if (shouldSkipApiCall) {
    return;
  }

  const alwaysKeepThinking =
    sessionToUpdate.alwaysKeepThinkingInContext ?? appSettings.alwaysKeepThinkingInContext ?? false;
  const shouldStripThinking = shouldStripThinkingFromContext(
    apiModelId,
    sessionToUpdate.hideThinkingInContext ?? appSettings.hideThinkingInContext,
    alwaysKeepThinking,
  );
  const historyForChat = await createChatHistoryForApi(
    baseMessagesForApi,
    shouldStripThinking,
    apiModelId,
    isServerCodeExecutionMode(sessionToUpdate),
    alwaysKeepThinking,
  );

  // Media Locate Protocols: augment the system instruction (all providers take
  // it as plain text) when the preset is on and the matching media rides with
  // this turn or the conversation history. PDF and video directives are
  // injected independently.
  const hasPdfMedia =
    enrichedFiles.some(isPdfFile) ||
    partsContainPdf(finalParts) ||
    baseMessagesForApi.some((message) => message.files?.some(isPdfFile));
  const hasVideoMedia =
    enrichedFiles.some(isNavigableVideoFile) ||
    partsContainVideo(finalParts) ||
    baseMessagesForApi.some((message) => message.files?.some(isNavigableVideoFile));
  const hasAudioMedia =
    enrichedFiles.some(isAudioFile) ||
    partsContainAudio(finalParts) ||
    baseMessagesForApi.some((message) => message.files?.some(isAudioFile));
  const hasImageMedia =
    enrichedFiles.some(isImageFile) ||
    partsContainImage(finalParts) ||
    baseMessagesForApi.some((message) => message.files?.some(isImageFile));
  const { pdfs, videos, audios, images } = collectSessionMediaFiles(enrichedFiles, baseMessagesForApi);
  const locateDirectives = [
    sessionToUpdate.isPdfNavEnabled && hasPdfMedia ? buildPdfLocateDirective(pdfs.map((file) => file.name)) : '',
    sessionToUpdate.isVideoNavEnabled && hasVideoMedia
      ? buildVideoLocateDirective(videos.map((file) => file.name))
      : '',
    sessionToUpdate.isAudioNavEnabled && hasAudioMedia
      ? buildAudioLocateDirective(audios.map((file) => file.name))
      : '',
    sessionToUpdate.isImageNavEnabled && hasImageMedia
      ? buildImageLocateDirective(images.map((file) => file.name))
      : '',
  ].filter(Boolean);
  const isLiveArtifactsActive = isLiveArtifactsModeFromSettings({
    isLiveArtifactsEnabled: sessionToUpdate.isLiveArtifactsEnabled,
    systemInstruction: sessionToUpdate.systemInstruction,
    promptMode: appSettings.liveArtifactsPromptMode,
    liveArtifactsSystemPrompt: appSettings.liveArtifactsSystemPrompt,
    liveArtifactsSystemPrompts: appSettings.liveArtifactsSystemPrompts,
  });
  const effectiveSystemInstruction = await composeSystemInstruction({
    userInstruction: sessionToUpdate.systemInstruction,
    isLiveArtifactsEnabled: isLiveArtifactsActive,
    liveArtifactsPromptMode: appSettings.liveArtifactsPromptMode,
    customLiveArtifactsPrompt: getLiveArtifactsSystemPromptOverride(appSettings, appSettings.liveArtifactsPromptMode),
    visionPromptMode: sessionToUpdate.visionPromptMode,
    isDeepSearchEnabled: !activeProvider && Boolean(sessionToUpdate.isDeepSearchEnabled),
    isLocalPythonEnabled: !activeProvider && Boolean(sessionToUpdate.isLocalPythonEnabled),
    isGemmaModel: isGemmaModel(apiModelId),
    locateDirectives,
    language: resolveAppLanguage(appSettings.language),
  });

  const { streamOnError, streamOnComplete, streamOnPart, onThoughtChunk } = getStreamHandlers(
    finalSessionId,
    generationId,
    newAbortController,
    generationStartTime,
    sessionToUpdate,
    finalParts,
  );

  if (isUnavailableThirdPartyRoute(apiRoute)) {
    streamOnError(
      new Error(
        apiRoute.unavailable === 'disabled'
          ? 'Third-party connection is disabled.'
          : 'Third-party connection is unavailable.',
      ),
    );
    return;
  }
  const wrappedStreamOnComplete: typeof streamOnComplete = (usage, grounding, urlContext) => {
    clearPendingStreamJob(finalSessionId);
    streamOnComplete(usage, grounding, urlContext);
  };
  const nonStreamOnComplete = createNonStreamCompleteHandler({
    streamOnPart,
    onThoughtChunk,
    streamOnComplete: wrappedStreamOnComplete,
    source: activeProvider ? 'third-party' : 'gemini',
  });

  if (activeProvider) {
    const activeModel = activeProvider.models?.find((m) => m.id === apiModelId);
    const providerConfig = {
      baseUrl: activeProvider.baseUrl,
      templateId: activeProvider.templateId,
      systemInstruction: effectiveSystemInstruction,
      temperature: activeModel?.parameters?.temperature ?? sessionToUpdate.temperature,
      topP: activeModel?.parameters?.topP ?? sessionToUpdate.topP,
      topK: sessionToUpdate.topK,
      maxOutputTokens: activeModel?.parameters?.maxOutputTokens ?? sessionToUpdate.maxOutputTokens,
      stopSequences: sessionToUpdate.stopSequences,
      presencePenalty: sessionToUpdate.presencePenalty,
      frequencyPenalty: sessionToUpdate.frequencyPenalty,
      seed: sessionToUpdate.seed,
      thinkingLevel: activeModel?.enableThinking === false ? ('NONE' as const) : sessionToUpdate.thinkingLevel,
      thinkingBudget: sessionToUpdate.thinkingBudget,
      extraHeaders: activeProvider.extraHeaders,
    };
    const isAnthropic = activeProvider.protocol === 'anthropic';
    const isOpenAIResponses = activeProvider.protocol === 'openai-responses';
    // Docker THIRD_PARTY_ROUTES is keyed by template, not connection UUID.
    const providerId = getProxyProviderHeader(activeProvider.templateId);

    if (appSettings.isStreamingEnabled) {
      // Stamp thinking provenance on every third-party streaming callback; the
      // first chunk decides the strip mode, so wrapping here (single point for
      // both Anthropic and OpenAI-compatible streams) covers the whole run.
      const thirdPartyOnThoughtChunk = (chunk: string) => onThoughtChunk(chunk, { source: 'third-party' });
      const thirdPartyOnPart = (part: ContentPart) => streamOnPart(part, { source: 'third-party' });
      await routeThrownStreamError(
        () =>
          isAnthropic
            ? sendAnthropicMessageStream(
                keyToUse,
                apiModelId,
                historyForChat,
                finalParts,
                providerConfig,
                newAbortController.signal,
                thirdPartyOnPart,
                thirdPartyOnThoughtChunk,
                streamOnError,
                streamOnComplete,
                finalRole,
                providerId,
              )
            : isOpenAIResponses
              ? sendOpenAIResponsesStream(
                  keyToUse,
                  apiModelId,
                  historyForChat,
                  finalParts,
                  providerConfig,
                  newAbortController.signal,
                  thirdPartyOnPart,
                  thirdPartyOnThoughtChunk,
                  streamOnError,
                  streamOnComplete,
                  finalRole,
                  providerId,
                )
              : sendOpenAICompatibleMessageStream(
                  keyToUse,
                  apiModelId,
                  historyForChat,
                  finalParts,
                  providerConfig,
                  newAbortController.signal,
                  thirdPartyOnPart,
                  thirdPartyOnThoughtChunk,
                  streamOnError,
                  streamOnComplete,
                  finalRole,
                  providerId,
                ),
        streamOnError,
      );
      return;
    }

    await routeThrownStreamError(
      () =>
        isAnthropic
          ? sendAnthropicMessageNonStream(
              keyToUse,
              apiModelId,
              historyForChat,
              finalParts,
              providerConfig,
              newAbortController.signal,
              streamOnError,
              nonStreamOnComplete,
              finalRole,
              providerId,
            )
          : isOpenAIResponses
            ? sendOpenAIResponsesNonStream(
                keyToUse,
                apiModelId,
                historyForChat,
                finalParts,
                providerConfig,
                newAbortController.signal,
                streamOnError,
                nonStreamOnComplete,
                finalRole,
                providerId,
              )
            : sendOpenAICompatibleMessageNonStream(
                keyToUse,
                apiModelId,
                historyForChat,
                finalParts,
                providerConfig,
                newAbortController.signal,
                streamOnError,
                nonStreamOnComplete,
                finalRole,
                providerId,
              ),
      streamOnError,
    );
    return;
  }

  const localPythonContextMessages =
    finalRole === 'user'
      ? [
          ...baseMessagesForApi,
          {
            id: 'temp-standard-user',
            role: 'user' as const,
            content: textToUse.trim(),
            files: enrichedFiles,
            timestamp: new Date(),
          },
        ]
      : baseMessagesForApi;
  const standardClientFunctions = createStandardClientFunctions({
    isLocalPythonEnabled:
      !!sessionToUpdate.isLocalPythonEnabled &&
      finalRole === 'user' &&
      !isRawMode &&
      !isImageGenerationModel(apiModelId),
    inputFiles: collectLocalPythonInputFiles(
      [
        ...localPythonContextMessages,
        {
          id: 'temp-standard-tool-target',
          role: 'model',
          content: '',
          timestamp: new Date(),
        },
      ],
      'temp-standard-tool-target',
    ),
    runPython: async (code, options) => {
      const pyodideService = await getPyodideService();
      return pyodideService.runPython(code, options);
    },
  });
  const runtimeSelection = useMcpRuntimeStore.getState();
  const enabledMcpServers = selectServersForTurn(appSettings.mcpServers ?? [], runtimeSelection);
  const isMcpEnabledForTurn =
    finalRole === 'user' && !isRawMode && !isImageGenerationModel(apiModelId) && enabledMcpServers.length > 0;
  // Discovery is resilient: failures log and yield {} so chat continues without MCP tools.
  const mcpClientFunctions = isMcpEnabledForTurn
    ? await createMcpClientFunctions({
        servers: enabledMcpServers,
        abortSignal: newAbortController.signal,
        requestApproval: (request) => requestToolApproval(request, newAbortController.signal),
        // Discovery is cached for 30s; re-check disables at call time.
        resolveLatestServers: () => useSettingsStore.getState().appSettings.mcpServers,
      })
    : {};
  const combinedClientFunctions = {
    ...standardClientFunctions,
    ...mcpClientFunctions,
  };
  const localPythonFunctionDeclarations = Object.values(standardClientFunctions).map(({ declaration }) => declaration);
  const mcpFunctionDeclarations = Object.values(mcpClientFunctions).map(({ declaration }) => declaration);
  const hasRequestedServerSideToolThatNeedsCombination =
    !!sessionToUpdate.isGoogleSearchEnabled ||
    !!sessionToUpdate.isGoogleMapsEnabled ||
    !!sessionToUpdate.isDeepSearchEnabled ||
    !!sessionToUpdate.isUrlContextEnabled;
  const isLocalPythonEnabledForTurn =
    localPythonFunctionDeclarations.length > 0 &&
    (isGemini3Model(apiModelId) || !hasRequestedServerSideToolThatNeedsCombination);

  const config = await buildGenerationConfig({
    settings: sessionToUpdate,
    modelId: apiModelId,
    systemInstruction: effectiveSystemInstruction,
    aspectRatio,
    imageSize,
    isLocalPythonEnabled: isLocalPythonEnabledForTurn,
    imageOutputMode,
  });

  const requestConfig = appendFunctionDeclarationsToTools(apiModelId, config, [
    ...(isLocalPythonEnabledForTurn ? localPythonFunctionDeclarations : []),
    ...mcpFunctionDeclarations,
  ]);
  const hasFunctionDeclarationsInRequest = !!requestConfig.tools?.some((tool) => 'functionDeclarations' in tool);

  const insertInternalToolMessages = (messages: ChatMessage[]) => {
    updateAndPersistSessions(
      (prev) =>
        updateSessionById(prev, finalSessionId, (session) => ({
          ...session,
          messages: session.messages.flatMap((message) => {
            if (message.id !== generationId) {
              return [message];
            }
            return [...messages, { ...message }];
          }),
        })),
      { persist: false },
    );
  };

  const canJournalStream =
    !activeProvider && isGeminiProxyRelativePath(appSettings) && finalRole === 'user' && !isContinueMode;
  const jobSecret = canJournalStream ? generateJobSecret() : undefined;
  const streamResume = canJournalStream
    ? {
        jobId: generationId,
        jobSecret,
        lastSeq: 0,
        onSeq: (seq: number) => advancePendingStreamJobSeq(finalSessionId, seq),
      }
    : undefined;

  if (canJournalStream) {
    recordPendingStreamJob({
      sessionId: finalSessionId,
      generationId,
      jobId: generationId,
      secret: jobSecret,
      startedAt: generationStartTime.getTime(),
    });
  }

  let autoRetryAttempted = false;

  const handleStreamErrorWithAutoRetry = async (error: Error): Promise<void> => {
    if (!autoRetryAttempted && !newAbortController.signal.aborted && isFilesApiPermissionDeniedError(error)) {
      autoRetryAttempted = true;
      logService.warn('Files API permission error detected during generation. Attempting silent auto-retry.', {
        sessionId: finalSessionId,
        error,
      });

      try {
        const state = useChatStore.getState();
        const currentSession = state.savedSessions.find((s) => s.id === finalSessionId);
        if (currentSession) {
          const invalidatedSession = invalidateSessionFilesApiReferences(currentSession, error);
          updateAndPersistSessions((prev) => updateSessionById(prev, finalSessionId, () => invalidatedSession));

          const freshKeyResult = getGeminiKeyForRequest(appSettings, sessionToUpdate);
          const freshKey = 'key' in freshKeyResult ? freshKeyResult.key : keyToUse;
          const t = getTranslator(resolveAppLanguage(appSettings.language));

          const historyRefResult = await ensureHistoryFilesApiReferences({
            messages: invalidatedSession.messages,
            apiKey: freshKey,
            abortSignal: newAbortController.signal,
            translate: t,
          });

          const sessionWasInvalidated = invalidatedSession !== currentSession;
          if (
            historyRefResult.ok &&
            (historyRefResult.changed || sessionWasInvalidated) &&
            !newAbortController.signal.aborted
          ) {
            updateAndPersistSessions((prev) =>
              updateSessionById(prev, finalSessionId, (s) => ({
                ...s,
                messages: historyRefResult.messages,
              })),
            );

            const { baseMessagesForApi: nextBaseMessages, finalParts: turnFinalParts } = resolveTurn({
              messages: historyRefResult.messages,
              promptParts,
              textToUse,
              enrichedFiles,
              effectiveEditingId,
              isContinueMode,
              isRawMode,
              apiModelId,
            });

            const targetIdentifier = extractFilesApiIdentifierFromError(error);
            const reuploadedFilesMap = new Map<string, UploadedFile>();

            for (const file of enrichedFiles) {
              const isTarget =
                !targetIdentifier ||
                (file.fileUri && file.fileUri.includes(targetIdentifier)) ||
                (file.fileApiName && file.fileApiName.includes(targetIdentifier));

              if (isTarget) {
                const uploadable = await resolveUploadableFile(file);
                if (uploadable) {
                  try {
                    const uploaded = await uploadFileApi(
                      freshKey,
                      uploadable,
                      file.type || uploadable.type || 'application/octet-stream',
                      file.name,
                      newAbortController.signal,
                    );
                    const patch = {
                      ...getUploadLifecycleForGeminiState(uploaded.state),
                      fileUri: uploaded.uri,
                      fileApiName: uploaded.name,
                      rawFile: uploadable,
                      fileApiExpirationTime: toFileApiExpirationTime(
                        (uploaded as { expirationTime?: unknown }).expirationTime,
                      ),
                      fileApiKeyFingerprint: getApiKeyFingerprint(freshKey),
                    };
                    reuploadedFilesMap.set(file.fileUri || file.id, { ...file, ...patch });
                  } catch (reuploadErr) {
                    logService.warn('Auto-retry re-upload failed, will degrade file reference', { error: reuploadErr });
                  }
                }
              }
            }

            if (reuploadedFilesMap.size > 0) {
              updateAndPersistSessions((prev) =>
                updateSessionById(prev, finalSessionId, (s) => ({
                  ...s,
                  messages: s.messages.map((m) =>
                    m.files
                      ? {
                          ...m,
                          files: m.files.map((f) => reuploadedFilesMap.get(f.fileUri || f.id) || f),
                        }
                      : m,
                  ),
                })),
              );
            }

            const retryFinalParts = turnFinalParts.map((part) => {
              const fileUri = part.fileData?.fileUri;
              if (!fileUri) return part;
              const isTarget =
                !targetIdentifier ||
                fileUri.includes(targetIdentifier) ||
                Boolean(getGeminiFilesApiNameFromUri(fileUri)?.includes(targetIdentifier));
              if (isTarget) {
                const reuploaded =
                  reuploadedFilesMap.get(fileUri) ||
                  Array.from(reuploadedFilesMap.values()).find(
                    (f) => f.fileUri === fileUri || (targetIdentifier && f.fileApiName?.includes(targetIdentifier)),
                  );
                if (reuploaded?.fileUri) {
                  return { fileData: { mimeType: reuploaded.type, fileUri: reuploaded.fileUri } };
                }

                const fileName =
                  enrichedFiles.find(
                    (f) =>
                      f.fileUri === fileUri ||
                      Boolean(
                        targetIdentifier &&
                        ((f.fileApiName && f.fileApiName.includes(targetIdentifier)) ||
                          (f.fileUri && f.fileUri.includes(targetIdentifier))),
                      ),
                  )?.name || (targetIdentifier ? `File ${targetIdentifier}` : 'file');
                return { text: formatHistoryFileApiUnavailablePartText(fileName) };
              }
              return part;
            });

            const retryHistoryForChat = await createChatHistoryForApi(
              nextBaseMessages,
              shouldStripThinking,
              apiModelId,
              isServerCodeExecutionMode(sessionToUpdate),
              alwaysKeepThinking,
            );

            if (hasFunctionDeclarationsInRequest) {
              try {
                const toolLoopResult = await runStandardToolLoop({
                  initialContents: appendTurnToHistory(retryHistoryForChat, finalRole, retryFinalParts),
                  clientFunctions: combinedClientFunctions,
                  abortSignal: newAbortController.signal,
                  onToolCallsStarted: (modelContent) => {
                    insertInternalToolMessages([
                      createMessage('model', '', {
                        apiParts: modelContent.parts,
                        isInternalToolMessage: true,
                        toolParentMessageId: generationId,
                      }),
                    ]);
                  },
                  onToolResponsesSettled: (functionResponseParts) => {
                    insertInternalToolMessages([
                      createMessage('user', '', {
                        apiParts: functionResponseParts,
                        isInternalToolMessage: true,
                        toolParentMessageId: generationId,
                      }),
                    ]);
                  },
                  runTurn: (contents) =>
                    generateContentTurnApi(freshKey, apiModelId, contents, requestConfig, newAbortController.signal),
                });

                for (const part of toolLoopResult.finalTurn.parts) {
                  streamOnPart(part, { recordFirstToken: false });
                }
                if (toolLoopResult.finalTurn.thoughts) {
                  onThoughtChunk(toolLoopResult.finalTurn.thoughts, { recordFirstToken: false });
                }
                streamOnComplete(
                  toolLoopResult.finalTurn.usage,
                  toolLoopResult.finalTurn.grounding,
                  toolLoopResult.finalTurn.urlContext,
                  toolLoopResult.generatedFiles,
                );
              } catch (retryErr) {
                streamOnError(toError(retryErr));
              }
              return;
            }

            if (appSettings.isStreamingEnabled) {
              await routeThrownStreamError(
                () =>
                  sendStatelessMessageStreamApi(
                    freshKey,
                    apiModelId,
                    retryHistoryForChat,
                    retryFinalParts,
                    requestConfig,
                    newAbortController.signal,
                    streamOnPart,
                    onThoughtChunk,
                    streamOnError,
                    wrappedStreamOnComplete,
                    finalRole,
                    undefined,
                    streamResume,
                  ),
                streamOnError,
              );
              return;
            }

            await routeThrownStreamError(
              () =>
                sendStatelessMessageNonStreamApi(
                  freshKey,
                  apiModelId,
                  retryHistoryForChat,
                  retryFinalParts,
                  requestConfig,
                  newAbortController.signal,
                  streamOnError,
                  nonStreamOnComplete,
                  finalRole,
                ),
              streamOnError,
            );
            return;
          }
        }
      } catch (retryError) {
        logService.error('Silent auto-retry for Files API permission denied failed', { error: retryError });
      }
    }

    streamOnError(error);
  };

  if (hasFunctionDeclarationsInRequest) {
    try {
      const toolLoopResult = await runStandardToolLoop({
        initialContents: appendTurnToHistory(historyForChat, finalRole, finalParts),
        clientFunctions: combinedClientFunctions,
        abortSignal: newAbortController.signal,
        onToolCallsStarted: (modelContent) => {
          insertInternalToolMessages([
            createMessage('model', '', {
              apiParts: modelContent.parts,
              isInternalToolMessage: true,
              toolParentMessageId: generationId,
            }),
          ]);
        },
        onToolResponsesSettled: (functionResponseParts) => {
          insertInternalToolMessages([
            createMessage('user', '', {
              apiParts: functionResponseParts,
              isInternalToolMessage: true,
              toolParentMessageId: generationId,
            }),
          ]);
        },
        runTurn: (contents) =>
          generateContentTurnApi(keyToUse, apiModelId, contents, requestConfig, newAbortController.signal),
      });

      for (const part of toolLoopResult.finalTurn.parts) {
        streamOnPart(part, { recordFirstToken: false });
      }
      if (toolLoopResult.finalTurn.thoughts) {
        onThoughtChunk(toolLoopResult.finalTurn.thoughts, { recordFirstToken: false });
      }
      streamOnComplete(
        toolLoopResult.finalTurn.usage,
        toolLoopResult.finalTurn.grounding,
        toolLoopResult.finalTurn.urlContext,
        toolLoopResult.generatedFiles,
      );
    } catch (error) {
      await handleStreamErrorWithAutoRetry(toError(error));
    }
    return;
  }

  if (appSettings.isStreamingEnabled) {
    await routeThrownStreamError(
      () =>
        sendStatelessMessageStreamApi(
          keyToUse,
          apiModelId,
          historyForChat,
          finalParts,
          requestConfig,
          newAbortController.signal,
          streamOnPart,
          onThoughtChunk,
          handleStreamErrorWithAutoRetry,
          wrappedStreamOnComplete,
          finalRole,
          undefined,
          streamResume,
        ),
      handleStreamErrorWithAutoRetry,
    );
    return;
  }

  await routeThrownStreamError(
    () =>
      sendStatelessMessageNonStreamApi(
        keyToUse,
        apiModelId,
        historyForChat,
        finalParts,
        requestConfig,
        newAbortController.signal,
        handleStreamErrorWithAutoRetry,
        nonStreamOnComplete,
        finalRole,
      ),
    handleStreamErrorWithAutoRetry,
  );
};
