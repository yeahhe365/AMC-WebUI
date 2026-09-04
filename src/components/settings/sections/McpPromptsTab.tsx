import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, MessageSquarePlus } from 'lucide-react';
import { fetchMcpPrompt, type McpPromptDefinition } from '@/services/api/mcpApi';
import { useChatStore } from '@/stores/chatStore';
import { useChatDraftStore } from '@/stores/chatDraftStore';
import type { McpServerConfig } from '@/types';

interface McpPromptsTabProps {
  server: McpServerConfig;
  prompts: McpPromptDefinition[];
  t: (key: string) => string;
}

const promptResultToText = (body: { result?: unknown }): string => {
  const messages = (body.result as { messages?: Array<{ content?: { text?: string } }> } | undefined)?.messages ?? [];
  if (!Array.isArray(messages)) return JSON.stringify(body, null, 2);
  return messages
    .map((message) => message?.content?.text ?? '')
    .filter(Boolean)
    .join('\n\n');
};

export const McpPromptsTab: React.FC<McpPromptsTabProps> = ({ server, prompts, t }) => {
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [argValues, setArgValues] = useState<Record<string, Record<string, string>>>({});
  const [loadingName, setLoadingName] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renderedText, setRenderedText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!prompts.length) {
    return <div className="p-4 text-sm text-[var(--theme-text-secondary)]">{t('settingsMcpEmptyPrompts')}</div>;
  }

  const runPrompt = async (prompt: McpPromptDefinition) => {
    setLoadingName(prompt.name);
    setErrorFor(null);
    setErrorMessage(null);
    setRenderedText(null);
    try {
      const args: Record<string, string> = {};
      for (const arg of prompt.arguments ?? []) {
        const value = argValues[prompt.name]?.[arg.name];
        if (value) args[arg.name] = value;
      }
      const body = await fetchMcpPrompt(server, prompt.name, args);
      setRenderedText(promptResultToText(body));
    } catch (promptFetchError) {
      setErrorFor(prompt.name);
      setErrorMessage(promptFetchError instanceof Error ? promptFetchError.message : String(promptFetchError));
    } finally {
      setLoadingName(null);
    }
  };

  const insertIntoChat = async () => {
    if (!renderedText) return;
    const sessionId = useChatStore.getState().activeSessionId;
    if (!sessionId) {
      await navigator.clipboard.writeText(renderedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    useChatDraftStore
      .getState()
      .setDraftText(sessionId, (prev) => (prev ? `${prev}\n\n${renderedText}` : renderedText));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="divide-y">
      {prompts.map((prompt) => {
        const expanded = expandedName === prompt.name;
        return (
          <div key={prompt.name} className="px-3 py-2">
            <button
              type="button"
              data-testid={`mcp-prompt-row-${prompt.name}`}
              onClick={() => setExpandedName(expanded ? null : prompt.name)}
              className="flex w-full items-center gap-2 text-left"
            >
              {expanded ? (
                <ChevronDown size={14} className="shrink-0" />
              ) : (
                <ChevronRight size={14} className="shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{prompt.name}</span>
            </button>
            {!expanded && prompt.description && (
              <div className="mt-0.5 pl-6 text-xs text-[var(--theme-text-secondary)]">{prompt.description}</div>
            )}
            {expanded && (
              <div className="mt-2 pl-6">
                {prompt.description && (
                  <div className="text-xs text-[var(--theme-text-secondary)]">{prompt.description}</div>
                )}
                {(prompt.arguments ?? []).length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {(prompt.arguments ?? []).map((arg) => (
                      <label key={arg.name} className="block">
                        <span className="text-xs font-medium">
                          {arg.name}
                          {arg.required && <span className="ml-0.5 text-red-500">*</span>}
                        </span>
                        {arg.description && (
                          <span className="ml-1 text-[11px] text-[var(--theme-text-secondary)]">{arg.description}</span>
                        )}
                        <input
                          type="text"
                          value={argValues[prompt.name]?.[arg.name] ?? ''}
                          onChange={(event) =>
                            setArgValues((prev) => ({
                              ...prev,
                              [prompt.name]: { ...prev[prompt.name], [arg.name]: event.target.value },
                            }))
                          }
                          className="mt-0.5 w-full rounded-md border bg-transparent px-2 py-1 text-xs outline-none focus:border-emerald-500"
                        />
                      </label>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  disabled={loadingName === prompt.name}
                  onClick={() => void runPrompt(prompt)}
                  className="mt-2 rounded-md border px-2 py-1 text-xs hover:bg-[var(--theme-bg-tertiary)] disabled:opacity-50"
                >
                  {loadingName === prompt.name ? t('settingsMcpLoading') : t('settingsMcpPromptsUse')}
                </button>
                {errorFor === prompt.name && errorMessage && (
                  <div className="mt-2 text-xs text-red-600 dark:text-red-400">{errorMessage}</div>
                )}
                {renderedText !== null && (
                  <div className="mt-2">
                    <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded border p-2 text-xs">
                      {renderedText}
                    </pre>
                    <div className="mt-1 flex items-center gap-3">
                      <button
                        type="button"
                        data-testid="mcp-prompt-insert"
                        onClick={() => void insertIntoChat()}
                        className="flex items-center gap-1 text-[11px]"
                      >
                        <MessageSquarePlus className="h-3 w-3" />
                        {t('settingsMcpInsertToChat')}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(renderedText);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="flex items-center gap-1 text-[11px]"
                      >
                        <Copy className="h-3 w-3" />
                        {copied ? t('settingsMcpCopied') : t('settingsMcpCopy')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
