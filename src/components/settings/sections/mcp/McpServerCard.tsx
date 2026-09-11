import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { Toggle } from '@/components/shared/Toggle';
import { Select } from '@/components/shared/Select';
import {
  SETTINGS_OUTLINE_BUTTON_CLASS,
  SMALL_ICON_BUTTON_CLASS,
  SMALL_ICON_DANGER_BUTTON_CLASS,
} from '@/constants/buttonClasses';
import { SETTINGS_SECTION_CARD_CLASS, SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { interpolate } from '@/i18n/interpolate';
import { useMcpStatusStore } from '@/stores/mcpStatusStore';
import type { McpServerAuthType, McpServerConfig, McpServerTransport } from '@/types';
import { copyTextToClipboard } from '@/utils/clipboard';
import { McpCapabilitiesTabs } from './McpCapabilitiesTabs';
import {
  MCP_INPUT_BASE_CLASSES,
  formatLines,
  formatRecord,
  parseLines,
  parseRecord,
  type CapabilityTestState,
} from './mcpSectionShared';

/** Small uppercase heading that partitions the expanded server form into scannable groups. */
const SettingsGroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">{children}</div>
);

const applyTransportDefaults = (server: McpServerConfig, transport: McpServerTransport): Partial<McpServerConfig> => {
  if (transport === 'stdio') {
    return { transport, command: server.command ?? '', args: server.args ?? [], env: server.env ?? {} };
  }
  // http | sse share URL/auth fields
  return { transport, url: server.url ?? '', headers: server.headers ?? {}, auth: server.auth ?? { type: 'none' } };
};

interface McpServerCardProps {
  server: McpServerConfig;
  index: number;
  isExpanded: boolean;
  capabilityState?: CapabilityTestState;
  canMoveUp: boolean;
  canMoveDown: boolean;
  activeTab: string;
  toolQuery: string;
  deferredToolQuery: string;
  schemaToolNames: Set<string>;
  onToggleExpanded: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRemove: () => void;
  onTestCapabilities: () => void;
  onMove: (direction: -1 | 1) => void;
  onUpdateServer: (updates: Partial<McpServerConfig>) => void;
  onTabChange: (tab: string) => void;
  onToolQueryChange: (query: string) => void;
  onToggleSchemaTool: (toolName: string) => void;
  t: (key: string) => string;
}

/** One collapsible MCP server row: status header, connection/auth form, capabilities. */
export const McpServerCard: React.FC<McpServerCardProps> = ({
  server,
  index,
  isExpanded,
  capabilityState,
  canMoveUp,
  canMoveDown,
  activeTab,
  toolQuery,
  deferredToolQuery,
  schemaToolNames,
  onToggleExpanded,
  onToggleEnabled,
  onRemove,
  onTestCapabilities,
  onMove,
  onUpdateServer,
  onTabChange,
  onToolQueryChange,
  onToggleSchemaTool,
  t,
}) => {
  const states = useMcpStatusStore((s) => s.states);
  // Copy-id feedback is ephemeral per-card UI state; no reason to hoist it.
  const [copiedId, setCopiedId] = useState(false);

  const storeStatus = states[server.id];
  const status = (storeStatus ?? {
    state: server.enabled ? 'connecting' : 'disabled',
    lastError: undefined,
    lastCheckedAt: 0,
  }) as typeof storeStatus & {
    state: 'connected' | 'connecting' | 'error' | 'disabled';
    lastError?: string;
    version?: string;
  };
  const dotClass =
    status.state === 'connected'
      ? 'bg-emerald-500'
      : status.state === 'error'
        ? 'bg-red-500'
        : status.state === 'connecting'
          ? 'bg-amber-500'
          : 'bg-zinc-400';
  const pillClass =
    status.state === 'connected'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : status.state === 'error'
        ? 'bg-red-500/10 text-red-700 dark:text-red-400'
        : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]';
  const pillLabel =
    status.state === 'connected'
      ? t('settingsMcpStatusConnected')
      : status.state === 'error'
        ? t('settingsMcpStatusError')
        : status.state === 'connecting'
          ? t('settingsMcpStatusConnecting')
          : t('settingsMcpStatusDisabled');
  const typeLabel = server.transport === 'stdio' ? 'STDIO' : server.transport === 'sse' ? 'SSE' : 'HTTP';
  const typeBadgeClass =
    server.transport === 'stdio'
      ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]'
      : server.transport === 'sse'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : 'bg-sky-500/10 text-sky-700 dark:text-sky-400';
  const displayName = server.name || interpolate(t('settingsMcpUnnamedServer'), { index: index + 1 });
  const summaryText =
    server.transport === 'stdio'
      ? [server.command ?? '', ...(server.args ?? [])].filter(Boolean).join(' ')
      : (server.url ?? '');
  const capabilities = capabilityState?.status === 'success' ? capabilityState.capabilities : undefined;

  const handleTransportChange = (transport: McpServerTransport) => {
    onUpdateServer(applyTransportDefaults(server, transport));
  };

  const handleAuthTypeChange = (authType: McpServerAuthType) => {
    onUpdateServer({ auth: authType === 'bearer' ? { type: 'bearer' } : { type: authType } });
  };

  return (
    <section className={SETTINGS_SECTION_CARD_CLASS} data-settings-item={`mcp-server-${index}`}>
      <div data-mcp-server-card-header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          data-testid={`mcp-card-expand-${index}`}
          aria-expanded={isExpanded}
          title={t('settingsMcpToggleExpand')}
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-text-link)]"
        >
          {isExpanded ? (
            <ChevronDown
              size={15}
              strokeWidth={1.7}
              className="shrink-0 text-[var(--theme-text-tertiary)]"
              aria-hidden
            />
          ) : (
            <ChevronRight
              size={15}
              strokeWidth={1.7}
              className="shrink-0 text-[var(--theme-text-tertiary)]"
              aria-hidden
            />
          )}
          <span
            data-testid={`mcp-status-dot-${server.id}`}
            data-state={status.state}
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotClass}`}
            title={[pillLabel, status.lastError].filter(Boolean).join(' — ')}
          />
          <span className="min-w-0 truncate text-sm font-medium text-[var(--theme-text-primary)]">{displayName}</span>
          <span
            // Search anchor lives on the collapsed badge too, so the
            // transport entry resolves before the card is expanded.
            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${typeBadgeClass}`}
            data-settings-item={!isExpanded && index === 0 ? 'mcp-transport' : undefined}
          >
            {typeLabel}
          </span>
          {status.state !== 'disabled' && (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${pillClass}`}>
              {pillLabel}
            </span>
          )}
          {status.version ? (
            <span className="shrink-0 text-[11px] text-[var(--theme-text-tertiary)]">v{status.version}</span>
          ) : null}
        </button>
        <div
          data-mcp-server-card-actions
          data-testid={`mcp-card-actions-${index}`}
          className="flex shrink-0 items-center gap-2 self-start sm:self-auto"
        >
          <Toggle checked={server.enabled} onChange={onToggleEnabled} ariaLabel={displayName} />
          <button
            type="button"
            onClick={onRemove}
            className={SMALL_ICON_DANGER_BUTTON_CLASS}
            aria-label={t('settingsMcpRemoveServer')}
          >
            <Trash2 size={15} strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {!isExpanded && (
        <div className="mt-1.5 flex min-w-0 items-center gap-2 pl-6 text-xs text-[var(--theme-text-tertiary)]">
          <span className="min-w-0 truncate font-mono">{summaryText}</span>
          {status.state === 'error' && status.lastError ? (
            <span className="ml-auto min-w-0 truncate text-[var(--theme-text-danger)]">{status.lastError}</span>
          ) : null}
        </div>
      )}

      {isExpanded && (
        <div className="mt-4 space-y-5" data-mcp-server-card-detail data-testid={`mcp-card-detail-${index}`}>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onTestCapabilities}
              disabled={capabilityState?.status === 'loading'}
              className={`${SETTINGS_OUTLINE_BUTTON_CLASS} shrink-0 whitespace-nowrap`}
            >
              <RefreshCw
                size={13}
                strokeWidth={1.7}
                className={capabilityState?.status === 'loading' ? 'animate-spin' : undefined}
              />
              {capabilityState?.status === 'loading' ? t('settingsMcpTesting') : t('settingsMcpTestServer')}
            </button>
            <div className="ml-auto flex items-center gap-1 sm:ml-0">
              <button
                type="button"
                data-testid={`mcp-move-up-${index}`}
                aria-label={`${t('settingsMcpMoveUp')} - ${displayName}`}
                title={t('settingsMcpMoveUp')}
                disabled={!canMoveUp}
                onClick={() => onMove(-1)}
                className={`${SMALL_ICON_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <ArrowUp size={14} strokeWidth={1.7} />
              </button>
              <button
                type="button"
                data-testid={`mcp-move-down-${index}`}
                aria-label={`${t('settingsMcpMoveDown')} - ${displayName}`}
                title={t('settingsMcpMoveDown')}
                disabled={!canMoveDown}
                onClick={() => onMove(1)}
                className={`${SMALL_ICON_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <ArrowDown size={14} strokeWidth={1.7} />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <SettingsGroupLabel>{t('settingsMcpGroupConnection')}</SettingsGroupLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpServerName')}</span>
                <input
                  value={server.name}
                  onChange={(event) => onUpdateServer({ name: event.target.value })}
                  className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS}`}
                />
              </label>

              <div className="space-y-2" data-settings-item={index === 0 ? 'mcp-transport' : undefined}>
                <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpTransport')}</span>
                <Select
                  label={t('settingsMcpTransport')}
                  hideLabel
                  value={server.transport}
                  onChange={(event) => handleTransportChange(event.target.value as McpServerTransport)}
                >
                  <option value="stdio">{t('settingsMcpTransportStdio')}</option>
                  <option value="http">{t('settingsMcpTransportHttp')}</option>
                  <option value="sse">{t('settingsMcpTransportSse')}</option>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {server.transport === 'stdio' ? (
                <label className="space-y-2">
                  <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpCommand')}</span>
                  <input
                    value={server.command ?? ''}
                    onChange={(event) => onUpdateServer({ command: event.target.value })}
                    className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS} font-mono`}
                    placeholder="npx"
                  />
                </label>
              ) : (
                <label className="space-y-2 sm:col-span-2">
                  <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpUrl')}</span>
                  <input
                    value={server.url ?? ''}
                    onChange={(event) => onUpdateServer({ url: event.target.value })}
                    className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS} font-mono`}
                    placeholder={server.transport === 'sse' ? 'https://example.com/sse' : 'https://example.com/mcp'}
                  />
                </label>
              )}
            </div>

            {server.transport === 'stdio' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpArgs')}</span>
                  <textarea
                    value={formatLines(server.args)}
                    onChange={(event) => onUpdateServer({ args: parseLines(event.target.value) })}
                    className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS} min-h-[96px] resize-y font-mono`}
                    placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/Users/me"
                    spellCheck={false}
                  />
                </label>
                <label className="space-y-2">
                  <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpEnv')}</span>
                  <textarea
                    value={formatRecord(server.env)}
                    onChange={(event) => onUpdateServer({ env: parseRecord(event.target.value) })}
                    className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS} min-h-[96px] resize-y font-mono`}
                    placeholder="TOKEN=value"
                    spellCheck={false}
                  />
                </label>
              </div>
            )}
          </div>

          {server.transport !== 'stdio' && (
            <div className="space-y-3">
              <SettingsGroupLabel>{t('settingsMcpGroupAuth')}</SettingsGroupLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpAuth')}</span>
                  <Select
                    label={t('settingsMcpAuth')}
                    hideLabel
                    value={server.auth?.type ?? 'none'}
                    onChange={(event) => handleAuthTypeChange(event.target.value as McpServerAuthType)}
                  >
                    <option value="none">{t('settingsMcpAuthNone')}</option>
                    <option value="bearer">{t('settingsMcpAuthBearer')}</option>
                    <option value="customHeaders">{t('settingsMcpAuthCustomHeaders')}</option>
                  </Select>
                </div>
                {server.auth?.type === 'bearer' && (
                  <label className="space-y-2">
                    <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpBearerToken')}</span>
                    <input
                      type="password"
                      value={server.auth.token ?? ''}
                      onChange={(event) => onUpdateServer({ auth: { type: 'bearer', token: event.target.value } })}
                      className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS} font-mono`}
                      placeholder="mcp_token"
                    />
                  </label>
                )}
              </div>
              <label className="block space-y-2">
                <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpHeaders')}</span>
                <textarea
                  value={formatRecord(server.headers)}
                  onChange={(event) => onUpdateServer({ headers: parseRecord(event.target.value) })}
                  className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS} min-h-[96px] resize-y font-mono`}
                  placeholder="X-Workspace=docs"
                  spellCheck={false}
                />
              </label>
            </div>
          )}

          <div className="space-y-3">
            <SettingsGroupLabel>{t('settingsMcpGroupAdvanced')}</SettingsGroupLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpServerId')}</span>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={server.id}
                    aria-label={t('settingsMcpServerId')}
                    className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS} flex-1 font-mono opacity-70`}
                  />
                  <button
                    type="button"
                    data-testid={`mcp-copy-id-${index}`}
                    aria-label={t('settingsMcpCopyId')}
                    title={copiedId ? t('settingsMcpIdCopied') : t('settingsMcpCopyId')}
                    onClick={async () => {
                      const ok = await copyTextToClipboard(server.id);
                      if (ok) {
                        setCopiedId(true);
                      }
                    }}
                    className={SETTINGS_OUTLINE_BUTTON_CLASS}
                  >
                    {copiedId ? <Check size={14} strokeWidth={1.7} /> : <Copy size={14} strokeWidth={1.7} />}
                  </button>
                </div>
              </div>
              <label className="space-y-2">
                <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpTimeoutLabel')}</span>
                <input
                  type="number"
                  min={1}
                  max={3600}
                  value={server.timeout ?? ''}
                  onChange={(event) => {
                    const raw = event.target.value === '' ? undefined : Number(event.target.value);
                    onUpdateServer({ timeout: raw });
                  }}
                  placeholder="60"
                  className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS}`}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 pt-1">
              <Toggle
                checked={server.longRunning === true}
                onChange={(v) => onUpdateServer({ longRunning: v || undefined })}
                ariaLabel={t('settingsMcpLongRunning')}
              />
              <span className={SETTINGS_SECTION_LABEL_CLASS}>{t('settingsMcpLongRunning')}</span>
            </label>
          </div>

          {capabilities && (
            <McpCapabilitiesTabs
              server={server}
              index={index}
              capabilities={capabilities}
              activeTab={activeTab}
              toolQuery={toolQuery}
              deferredToolQuery={deferredToolQuery}
              schemaToolNames={schemaToolNames}
              onTabChange={onTabChange}
              onToolQueryChange={onToolQueryChange}
              onToggleSchemaTool={onToggleSchemaTool}
              onUpdateServer={(_, updates) => onUpdateServer(updates)}
              t={t}
            />
          )}
          {capabilityState?.status === 'error' && (
            <div className="rounded-md border border-[var(--theme-text-danger)]/30 bg-[var(--theme-bg-danger)]/10 p-3 text-xs text-[var(--theme-text-danger)]">
              {capabilityState.error}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
