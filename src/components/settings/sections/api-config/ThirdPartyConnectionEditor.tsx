import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import {
  SETTINGS_DANGER_OUTLINE_BUTTON_CLASS,
  SETTINGS_INLINE_ACTION_BUTTON_CLASS,
  SETTINGS_SECONDARY_ACTION_BUTTON_CLASS,
  SMALL_ICON_DANGER_BUTTON_CLASS,
} from '@/constants/buttonClasses';
import { Select } from '@/components/shared/Select';
import {
  getOpenAICompatibleBaseUrlWarning,
  buildOpenAICompatibleChatCompletionsUrl,
  buildOpenAICompatibleUpstreamChatCompletionsUrl,
} from '@/services/api/openaiCompatibleUrls';
import { buildAnthropicMessagesUrl, buildAnthropicUpstreamMessagesUrl } from '@/services/api/anthropicUrls';
import { sendAnthropicMessageNonStream } from '@/services/api/anthropicApi';
import { fetchOpenAICompatibleModels, sendOpenAICompatibleMessageNonStream } from '@/services/api/openaiCompatibleApi';
import { getErrorMessage } from '@/utils/errorMessage';
import { parseApiKeys } from '@/utils/apiKeySelection';
import { getProxyProviderHeader, getThirdPartyTemplateLinks } from '@/utils/thirdPartyApiProviders';
import type { ThirdPartyApiProtocol, ThirdPartyConnection } from '@/types';
import { ApiKeyInput } from './ApiKeyInput';
import { ApiConnectionTester } from './ApiConnectionTester';
import { OpenAICompatibleModelListEditor } from './OpenAICompatibleModelListEditor';

interface ThirdPartyConnectionEditorProps {
  connection: ThirdPartyConnection;
  onChange: (updates: Partial<ThirdPartyConnection>) => void;
  onRemove: () => void;
  isInUse?: boolean;
}

type HeaderRow = { rowId: string; name: string; value: string };

const toHeaderRows = (headers: Record<string, string>): HeaderRow[] =>
  Object.entries(headers).map(([name, value]) => ({
    rowId: `${name}-${value}`,
    name,
    value,
  }));

const rowsToHeaders = (rows: HeaderRow[]): Record<string, string> => {
  const headers: Record<string, string> = {};
  for (const row of rows) {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name || !value) {
      continue;
    }
    headers[name] = value;
  }
  return headers;
};

export const ThirdPartyConnectionEditor: React.FC<ThirdPartyConnectionEditorProps> = ({
  connection,
  onChange,
  onRemove,
  isInUse = false,
}) => {
  const { t } = useI18n();
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(Object.keys(connection.extraHeaders).length > 0);
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(() => toHeaderRows(connection.extraHeaders));
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  useEffect(() => {
    setHeaderRows(toHeaderRows(connection.extraHeaders));
    setConfirmingRemove(false);
    setShowAdvanced(Object.keys(connection.extraHeaders).length > 0);
    // Rehydrate extra-header rows only when switching connections. Local in-progress
    // empty rows are committed via onChange and must not be wiped mid-keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connection.id is the switch key
  }, [connection.id]);

  const updateField = <K extends keyof ThirdPartyConnection>(key: K, value: ThirdPartyConnection[K]) => {
    onChange({ [key]: value });
    setTestStatus('idle');
    setTestMessage(null);
  };

  const commitHeaderRows = (nextRows: HeaderRow[]) => {
    setHeaderRows(nextRows);
    updateField('extraHeaders', rowsToHeaders(nextRows));
  };

  const browserRequestUrl =
    connection.protocol === 'anthropic'
      ? buildAnthropicMessagesUrl(connection.baseUrl)
      : buildOpenAICompatibleChatCompletionsUrl(connection.baseUrl);
  const hasBaseUrl = Boolean(connection.baseUrl?.trim());
  const upstreamRequestUrl = hasBaseUrl
    ? connection.protocol === 'anthropic'
      ? buildAnthropicUpstreamMessagesUrl(connection.baseUrl)
      : buildOpenAICompatibleUpstreamChatCompletionsUrl(connection.baseUrl)
    : null;
  const extraHeaderCount = Object.keys(connection.extraHeaders).length;

  const handleTestConnection = async () => {
    const keyToTest = connection.apiKey;
    if (!keyToTest) {
      setTestStatus('error');
      setTestMessage(t('apiConfigNoKeyAvailable'));
      return;
    }

    const firstKey = parseApiKeys(keyToTest)[0];
    if (!firstKey) {
      setTestStatus('error');
      setTestMessage(t('apiConfigInvalidKeyFormat'));
      return;
    }

    setTestStatus('testing');
    setTestMessage(null);

    try {
      const providerConfig = {
        baseUrl: connection.baseUrl,
        temperature: 0,
        extraHeaders: connection.extraHeaders,
      };
      let providerError: Error | null = null;
      const onError = (error: Error) => {
        providerError = error;
      };
      const proxyProviderId = getProxyProviderHeader(connection.templateId);

      if (connection.protocol === 'anthropic') {
        await sendAnthropicMessageNonStream(
          firstKey,
          connection.modelId,
          [],
          [{ text: 'Hello' }],
          providerConfig,
          new AbortController().signal,
          onError,
          () => undefined,
          'user',
          proxyProviderId,
        );
      } else {
        await sendOpenAICompatibleMessageNonStream(
          firstKey,
          connection.modelId,
          [],
          [{ text: 'Hello' }],
          providerConfig,
          new AbortController().signal,
          onError,
          () => undefined,
          'user',
          proxyProviderId,
        );
      }

      if (providerError) {
        throw providerError;
      }

      setTestStatus('success');
    } catch (error) {
      setTestStatus('error');
      setTestMessage(getErrorMessage(error));
    }
  };

  const handleFetchModels = async () => {
    const firstKey = parseApiKeys(connection.apiKey)[0];
    if (!firstKey || !connection.baseUrl) {
      const message = t('apiConfigNoKeyAvailable');
      setFetchStatus('error');
      setFetchMessage(message);
      throw new Error(message);
    }

    setFetchStatus('idle');
    setFetchMessage(null);
    try {
      const models = await fetchOpenAICompatibleModels(
        firstKey,
        connection.baseUrl,
        new AbortController().signal,
        getProxyProviderHeader(connection.templateId),
        connection.extraHeaders,
      );
      setFetchStatus('success');
      return models;
    } catch (error) {
      const message = getErrorMessage(error);
      setFetchStatus('error');
      setFetchMessage(message);
      throw error;
    }
  };

  const baseUrlInputId = `connection-${connection.id}-base-url-input`;
  const nameInputId = `connection-${connection.id}-name-input`;

  const templateLinks = getThirdPartyTemplateLinks(connection.templateId);

  const PRESET_HEADERS = [
    { name: 'HTTP-Referer', defaultValue: 'https://github.com/yeahhe365/AMC-WebUI' },
    { name: 'X-Title', defaultValue: 'AMC-WebUI' },
    { name: 'User-Agent', defaultValue: 'AMC-WebUI/1.0' },
  ];

  const handleAddPresetHeader = (name: string, defaultValue: string) => {
    setShowAdvanced(true);
    const existing = headerRows.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (existing) return;
    const next = [
      ...headerRows,
      { rowId: `header-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, name, value: defaultValue },
    ];
    commitHeaderRows(next);
  };

  return (
    <div className="px-2.5 pb-2.5 space-y-3 border-t border-[var(--theme-border-secondary)]/30 pt-3">
      {(templateLinks.apiKeyUrl || templateLinks.docUrl) && (
        <div className="flex items-center gap-3 text-xs">
          {templateLinks.apiKeyUrl && (
            <a
              href={templateLinks.apiKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[var(--theme-text-link)] hover:underline"
            >
              <span>{t('thirdPartyGetApiKey')}</span>
              <ExternalLink size={12} />
            </a>
          )}
          {templateLinks.docUrl && (
            <a
              href={templateLinks.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:underline"
            >
              <span>{t('thirdPartyViewDocs')}</span>
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor={nameInputId}
          className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]"
        >
          {t('thirdPartyConnectionName')}
        </label>
        <input
          id={nameInputId}
          type="text"
          value={connection.name}
          onChange={(event) => updateField('name', event.target.value)}
          className={`w-full p-3 rounded-lg border transition-all duration-200 focus:ring-2 focus:ring-offset-0 text-sm ${SETTINGS_INPUT_CLASS}`}
          aria-label={t('thirdPartyConnectionName')}
        />
      </div>

      <ApiKeyInput
        inputId={`connection-${connection.id}-api-key-input`}
        apiKey={connection.apiKey}
        setApiKey={(value) => updateField('apiKey', value)}
        label={t('thirdPartyApiKey')}
        placeholder={t('apiConfigOpenaiKeyPlaceholder')}
        helpText={t('thirdPartyApiKeyHelp')}
      />

      <div className="space-y-2">
        <label
          htmlFor={baseUrlInputId}
          className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]"
        >
          {t('thirdPartyApiBaseUrl')}
        </label>
        <input
          id={baseUrlInputId}
          type="text"
          value={connection.baseUrl || ''}
          onChange={(event) => updateField('baseUrl', event.target.value)}
          className={`w-full p-3 rounded-lg border transition-all duration-200 focus:ring-2 focus:ring-offset-0 text-sm custom-scrollbar font-mono ${SETTINGS_INPUT_CLASS}`}
          aria-label={t('thirdPartyApiBaseUrl')}
        />
        {connection.protocol === 'openai-compatible' &&
          (() => {
            const warning = getOpenAICompatibleBaseUrlWarning(connection.baseUrl);
            if (warning === 'chat-completions-endpoint') {
              return (
                <p className="text-xs text-[var(--theme-text-warning)]">
                  {t('thirdPartyApiBaseUrlChatCompletionsWarning')}
                </p>
              );
            }
            if (warning === 'models-endpoint') {
              return (
                <p className="text-xs text-[var(--theme-text-warning)]">{t('thirdPartyApiBaseUrlModelsWarning')}</p>
              );
            }
            return null;
          })()}
        <p className="text-xs text-[var(--theme-text-secondary)]">{t('settingsOpenAICompatibleRequestUrlPreview')}</p>
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-[var(--theme-text-secondary)]">
            {t('settingsOpenAICompatibleBrowserRequestUrl')}
          </p>
          <p className="text-xs font-mono break-all text-[var(--theme-text-secondary)]">{browserRequestUrl}</p>
          <p className="text-[11px] uppercase tracking-wide text-[var(--theme-text-secondary)]">
            {t('settingsOpenAICompatibleUpstreamUrl')}
          </p>
          <p className="text-xs font-mono break-all text-[var(--theme-text-secondary)]">{upstreamRequestUrl ?? '—'}</p>
        </div>
      </div>

      <Select
        id={`connection-${connection.id}-protocol`}
        label={t('thirdPartyConnectionProtocol')}
        value={connection.protocol}
        onChange={(event) => updateField('protocol', event.target.value as ThirdPartyApiProtocol)}
      >
        <option value="openai-compatible">{t('thirdPartyProtocolOpenAI')}</option>
        <option value="anthropic">{t('thirdPartyProtocolAnthropic')}</option>
      </Select>

      <OpenAICompatibleModelListEditor
        models={connection.models}
        selectedModelId={connection.modelId}
        onModelsChange={(models) => updateField('models', models)}
        onSelectedModelChange={(modelId) => updateField('modelId', modelId)}
        onFetchModelsForImportPreview={connection.protocol === 'openai-compatible' ? handleFetchModels : undefined}
        isFetchModelsDisabled={!connection.apiKey || !connection.baseUrl}
        fetchModelsStatus={fetchStatus}
        fetchModelsMessage={fetchMessage}
      />

      <div className="space-y-2">
        <button
          type="button"
          data-testid="third-party-extra-headers-toggle"
          onClick={() => setShowAdvanced((open) => !open)}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-secondary)]"
        >
          {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {t('thirdPartyAdvancedHeaders')}
          {extraHeaderCount > 0 ? ` (${extraHeaderCount})` : ''}
        </button>
        {showAdvanced && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap pb-1">
              <span className="text-[11px] text-[var(--theme-text-secondary)]">{t('thirdPartyPresetHeaders')}:</span>
              {PRESET_HEADERS.map((preset) => {
                const isAdded = headerRows.some((r) => r.name.toLowerCase() === preset.name.toLowerCase());
                return (
                  <button
                    key={preset.name}
                    type="button"
                    disabled={isAdded}
                    onClick={() => handleAddPresetHeader(preset.name, preset.defaultValue)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                      isAdded
                        ? 'bg-[var(--theme-bg-tertiary)]/50 text-[var(--theme-text-tertiary)] opacity-60 cursor-default'
                        : 'bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-tertiary)]/80 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                    }`}
                  >
                    + {preset.name}
                  </button>
                );
              })}
            </div>
            {headerRows.map((row, index) => (
              <div key={row.rowId} className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.name}
                  placeholder={t('thirdPartyHeaderName')}
                  onChange={(event) => {
                    const next = headerRows.map((candidate, candidateIndex) =>
                      candidateIndex === index ? { ...candidate, name: event.target.value } : candidate,
                    );
                    commitHeaderRows(next);
                  }}
                  className={`flex-1 p-2 rounded-lg border text-xs font-mono ${SETTINGS_INPUT_CLASS}`}
                />
                <input
                  type="text"
                  value={row.value}
                  placeholder={t('thirdPartyHeaderValue')}
                  onChange={(event) => {
                    const next = headerRows.map((candidate, candidateIndex) =>
                      candidateIndex === index ? { ...candidate, value: event.target.value } : candidate,
                    );
                    commitHeaderRows(next);
                  }}
                  className={`flex-1 p-2 rounded-lg border text-xs font-mono ${SETTINGS_INPUT_CLASS}`}
                />
                <button
                  type="button"
                  className={SMALL_ICON_DANGER_BUTTON_CLASS}
                  aria-label={t('thirdPartyRemoveHeader')}
                  onClick={() => commitHeaderRows(headerRows.filter((_, candidateIndex) => candidateIndex !== index))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className={SETTINGS_INLINE_ACTION_BUTTON_CLASS}
              onClick={() =>
                setHeaderRows([
                  ...headerRows,
                  { rowId: `header-${headerRows.length}-${Date.now()}`, name: '', value: '' },
                ])
              }
            >
              <Plus size={14} />
              {t('thirdPartyAddHeader')}
            </button>
          </div>
        )}
      </div>

      <ApiConnectionTester
        onTest={handleTestConnection}
        testStatus={testStatus}
        testMessage={testMessage}
        isTestDisabled={testStatus === 'testing' || !connection.apiKey || !connection.baseUrl}
        availableModels={connection.models}
        testModelId={connection.modelId}
        onModelChange={(modelId) => updateField('modelId', modelId)}
        testModelSelectId={`connection-${connection.id}-api-test-model`}
      />

      {confirmingRemove ? (
        <div className="space-y-2 rounded-lg border border-[var(--theme-text-danger)]/25 bg-[var(--theme-bg-danger)]/5 p-2.5">
          <p className="text-sm text-[var(--theme-text-primary)]">{t('thirdPartyRemoveConnectionConfirm')}</p>
          {isInUse && (
            <p className="text-xs text-[var(--theme-text-secondary)]">{t('thirdPartyRemoveConnectionInUse')}</p>
          )}
          <div className="flex items-center gap-2">
            <button type="button" className={SETTINGS_DANGER_OUTLINE_BUTTON_CLASS} onClick={onRemove}>
              {t('delete')}
            </button>
            <button
              type="button"
              className={SETTINGS_SECONDARY_ACTION_BUTTON_CLASS}
              onClick={() => setConfirmingRemove(false)}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={SMALL_ICON_DANGER_BUTTON_CLASS} onClick={() => setConfirmingRemove(true)}>
          <Trash2 size={14} />
          {t('thirdPartyRemoveConnection')}
        </button>
      )}
    </div>
  );
};
