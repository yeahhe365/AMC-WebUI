import { useCallback, useRef, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { resolveChatApiRoute, isUnavailableThirdPartyRoute } from '@/utils/chatApiRoute';
import { getKeyForRequest, formatApiKeyErrorMessage } from '@/utils/apiKeySelection';
import { buildGenerationConfig } from '@/services/api/generationConfig';
import { sendStatelessMessageStreamApi } from '@/services/api/chatApi';
import { sendOpenAICompatibleMessageStream } from '@/services/api/openaiCompatibleApi';
import { sendOpenAIResponsesStream } from '@/services/api/openaiResponsesApi';
import { sendAnthropicMessageStream } from '@/services/api/anthropicApi';
import { getProxyProviderHeader } from '@/utils/thirdPartyApiProviders';
import { getErrorMessage } from '@/utils/errorMessage';
import { useI18n } from '@/contexts/I18nContext';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';

export function useSelectionAsk() {
  const { t } = useI18n();
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const answerRef = useRef('');

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setAnswer('');
    answerRef.current = '';
    setError(null);
  }, [cancel]);

  const ask = useCallback(
    async (selectedText: string, question: string) => {
      const trimmedSelection = selectedText.trim();
      const trimmedQuestion = question.trim();
      if (!trimmedSelection || !trimmedQuestion) return;

      cancel();
      setAnswer('');
      answerRef.current = '';
      setError(null);
      setIsLoading(true);

      const appSettings = useSettingsStore.getState().appSettings;
      const selectionAskModelId = appSettings.selectionAskModelId;
      const selectionAskProviderId = appSettings.selectionAskProviderId;

      if (!selectionAskModelId || !selectionAskModelId.trim()) {
        setError(t('selectionAskModelConfigureHint'));
        setIsLoading(false);
        return;
      }

      // 构造代理 ChatSettings，仅用于路由与鉴权（复用现有 resolveChatApiRoute/getKeyForRequest）
      const selectionAskSettings = {
        ...DEFAULT_CHAT_SETTINGS,
        modelId: selectionAskModelId,
        providerId: selectionAskProviderId,
        // 继承可能影响 SystemInstruction/temperature 等的 appSettings 值，保持与主对话一致
        temperature: appSettings.temperature,
        topP: appSettings.topP,
        topK: appSettings.topK,
        thinkingLevel: appSettings.thinkingLevel,
        thinkingBudget: appSettings.thinkingBudget,
        systemInstruction: appSettings.systemInstruction,
        ttsVoice: appSettings.ttsVoice,
      };

      const apiRoute = resolveChatApiRoute(appSettings, selectionAskSettings);

      if (isUnavailableThirdPartyRoute(apiRoute)) {
        setError(t('selectionAskModelUnavailable'));
        setIsLoading(false);
        return;
      }

      const keyResult = getKeyForRequest(appSettings, selectionAskSettings);
      if ('error' in keyResult) {
        setError(`${formatApiKeyErrorMessage(keyResult.error, t)} ${t('selectionAskModelConfigureHint')}`);
        setIsLoading(false);
        return;
      }

      const apiModelId = apiRoute.modelId || selectionAskModelId;
      const provider = apiRoute.provider ?? null;

      // 超长选区截断，防止 prompt 超限 413
      const MAX_SELECTION_CHARS = 6000;
      const truncatedForPrompt =
        trimmedSelection.length > MAX_SELECTION_CHARS
          ? `${trimmedSelection.slice(0, MAX_SELECTION_CHARS)}\n\n[注：选中文本过长已截断，仅显示前 ${MAX_SELECTION_CHARS} 字]`
          : trimmedSelection;
      const prompt = `选中文本：\n"""${truncatedForPrompt}"""\n\n用户问题：${trimmedQuestion}\n\n请基于选中文本回答问题，若选中文本不足以回答请结合常识补充，但优先围绕选中文本。回答使用与用户问题相同的语言。`;

      // Minimal history, single user turn
      const history: never[] = [];
      const parts = [{ text: prompt }];

      // Build a lightweight config (reuse generation config but without tools)
      let requestConfig: unknown;
      try {
        requestConfig = await buildGenerationConfig({
          settings: selectionAskSettings,
          modelId: apiModelId,
          aspectRatio: '1:1',
          imageOutputMode: 'IMAGE_TEXT' as const,
          isLocalPythonEnabled: false,
        });
        // Strip tools if any
        if (
          requestConfig &&
          typeof requestConfig === 'object' &&
          'tools' in (requestConfig as Record<string, unknown>)
        ) {
          delete (requestConfig as Record<string, unknown>).tools;
        }
      } catch {
        requestConfig = undefined;
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      // 回调必须确认自己仍代表当前请求：发起新 ask / 用户 cancel 后，底层流仍可能
      // 补发 onComplete/onPart（OpenAI 兼容路径 abort 早退时会直接调 onComplete），
      // 不加守卫会把新请求的 isLoading 清掉、abortRef 置空，甚至污染新答案。
      const isCurrentRequest = () => abortRef.current === abortController;

      const onPart = (part: { text?: string }) => {
        if (!isCurrentRequest()) return;
        if (part.text) {
          answerRef.current += part.text;
          setAnswer(answerRef.current);
        }
      };
      const onThoughtChunk = () => {};
      const onError = (e: Error) => {
        if (!isCurrentRequest()) return;
        setError(e.message || t('askError'));
        setIsLoading(false);
        abortRef.current = null;
      };
      const onComplete = () => {
        if (!isCurrentRequest()) return;
        setIsLoading(false);
        abortRef.current = null;
      };

      try {
        if (provider) {
          const providerConfig = {
            baseUrl: provider.baseUrl,
            templateId: provider.templateId,
            systemInstruction: selectionAskSettings.systemInstruction,
            temperature: selectionAskSettings.temperature,
            topP: selectionAskSettings.topP,
            thinkingLevel: selectionAskSettings.thinkingLevel,
            thinkingBudget: selectionAskSettings.thinkingBudget,
            extraHeaders: provider.extraHeaders,
          };
          const providerId = getProxyProviderHeader(provider.templateId);
          const isAnthropic = provider.protocol === 'anthropic';
          const isOpenAIResponses = provider.protocol === 'openai-responses';
          if (isAnthropic) {
            await sendAnthropicMessageStream(
              keyResult.key,
              apiModelId,
              history as never,
              parts as never,
              providerConfig,
              abortController.signal,
              onPart as never,
              onThoughtChunk as never,
              onError,
              onComplete,
              'user',
              providerId,
            );
          } else if (isOpenAIResponses) {
            await sendOpenAIResponsesStream(
              keyResult.key,
              apiModelId,
              history as never,
              parts as never,
              providerConfig,
              abortController.signal,
              onPart as never,
              onThoughtChunk as never,
              onError,
              onComplete,
              'user',
              providerId,
            );
          } else {
            await sendOpenAICompatibleMessageStream(
              keyResult.key,
              apiModelId,
              history as never,
              parts as never,
              providerConfig,
              abortController.signal,
              onPart as never,
              onThoughtChunk as never,
              onError,
              onComplete,
              'user',
              providerId,
            );
          }
        } else {
          await sendStatelessMessageStreamApi(
            keyResult.key,
            apiModelId,
            history as never,
            parts as never,
            requestConfig,
            abortController.signal,
            onPart as never,
            onThoughtChunk as never,
            onError,
            onComplete,
            'user',
            undefined,
            undefined,
          );
        }
      } catch (streamError) {
        if (!abortController.signal.aborted) {
          setError(getErrorMessage(streamError));
          setIsLoading(false);
        }
      }
    },
    [cancel, t],
  );

  return { answer, isLoading, error, ask, cancel, reset, setAnswer, setError };
}
