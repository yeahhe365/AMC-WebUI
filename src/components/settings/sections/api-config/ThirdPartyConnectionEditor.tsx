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
import { buildOpenAIResponsesUrl, buildOpenAIResponsesUpstreamUrl } from '@/services/api/openaiResponsesUrls';
import { buildAnthropicMessagesUrl, buildAnthropicUpstreamMessagesUrl } from '@/services/api/anthropicUrls';
import { fetchOpenAICompatibleModels } from '@/services/api/openaiCompatibleApi';
import { fetchOpenAIResponsesModels } from '@/services/api/openaiResponsesApi';
import { getErrorMessage } from '@/utils/errorMessage';
import { parseApiKeys } from '@/utils/apiKeySelection';
import { getProxyProviderHeader, getThirdPartyTemplateLinks } from '@/utils/thirdPartyApiProviders';
import {
  probeThirdPartyConnection,
  type ConnectionHealthProbeResult,
  type LatencyGrade,
} from '@/utils/thirdPartyDiagnostics';
import type { ThirdPartyApiProtocol, ThirdPartyConnection } from '@/types';
import { ApiKeyInput } from './ApiKeyInput';
import { ApiConnectionTester } from './ApiConnectionTester';
import { OpenAICompatibleModelListEditor } from './OpenAICompatibleModelListEditor';

interface ThirdPartyConnectionEditorProps {
  connection: ThirdPartyConnection;
  onChange: (updates: Partial<ThirdPartyConnection>) => void;
  onRemove: () => void;
  isInUse?: boolean;
  healthResult?: ConnectionHealthProbeResult | null;
  onHealthResult?: (result: ConnectionHealthProbeResult) => void;
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
  healthResult = null,
  onHealthResult,
}) => {
  const { t } = useI18n();
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>(
    () => healthResult?.status ?? 'idle',
  );
  const [testMessage, setTestMessage] = useState<string | null>(() => healthResult?.errorMessage ?? null);
  const [testLatencyMs, setTestLatencyMs] = useState<number | null>(() => healthResult?.latencyMs ?? null);
  const [testGrade, setTestGrade] = useState<LatencyGrade | null>(() => healthResult?.grade ?? null);
  const [diagnosticTip, setDiagnosticTip] = useState<string | null>(() => healthResult?.diagnosticTip ?? null);
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(Object.keys(connection.extraHeaders).length > 0);
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(() => toHeaderRows(connection.extraHeaders));
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  useEffect(() => {
    if (healthResult) {
      setTestStatus(healthResult.status);
      setTestMessage(healthResult.errorMessage ?? null);
      setTestLatencyMs(healthResult.latencyMs);
      setTestGrade(healthResult.grade);
      setDiagnosticTip(healthResult.diagnosticTip ?? null);
    }
  }, [healthResult]);

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
    setTestLatencyMs(null);
    setTestGrade(null);
    setDiagnosticTip(null);
  };

  const commitHeaderRows = (nextRows: HeaderRow[]) => {
    setHeaderRows(nextRows);
    updateField('extraHeaders', rowsToHeaders(nextRows));
  };

  const browserRequestUrl =
    connection.protocol === 'anthropic'
      ? buildAnthropicMessagesUrl(connection.baseUrl)
      : connection.protocol === 'openai-responses'
        ? buildOpenAIResponsesUrl(connection.baseUrl)
        : buildOpenAICompatibleChatCompletionsUrl(connection.baseUrl);
  const hasBaseUrl = Boolean(connection.baseUrl?.trim());
  const upstreamRequestUrl = hasBaseUrl
    ? connection.protocol === 'anthropic'
      ? buildAnthropicUpstreamMessagesUrl(connection.baseUrl)
      : connection.protocol === 'openai-responses'
        ? buildOpenAIResponsesUpstreamUrl(connection.baseUrl)
        : buildOpenAICompatibleUpstreamChatCompletionsUrl(connection.baseUrl)
    : null;
  const extraHeaderCount = Object.keys(connection.extraHeaders).length;

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage(null);
    setDiagnosticTip(null);
    setTestLatencyMs(null);
    setTestGrade(null);

    const result = await probeThirdPartyConnection(connection, {
      modelId: connection.modelId,
    });

    setTestStatus(result.status);
    setTestLatencyMs(result.latencyMs);
    setTestGrade(result.grade);
    if (result.status === 'error') {
      setTestMessage(result.errorMessage ?? t('apiConfigTestFailed'));
      setDiagnosticTip(result.diagnosticTip ?? null);
    } else {
      setTestMessage(null);
    }
    onHealthResult?.(result);
  };

  const handleFetchModels = async () => {
    const parsedKey = parseApiKeys(connection.apiKey)[0];
    const effectiveKey = parsedKey || (connection.authOptional ? 'auth-optional' : '');
    if (!effectiveKey || !connection.baseUrl) {
      const message = !connection.baseUrl ? t('thirdPartyApiUrlMissing') : t('apiConfigNoKeyAvailable');
      setFetchStatus('error');
      setFetchMessage(message);
      throw new Error(message);
    }

    setFetchStatus('idle');
    setFetchMessage(null);
    try {
      const fetchModelsFn =
        connection.protocol === 'openai-responses' ? fetchOpenAIResponsesModels : fetchOpenAICompatibleModels;
      const models = await fetchModelsFn(
        effectiveKey,
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
        placeholder={
          connection.authOptional ? t('thirdPartyApiKeyOptionalPlaceholder') : t('apiConfigOpenaiKeyPlaceholder')
        }
        helpText={connection.authOptional ? t('thirdPartyApiKeyOptionalHelp') : t('thirdPartyApiKeyHelp')}
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
        <details
          className="group rounded-md border border-[var(--theme-border-secondary)]/40 bg-[var(--theme-bg-tertiary)]/20 p-2 text-xs transition-all"
          open={Boolean(
            connection.protocol === 'openai-compatible' && getOpenAICompatibleBaseUrlWarning(connection.baseUrl),
          )}
        >
          <summary className="flex cursor-pointer items-center justify-between font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] select-none list-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5">
              <ChevronRight
                size={13}
                className="transition-transform duration-200 group-open:rotate-90 text-[var(--theme-text-secondary)] flex-shrink-0"
              />
              <span>{t('settingsOpenAICompatibleRequestUrlPreview')}</span>
            </span>
            <span className="text-[11px] font-mono text-[var(--theme-text-secondary)]/70 truncate max-w-[180px] sm:max-w-[260px]">
              {connection.protocol === 'anthropic'
                ? '/v1/messages'
                : connection.protocol === 'openai-responses'
                  ? '/v1/responses'
                  : '/v1/chat/completions'}
            </span>
          </summary>
          <div className="space-y-2 pt-2 mt-1.5 border-t border-[var(--theme-border-secondary)]/30">
            <div>
              <p className="text-[10px] uppercase tracking-wide font-medium text-[var(--theme-text-secondary)]">
                {t('settingsOpenAICompatibleBrowserRequestUrl')}
              </p>
              <p className="text-xs font-mono break-all text-[var(--theme-text-secondary)] bg-[var(--theme-bg-primary)]/40 p-1.5 rounded mt-0.5 border border-[var(--theme-border-secondary)]/20">
                {browserRequestUrl}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide font-medium text-[var(--theme-text-secondary)]">
                {t('settingsOpenAICompatibleUpstreamUrl')}
              </p>
              <p className="text-xs font-mono break-all text-[var(--theme-text-secondary)] bg-[var(--theme-bg-primary)]/40 p-1.5 rounded mt-0.5 border border-[var(--theme-border-secondary)]/20">
                {upstreamRequestUrl ?? '—'}
              </p>
            </div>
          </div>
        </details>
      </div>

      <Select
        id={`connection-${connection.id}-protocol`}
        label={t('thirdPartyConnectionProtocol')}
        value={connection.protocol}
        onChange={(event) => updateField('protocol', event.target.value as ThirdPartyApiProtocol)}
      >
        <option value="openai-compatible">{t('thirdPartyProtocolOpenAI')}</option>
        <option value="openai-responses">{t('thirdPartyProtocolOpenAIResponses')}</option>
        <option value="anthropic">{t('thirdPartyProtocolAnthropic')}</option>
      </Select>

      <OpenAICompatibleModelListEditor
        models={connection.models}
        selectedModelId={connection.modelId}
        onModelsChange={(models) => updateField('models', models)}
        onSelectedModelChange={(modelId) => updateField('modelId', modelId)}
        onFetchModelsForImportPreview={connection.protocol !== 'anthropic' ? handleFetchModels : undefined}
        isFetchModelsDisabled={(!connection.authOptional && !connection.apiKey) || !connection.baseUrl}
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
        latencyMs={testLatencyMs}
        latencyGrade={testGrade}
        diagnosticTip={diagnosticTip}
        isTestDisabled={
          testStatus === 'testing' || (!connection.authOptional && !connection.apiKey) || !connection.baseUrl
        }
        availableModels={connection.models}
        testModelId={connection.modelId}
        onModelChange={(modelId) => updateField('modelId', modelId)}
        testModelSelectId={`connection-${connection.id}-api-test-model`}
      />

      <div className="pt-2 border-t border-[var(--theme-border-secondary)]/30 flex items-center justify-end">
        {confirmingRemove ? (
          <div className="w-full space-y-2 rounded-lg border border-[var(--theme-text-danger)]/25 bg-[var(--theme-bg-danger)]/5 p-2.5">
            <p className="text-sm font-medium text-[var(--theme-text-primary)]">
              {t('thirdPartyRemoveConnectionConfirm')}
            </p>
            {isInUse && (
              <p className="text-xs text-[var(--theme-text-secondary)]">{t('thirdPartyRemoveConnectionInUse')}</p>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className={SETTINGS_SECONDARY_ACTION_BUTTON_CLASS}
                onClick={() => setConfirmingRemove(false)}
              >
                {t('cancel')}
              </button>
              <button type="button" className={SETTINGS_DANGER_OUTLINE_BUTTON_CLASS} onClick={onRemove}>
                <Trash2 size={13} />
                <span>{t('delete')}</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={SETTINGS_DANGER_OUTLINE_BUTTON_CLASS}
            onClick={() => setConfirmingRemove(true)}
          >
            <Trash2 size={13} />
            <span>{t('thirdPartyRemoveConnection')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
