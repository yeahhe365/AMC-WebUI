import { useMemo, useRef } from 'react';
import type { Part } from '@google/genai';
import type { ChatHistoryItem, ThirdPartyConnection } from '@/types';
import { runStandardToolLoop } from '@/features/standard-chat/standardToolLoop';
import { getErrorMessage } from '@/utils/errorMessage';
import { useSettingsStore } from '@/stores/settingsStore';
import { createAssistantItemId, useSettingsAssistantStore } from '@/stores/settingsAssistantStore';
import { resolveAssistantChannel, createAssistantRunTurn } from './assistantChannel';
import { createProviderTools } from './providerTools';

const ASSISTANT_MAX_TOOL_ROUNDS = 12;

// ChatHistoryItem (Content & { parts: Part[]; role }) is what the tool loop
// hands to these callbacks — not the UI's ChatMessage.
const readFunctionCalls = (message: ChatHistoryItem): Array<{ id?: string; name?: string }> =>
  (message.parts ?? [])
    .map((part) => part.functionCall)
    .filter((call): call is NonNullable<typeof call> => Boolean(call?.name));

const readFunctionResponses = (parts: Part[]): Array<{ id?: string; name?: string; response?: unknown }> =>
  (parts ?? [])
    .map((part) => part.functionResponse)
    .filter((response): response is NonNullable<typeof response> => Boolean(response?.name));

const describeToolResponse = (response: unknown): { status: 'done' | 'error'; detail: string | null } => {
  if (response && typeof response === 'object' && 'error' in response) {
    const error = (response as { error?: unknown }).error;
    return { status: 'error', detail: typeof error === 'string' ? error : 'error' };
  }
  if (response && typeof response === 'object' && 'status' in response) {
    const status = (response as { status?: unknown }).status;
    return { status: 'done', detail: typeof status === 'string' ? status : null };
  }
  return { status: 'done', detail: null };
};

export const useSettingsAssistant = () => {
  const appSettings = useSettingsStore((state) => state.appSettings);
  const items = useSettingsAssistantStore((state) => state.items);
  const status = useSettingsAssistantStore((state) => state.status);
  const abortRef = useRef<AbortController | null>(null);
  const channel = useMemo(() => resolveAssistantChannel(appSettings), [appSettings]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !channel.ok) return;

    const store = useSettingsAssistantStore.getState();
    store.appendItem({ kind: 'user', id: createAssistantItemId(), text: trimmed });
    store.setStatus('running');

    const controller = new AbortController();
    abortRef.current = controller;

    const tools = createProviderTools({
      getConnections: () => useSettingsStore.getState().appSettings.thirdPartyApi.connections,
      // Always read the freshest settings: the user may be editing the same
      // connection by hand while the assistant is running.
      setConnections: (next: ThirdPartyConnection[]) =>
        useSettingsStore.getState().setAppSettings((prev) => ({
          ...prev,
          thirdPartyApi: { ...prev.thirdPartyApi, connections: next },
        })),
      requestApiKey: (request) => useSettingsAssistantStore.getState().requestApiKey(request),
    });

    try {
      const result = await runStandardToolLoop({
        initialContents: [{ role: 'user', parts: [{ text: trimmed }] }],
        clientFunctions: tools,
        runTurn: createAssistantRunTurn({ channel, abortSignal: controller.signal }),
        abortSignal: controller.signal,
        maxToolRounds: ASSISTANT_MAX_TOOL_ROUNDS,
        onToolCallsStarted: (modelContent) => {
          for (const call of readFunctionCalls(modelContent)) {
            useSettingsAssistantStore.getState().appendItem({
              kind: 'tool',
              // Gemini normally supplies an id; falling back to the name keeps
              // the started/settled pair correlated when it does not.
              id: call.id ?? call.name ?? createAssistantItemId(),
              name: call.name ?? 'tool',
              status: 'running',
              detail: null,
            });
          }
        },
        onToolResponsesSettled: (parts) => {
          for (const response of readFunctionResponses(parts)) {
            const { status: toolStatus, detail } = describeToolResponse(response.response);
            useSettingsAssistantStore.getState().updateToolItem(response.id ?? response.name ?? '', {
              status: toolStatus,
              detail,
            });
          }
        },
      });

      const finalText = result.finalTurn.parts
        .map((part) => part.text ?? '')
        .join('')
        .trim();
      if (finalText) {
        useSettingsAssistantStore.getState().appendItem({
          kind: 'assistant',
          id: createAssistantItemId(),
          text: finalText,
        });
      }
      useSettingsAssistantStore.getState().setStatus('idle');
    } catch (error) {
      useSettingsAssistantStore.getState().appendItem({
        kind: 'error',
        id: createAssistantItemId(),
        message: getErrorMessage(error),
      });
      useSettingsAssistantStore.getState().setStatus('error');
    } finally {
      abortRef.current = null;
      useSettingsAssistantStore.getState().cancelApiKey();
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  return {
    items,
    status,
    channel,
    canSend: channel.ok && status !== 'running' && status !== 'awaiting-key',
    send,
    stop,
  };
};
