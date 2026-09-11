import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { Toggle } from '@/components/shared/Toggle';
import { SETTINGS_OUTLINE_BUTTON_CLASS, SETTINGS_PRIMARY_ACTION_BUTTON_CLASS } from '@/constants/buttonClasses';
import {
  THIRD_PARTY_TEMPLATE_IDS,
  type AppSettings,
  type ThirdPartyApiSettings,
  type ThirdPartyConnection,
  type ThirdPartyTemplateId,
} from '@/types';
import {
  addThirdPartyConnection,
  createConnectionFromTemplate,
  createConnectionId,
  createDefaultThirdPartyApiSettings,
  getConnectionDisplayTemplateId,
  getThirdPartyConnectionStatus,
  isThirdPartyConnectionInUse,
  removeThirdPartyConnection,
  updateThirdPartyConnection,
} from '@/utils/thirdPartyApiProviders';
import {
  applyImportedProviders,
  exportProvidersBackupFile,
  parseProvidersBackupText,
  type ImportMode,
} from '@/utils/thirdPartyBackup';
import {
  formatLatency,
  getLatencyBadgeStyles,
  probeThirdPartyConnection,
  type ConnectionHealthProbeResult,
} from '@/utils/thirdPartyDiagnostics';
import { toastError, toastSuccess, toastWarning } from '@/stores/toastStore';
import { interpolate } from '@/i18n/interpolate';
import { getThirdPartyTemplateLogo } from '@/components/shared/ModelIcon';
import { useChatStore } from '@/stores/chatStore';
import { ThirdPartyAddConnectionDialog } from './ThirdPartyAddConnectionDialog';
import { ThirdPartyBackupDialog, type ThirdPartyBackupDialogMode } from './ThirdPartyBackupDialog';
import { ThirdPartyConnectionEditor } from './ThirdPartyConnectionEditor';

interface ThirdPartyApiSettingsPanelProps {
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
}

export const ThirdPartyApiSettingsPanel: React.FC<ThirdPartyApiSettingsPanelProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { t } = useI18n();
  const connections = useMemo(() => settings.thirdPartyApi?.connections ?? [], [settings.thirdPartyApi?.connections]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [backupDialogMode, setBackupDialogMode] = useState<ThirdPartyBackupDialogMode>('export');
  const [pendingImportedConnections, setPendingImportedConnections] = useState<ThirdPartyConnection[]>([]);
  const [healthResults, setHealthResults] = useState<Record<string, ConnectionHealthProbeResult>>({});
  const [probingConnectionIds, setProbingConnectionIds] = useState<Set<string>>(new Set());
  const [isTestingAll, setIsTestingAll] = useState(false);

  const updateThirdPartyApi = (next: ThirdPartyApiSettings) => {
    onUpdateSettings({ thirdPartyApi: next });
  };

  const currentSettings = settings.thirdPartyApi ?? createDefaultThirdPartyApiSettings();

  const handleToggleEnabled = (connection: ThirdPartyConnection) => {
    updateThirdPartyApi(updateThirdPartyConnection(currentSettings, connection.id, { enabled: !connection.enabled }));
  };

  const handleAddTemplate = (templateId: ThirdPartyTemplateId) => {
    const connection = createConnectionFromTemplate(templateId, currentSettings.connections, createConnectionId());
    updateThirdPartyApi(addThirdPartyConnection(currentSettings, connection));
    setSelectedConnectionId(connection.id);
    setIsAddOpen(false);
  };

  const handleExportClick = () => {
    if (connections.length === 0) {
      toastWarning(t('thirdPartyExportEmpty'));
      return;
    }
    setBackupDialogMode('export');
    setIsBackupOpen(true);
  };

  const handleConfirmExport = (includeApiKeys: boolean) => {
    exportProvidersBackupFile(connections, { includeApiKeys });
  };

  const handleFileSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (reader.result ?? e.target?.result) as string;
      const parsed = parseProvidersBackupText(text);
      if (parsed.validCount === 0) {
        toastError(t('thirdPartyImportError'));
        return;
      }

      if (connections.length === 0) {
        const next = applyImportedProviders([], parsed.connections, 'overwrite');
        updateThirdPartyApi({ ...currentSettings, connections: next });
        toastSuccess(interpolate(t('thirdPartyImportSuccess'), { count: parsed.validCount }));
        if (next.length > 0) {
          setSelectedConnectionId(next[0].id);
        }
      } else {
        setPendingImportedConnections(parsed.connections);
        setBackupDialogMode('import-confirm');
        setIsBackupOpen(true);
      }
    };
    reader.onerror = () => {
      toastError(t('thirdPartyImportError'));
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = (mode: ImportMode) => {
    const next = applyImportedProviders(connections, pendingImportedConnections, mode);
    updateThirdPartyApi({ ...currentSettings, connections: next });
    toastSuccess(interpolate(t('thirdPartyImportSuccess'), { count: pendingImportedConnections.length }));
    if (next.length > 0 && !selectedConnectionId) {
      setSelectedConnectionId(next[0].id);
    }
  };

  const handleProbeConnection = async (connection: ThirdPartyConnection) => {
    if (probingConnectionIds.has(connection.id)) return;
    setProbingConnectionIds((prev) => new Set(prev).add(connection.id));
    try {
      const result = await probeThirdPartyConnection(connection);
      setHealthResults((prev) => ({ ...prev, [connection.id]: result }));
      if (result.status === 'success') {
        toastSuccess(`${connection.name}: ${t('apiConfigTestSuccess')} (${formatLatency(result.latencyMs)})`);
      } else {
        toastError(
          `${connection.name}: ${t('apiConfigTestFailed')}${result.errorMessage ? ` - ${result.errorMessage}` : ''}`,
        );
      }
    } finally {
      setProbingConnectionIds((prev) => {
        const next = new Set(prev);
        next.delete(connection.id);
        return next;
      });
    }
  };

  const handleTestAllConnections = async () => {
    const targetConnections = connections.filter((c) => c.enabled && Boolean(c.baseUrl));
    if (targetConnections.length === 0) {
      toastWarning(t('thirdPartyExportEmpty'));
      return;
    }

    setIsTestingAll(true);
    setProbingConnectionIds((prev) => {
      const next = new Set(prev);
      targetConnections.forEach((c) => next.add(c.id));
      return next;
    });

    try {
      const results = await Promise.allSettled(
        targetConnections.map(async (conn) => {
          const result = await probeThirdPartyConnection(conn);
          setHealthResults((prev) => ({ ...prev, [conn.id]: result }));
          setProbingConnectionIds((prev) => {
            const next = new Set(prev);
            next.delete(conn.id);
            return next;
          });
          return result;
        }),
      );

      const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.status === 'success').length;
      const failCount = targetConnections.length - successCount;

      if (failCount === 0) {
        toastSuccess(`${t('apiConfigTestSuccess')}: ${successCount}/${targetConnections.length}`);
      } else {
        toastWarning(`${t('apiConfigTestSuccess')}: ${successCount}, ${t('apiConfigTestFailed')}: ${failCount}`);
      }
    } finally {
      setIsTestingAll(false);
      setProbingConnectionIds(new Set());
    }
  };

  const connectionStatus = (connection: ThirdPartyConnection) => {
    const status = getThirdPartyConnectionStatus(connection);
    if (status === 'disabled') {
      return {
        label: t('thirdPartyConnectionDisabled'),
        className: 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]',
        dotColor: 'bg-[var(--theme-text-secondary)]/50',
      };
    }
    if (status === 'missing-key') {
      return {
        label: t('thirdPartyApiKeyMissing'),
        className: 'bg-[var(--theme-bg-warning)] text-[var(--theme-text-warning)]',
        dotColor: 'bg-amber-500',
      };
    }
    if (status === 'missing-url') {
      return {
        label: t('thirdPartyApiUrlMissing'),
        className: 'bg-[var(--theme-bg-warning)] text-[var(--theme-text-warning)]',
        dotColor: 'bg-amber-500',
      };
    }
    return {
      label: t('thirdPartyApiReady'),
      className: 'bg-[var(--theme-bg-success)] text-[var(--theme-text-success)]',
      dotColor: 'bg-emerald-500',
    };
  };

  const filteredConnections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return connections;
    return connections.filter((conn) => {
      if (conn.name.toLowerCase().includes(query)) return true;
      if (conn.templateId.toLowerCase().includes(query)) return true;
      if (conn.protocol.toLowerCase().includes(query)) return true;
      if (conn.models.some((m) => m.id.toLowerCase().includes(query) || m.name?.toLowerCase().includes(query))) {
        return true;
      }
      return false;
    });
  }, [connections, searchQuery]);

  const selectedConnection = useMemo(
    () => connections.find((c) => c.id === selectedConnectionId) ?? null,
    [connections, selectedConnectionId],
  );

  return (
    <div className="space-y-3" data-settings-item="api-provider">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--theme-text-primary)]">{t('settingsApiModeThirdParty')}</h3>
          <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5">{t('settingsOpenAICompatibleToggleHelp')}</p>
        </div>
        {connections.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleFileSelected(file);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              data-testid="third-party-test-all-btn"
              className={SETTINGS_OUTLINE_BUTTON_CLASS}
              onClick={handleTestAllConnections}
              disabled={connections.length === 0 || isTestingAll}
              title={t('apiConfigTestAllConnections')}
            >
              {isTestingAll ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
              {isTestingAll ? t('apiConfigTestingAll') : t('apiConfigTestAllConnections')}
            </button>
            <button
              type="button"
              data-testid="third-party-import-btn"
              className={SETTINGS_OUTLINE_BUTTON_CLASS}
              onClick={() => fileInputRef.current?.click()}
              title={t('thirdPartyImport')}
            >
              <Upload size={13} />
              {t('thirdPartyImport')}
            </button>
            <button
              type="button"
              data-testid="third-party-export-btn"
              className={SETTINGS_OUTLINE_BUTTON_CLASS}
              onClick={handleExportClick}
              disabled={connections.length === 0}
              title={t('thirdPartyExport')}
            >
              <Download size={13} />
              {t('thirdPartyExport')}
            </button>
            <button
              type="button"
              data-testid="third-party-add-connection"
              className={SETTINGS_PRIMARY_ACTION_BUTTON_CLASS}
              onClick={() => setIsAddOpen(true)}
            >
              <Plus size={14} />
              {t('thirdPartyAddConnection')}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1.5" data-settings-item="api-third-party">
        <ThirdPartyAddConnectionDialog
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSelectTemplate={handleAddTemplate}
          templates={THIRD_PARTY_TEMPLATE_IDS}
        />

        <ThirdPartyBackupDialog
          isOpen={isBackupOpen}
          onClose={() => setIsBackupOpen(false)}
          dialogMode={backupDialogMode}
          connectionsCount={connections.length}
          importedConnections={pendingImportedConnections}
          onConfirmExport={handleConfirmExport}
          onConfirmImport={handleConfirmImport}
        />

        {connections.length === 0 && !isAddOpen ? (
          <div className="rounded-lg border border-dashed border-[var(--theme-border-secondary)] px-3 py-6 text-center space-y-3">
            <p className="text-sm text-[var(--theme-text-secondary)]">{t('thirdPartyConnectionsEmpty')}</p>
            <button
              type="button"
              data-testid="third-party-add-connection"
              className={SETTINGS_PRIMARY_ACTION_BUTTON_CLASS}
              onClick={() => setIsAddOpen(true)}
            >
              <Plus size={14} />
              {t('thirdPartyAddConnection')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-3 items-stretch min-h-[440px]">
            <div
              className={`w-full md:w-72 lg:w-80 flex-shrink-0 flex flex-col gap-2 rounded-xl border border-[var(--theme-border-secondary)]/50 bg-[var(--theme-bg-tertiary)]/15 p-2.5 ${
                selectedConnection ? 'hidden md:flex' : 'flex'
              }`}
            >
              {connections.length > 1 && (
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)] pointer-events-none"
                  />
                  <input
                    type="text"
                    data-testid="third-party-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('thirdPartySearchPlaceholder')}
                    className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-secondary)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--theme-border-focus)] transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 max-h-[520px] md:max-h-[600px] pr-0.5">
                {filteredConnections.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[var(--theme-text-secondary)]">
                    {t('thirdPartyNoSearchResults')}
                  </div>
                ) : (
                  filteredConnections.map((connection) => {
                    const isSelected = selectedConnectionId === connection.id;
                    const status = connectionStatus(connection);
                    const displayTemplateId = getConnectionDisplayTemplateId(connection);
                    const health = healthResults[connection.id];
                    const isProbing = probingConnectionIds.has(connection.id);

                    return (
                      <div
                        key={connection.id}
                        data-testid={`connection-${connection.id}-card`}
                        className={`relative group rounded-lg border transition-all p-2 ${
                          isSelected
                            ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-secondary)] shadow-xs ring-1 ring-[var(--theme-border-focus)]/30'
                            : connection.enabled
                              ? 'border-[var(--theme-border-secondary)]/60 bg-[var(--theme-bg-primary)]/70 hover:bg-[var(--theme-bg-tertiary)]/40 hover:border-[var(--theme-border-secondary)]'
                              : 'border-[var(--theme-border-secondary)]/30 bg-[var(--theme-bg-tertiary)]/10 opacity-75 hover:opacity-100'
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[var(--theme-border-focus)]" />
                        )}

                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex-shrink-0 pt-0.5">
                            <Toggle
                              checked={connection.enabled}
                              onChange={() => handleToggleEnabled(connection)}
                              ariaLabel={`${connection.name} ${t('enable')}`}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedConnectionId(connection.id)}
                            className="flex flex-col flex-1 min-w-0 cursor-pointer text-left focus:outline-none px-1"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status.dotColor}`} />
                              <img
                                src={getThirdPartyTemplateLogo(displayTemplateId)}
                                alt=""
                                width={16}
                                height={16}
                                draggable={false}
                                className="flex-shrink-0 object-contain"
                                style={{ width: 16, height: 16 }}
                              />
                              <span className="text-sm font-medium text-[var(--theme-text-primary)] truncate">
                                {connection.name}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1 mt-1 pl-3">
                              <span className="text-[10px] uppercase tracking-wide px-1 py-0.2 rounded bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] font-mono">
                                {connection.protocol === 'anthropic'
                                  ? t('thirdPartyProtocolAnthropic')
                                  : connection.protocol === 'openai-responses'
                                    ? t('thirdPartyProtocolOpenAIResponses')
                                    : t('thirdPartyProtocolOpenAI')}
                              </span>
                              <span className={`text-[10px] px-1 py-0.2 rounded ${status.className}`}>
                                {status.label}
                              </span>
                              {connection.models.length > 0 && (
                                <span className="text-[10px] px-1 py-0.2 rounded bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]">
                                  {interpolate(t('thirdPartyModelCount'), { count: connection.models.length })}
                                </span>
                              )}
                            </div>
                          </button>

                          <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                            {health && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-all ${
                                  getLatencyBadgeStyles(health.grade).badge
                                }`}
                                title={
                                  health.status === 'success'
                                    ? `${t('apiConfigTestSuccess')}: ${formatLatency(health.latencyMs)} (${health.modelId})`
                                    : `${t('apiConfigTestFailed')}${health.errorMessage ? `: ${health.errorMessage}` : ''}`
                                }
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${getLatencyBadgeStyles(health.grade).dot}`}
                                />
                                <span>
                                  {health.status === 'success'
                                    ? formatLatency(health.latencyMs)
                                    : t('apiConfigTestFailed')}
                                </span>
                              </span>
                            )}

                            <button
                              type="button"
                              data-testid={`quick-test-${connection.id}-btn`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleProbeConnection(connection);
                              }}
                              disabled={isProbing}
                              className="p-1 rounded-md text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--theme-border-focus)] disabled:opacity-50"
                              title={t('apiConfigQuickTestTooltip')}
                              aria-label={`${t('apiConfigQuickTestTooltip')}: ${connection.name}`}
                            >
                              {isProbing ? (
                                <Loader2 size={13} className="animate-spin text-[var(--theme-text-primary)]" />
                              ) : (
                                <Activity size={13} />
                              )}
                            </button>

                            <ChevronRight
                              size={14}
                              className={`transition-colors ${
                                isSelected
                                  ? 'text-[var(--theme-border-focus)]'
                                  : 'text-[var(--theme-text-secondary)]/40'
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div
              className={`flex-1 min-w-0 flex flex-col rounded-xl border border-[var(--theme-border-secondary)]/60 bg-[var(--theme-bg-secondary)]/15 shadow-xs ${
                selectedConnection ? 'flex' : 'hidden md:flex'
              }`}
            >
              {selectedConnection ? (
                <div className="flex flex-col flex-1 p-3 sm:p-4 space-y-3 overflow-y-auto custom-scrollbar max-h-[600px]">
                  <div className="md:hidden">
                    <button
                      type="button"
                      onClick={() => setSelectedConnectionId(null)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors py-1 px-2 rounded-md hover:bg-[var(--theme-bg-tertiary)] -ml-1"
                    >
                      <ChevronLeft size={14} />
                      <span>{t('thirdPartyBackToList')}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--theme-border-secondary)]/30">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={getThirdPartyTemplateLogo(getConnectionDisplayTemplateId(selectedConnection))}
                        alt=""
                        width={24}
                        height={24}
                        draggable={false}
                        className="flex-shrink-0 object-contain"
                        style={{ width: 24, height: 24 }}
                      />
                      <div className="min-w-0">
                        <h4 className="text-base font-semibold text-[var(--theme-text-primary)] truncate">
                          {selectedConnection.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] font-mono">
                            {selectedConnection.protocol === 'anthropic'
                              ? t('thirdPartyProtocolAnthropic')
                              : selectedConnection.protocol === 'openai-responses'
                                ? t('thirdPartyProtocolOpenAIResponses')
                                : t('thirdPartyProtocolOpenAI')}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${connectionStatus(selectedConnection).className}`}
                          >
                            {connectionStatus(selectedConnection).label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Toggle
                        checked={selectedConnection.enabled}
                        onChange={() => handleToggleEnabled(selectedConnection)}
                        ariaLabel={`${selectedConnection.name} ${t('enable')}`}
                      />
                    </div>
                  </div>

                  <ThirdPartyConnectionEditor
                    connection={selectedConnection}
                    isInUse={isThirdPartyConnectionInUse(
                      selectedConnection.id,
                      useChatStore.getState().savedSessions,
                      settings.providerId,
                    )}
                    healthResult={healthResults[selectedConnection.id]}
                    onHealthResult={(res) => setHealthResults((prev) => ({ ...prev, [selectedConnection.id]: res }))}
                    onChange={(updates) =>
                      updateThirdPartyApi(updateThirdPartyConnection(currentSettings, selectedConnection.id, updates))
                    }
                    onRemove={() => {
                      updateThirdPartyApi(removeThirdPartyConnection(currentSettings, selectedConnection.id));
                      setSelectedConnectionId(null);
                    }}
                  />
                </div>
              ) : (
                /* Empty Detail Placeholder */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[360px]">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--theme-bg-tertiary)]/60 flex items-center justify-center text-[var(--theme-text-secondary)] mb-3">
                    <SlidersHorizontal size={24} />
                  </div>
                  <h4 className="text-sm font-semibold text-[var(--theme-text-primary)] mb-1">
                    {t('thirdPartySelectConnectionPrompt')}
                  </h4>
                  <p className="text-xs text-[var(--theme-text-secondary)] max-w-sm mb-4">
                    {t('thirdPartySelectConnectionHelp')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(true)}
                    className={SETTINGS_PRIMARY_ACTION_BUTTON_CLASS}
                  >
                    <Plus size={14} />
                    {t('thirdPartyAddConnection')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
