import React, { useMemo, useState } from 'react';
import { ChevronLeft, Download, Upload, Server } from 'lucide-react';
import {
  GEMINI_PROVIDER_ID,
  type AppSettings,
  type ThirdPartyApiSettings,
  type ThirdPartyConnection,
  type ThirdPartyTemplateId,
} from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import {
  createConnectionFromTemplate,
  createConnectionId,
  createDefaultThirdPartyApiSettings,
  addThirdPartyConnection,
  removeThirdPartyConnection,
  updateThirdPartyConnection,
  reorderThirdPartyConnections,
} from '@/utils/thirdPartyApiProviders';
import { probeThirdPartyConnection, formatLatency } from '@/utils/thirdPartyDiagnostics';
import {
  exportProvidersBackupFile,
  parseProvidersBackupText,
  applyImportedProviders,
  type ImportMode,
} from '@/utils/thirdPartyBackup';
import { toastError, toastSuccess, toastWarning } from '@/stores/toastStore';
import { interpolate } from '@/i18n/interpolate';
import { ProviderList } from './ProviderList';
import { ProviderDetail } from './ProviderDetail';
import { ProviderAddModal } from './ProviderAddModal';
import { ApiConfigSection } from '@/components/settings/sections/ApiConfigSection';
import {
  ThirdPartyBackupDialog,
  type ThirdPartyBackupDialogMode,
} from '@/components/settings/sections/api-config/ThirdPartyBackupDialog';

interface ProviderSettingsSectionProps {
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onCloseModal?: () => void;
  initialSelectedId?: string;
}

export const ProviderSettingsSection: React.FC<ProviderSettingsSectionProps> = ({
  settings,
  onUpdateSettings,
  onCloseModal,
  initialSelectedId,
}) => {
  const { t } = useI18n();
  const currentSettings = settings.thirdPartyApi ?? createDefaultThirdPartyApiSettings();
  const connections = useMemo(() => currentSettings.connections ?? [], [currentSettings.connections]);

  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(() => {
    return initialSelectedId || connections[0]?.id || GEMINI_PROVIDER_ID;
  });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [backupDialogMode, setBackupDialogMode] = useState<ThirdPartyBackupDialogMode>('export');
  const [pendingImportedConnections, setPendingImportedConnections] = useState<ThirdPartyConnection[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const geminiStatus = useMemo(() => {
    const hasKey = Boolean(settings.apiKey?.trim() || settings.serverManagedApi);
    return {
      isConfigured: hasKey,
      useProxy: Boolean(settings.useApiProxy && settings.apiProxyUrl),
    };
  }, [settings.apiKey, settings.serverManagedApi, settings.useApiProxy, settings.apiProxyUrl]);

  // Auto-select first connection or Gemini if selectedId becomes invalid
  React.useEffect(() => {
    if (selectedConnectionId === GEMINI_PROVIDER_ID) return;
    if (connections.length > 0) {
      if (!selectedConnectionId || !connections.some((c) => c.id === selectedConnectionId)) {
        setSelectedConnectionId(connections[0].id);
      }
    } else {
      setSelectedConnectionId(GEMINI_PROVIDER_ID);
    }
  }, [connections, selectedConnectionId]);

  const isGeminiSelected = selectedConnectionId === GEMINI_PROVIDER_ID;

  const updateThirdPartyApi = (next: ThirdPartyApiSettings) => {
    onUpdateSettings({ thirdPartyApi: next });
  };

  const selectedConnection = useMemo(
    () => connections.find((c) => c.id === selectedConnectionId) ?? null,
    [connections, selectedConnectionId],
  );

  const handleAddTemplate = (templateId: ThirdPartyTemplateId) => {
    const connection = createConnectionFromTemplate(templateId, connections, createConnectionId());
    updateThirdPartyApi(addThirdPartyConnection(currentSettings, connection));
    setSelectedConnectionId(connection.id);
    setIsAddOpen(false);
    toastSuccess(t('thirdPartyProviderAdded', { name: connection.name }));
  };

  const handleDuplicate = (conn: ThirdPartyConnection) => {
    const duplicated: ThirdPartyConnection = {
      ...conn,
      id: createConnectionId(),
      name: t('thirdPartyCopySuffix', { name: conn.name }),
    };
    updateThirdPartyApi(addThirdPartyConnection(currentSettings, duplicated));
    setSelectedConnectionId(duplicated.id);
    toastSuccess(t('thirdPartyCopyCreated', { name: duplicated.name }));
  };

  const handleDelete = (id: string) => {
    const target = connections.find((c) => c.id === id);
    updateThirdPartyApi(removeThirdPartyConnection(currentSettings, id));
    if (selectedConnectionId === id) {
      const remaining = connections.filter((c) => c.id !== id);
      setSelectedConnectionId(remaining[0]?.id ?? null);
    }
    if (target) {
      toastSuccess(t('thirdPartyProviderRemoved', { name: target.name }));
    }
  };

  const handleReorder = (orderedIds: string[]) => {
    updateThirdPartyApi(reorderThirdPartyConnections(currentSettings, orderedIds));
  };

  const handleProbe = async (conn: ThirdPartyConnection) => {
    try {
      const res = await probeThirdPartyConnection(conn);
      if (res.status === 'success') {
        toastSuccess(t('thirdPartyTestSuccess', { name: conn.name, latency: formatLatency(res.latencyMs) }));
      } else {
        toastError(t('thirdPartyTestFailed', { name: conn.name, error: res.errorMessage || '' }));
      }
    } catch (probeError: any) {
      toastError(`${conn.name}: ${probeError.message}`);
    }
  };

  // Export / Import
  const handleExportClick = () => {
    if (connections.length === 0) {
      toastWarning(t('thirdPartyExportEmpty'));
      return;
    }
    setBackupDialogMode('export');
    setIsBackupOpen(true);
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
        if (next.length > 0) setSelectedConnectionId(next[0].id);
      } else {
        setPendingImportedConnections(parsed.connections);
        setBackupDialogMode('import-confirm');
        setIsBackupOpen(true);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = (mode: ImportMode) => {
    const next = applyImportedProviders(connections, pendingImportedConnections, mode);
    updateThirdPartyApi({ ...currentSettings, connections: next });
    toastSuccess(interpolate(t('thirdPartyImportSuccess'), { count: pendingImportedConnections.length }));
  };

  return (
    <div
      data-settings-item="providers-root"
      className="flex flex-col h-full w-full bg-[var(--theme-bg-primary)] overflow-hidden"
    >
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
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--theme-border-secondary)]/30 bg-[var(--theme-bg-secondary)]/40 text-xs flex-shrink-0">
        <div className="flex items-center gap-2">
          <Server size={14} className="text-[var(--theme-text-secondary)]" />
          <span className="font-semibold text-[var(--theme-text-primary)]">{t('thirdPartyManagementTitle')}</span>
          <span className="text-[var(--theme-text-secondary)]">({connections.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
            title={t('thirdPartyImportConfig')}
          >
            <Upload size={13} />
            <span>{t('import')}</span>
          </button>
          <button
            type="button"
            onClick={handleExportClick}
            disabled={connections.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors disabled:opacity-40"
            title={t('thirdPartyExportConfig')}
          >
            <Download size={13} />
            <span>{t('export')}</span>
          </button>
        </div>
      </div>
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        <div
          className={`w-full md:w-64 lg:w-72 h-full flex-shrink-0 ${
            selectedConnection || isGeminiSelected ? 'hidden md:flex' : 'flex'
          }`}
        >
          <ProviderList
            connections={connections}
            selectedConnectionId={selectedConnectionId}
            onSelectConnection={setSelectedConnectionId}
            onReorder={handleReorder}
            onAddConnection={() => setIsAddOpen(true)}
            onEditConnection={() => {}}
            onDuplicateConnection={handleDuplicate}
            onDeleteConnection={handleDelete}
            onProbeConnection={handleProbe}
            geminiStatus={geminiStatus}
          />
        </div>
        <div
          className={`flex-1 min-w-0 h-full flex flex-col ${
            selectedConnection || isGeminiSelected ? 'flex' : 'hidden md:flex'
          }`}
        >
          {isGeminiSelected ? (
            <div className="flex-1 flex flex-col h-full min-h-0">
              <div className="md:hidden p-2 border-b border-[var(--theme-border-secondary)]/30 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedConnectionId(null)}
                  className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
                >
                  <ChevronLeft size={14} />
                  <span>{t('thirdPartyBackToList')}</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 max-w-3xl w-full mx-auto">
                <ApiConfigSection
                  useCustomApiConfig={settings.useCustomApiConfig}
                  setUseCustomApiConfig={(val) => onUpdateSettings({ useCustomApiConfig: val })}
                  apiKey={settings.apiKey}
                  setApiKey={(val) => onUpdateSettings({ apiKey: val })}
                  apiProxyUrl={settings.apiProxyUrl}
                  setApiProxyUrl={(val) => onUpdateSettings({ apiProxyUrl: val })}
                  useApiProxy={settings.useApiProxy ?? false}
                  setUseApiProxy={(val) => onUpdateSettings({ useApiProxy: val })}
                  serverManagedApi={settings.serverManagedApi ?? false}
                  settings={settings}
                  onUpdate={(key, val) => onUpdateSettings({ [key]: val } as any)}
                  hideProviderRedirect={true}
                />
              </div>
            </div>
          ) : selectedConnection ? (
            <div className="flex-1 flex flex-col h-full min-h-0">
              <div className="md:hidden p-2 border-b border-[var(--theme-border-secondary)]/30 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedConnectionId(null)}
                  className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
                >
                  <ChevronLeft size={14} />
                  <span>{t('thirdPartyBackToList')}</span>
                </button>
              </div>

              <ProviderDetail
                key={selectedConnection.id}
                connection={selectedConnection}
                onUpdateConnection={(updates) =>
                  updateThirdPartyApi(updateThirdPartyConnection(currentSettings, selectedConnection.id, updates))
                }
                onDeleteConnection={() => handleDelete(selectedConnection.id)}
                onCloseModal={onCloseModal}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-[var(--theme-text-secondary)]">
              <p>{t('thirdPartySelectConnectionHelp')}</p>
            </div>
          )}
        </div>
      </div>
      <ProviderAddModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSelectTemplate={handleAddTemplate} />
      <ThirdPartyBackupDialog
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        dialogMode={backupDialogMode}
        connectionsCount={connections.length}
        importedConnections={pendingImportedConnections}
        onConfirmExport={(includeApiKeys) => exportProvidersBackupFile(connections, { includeApiKeys })}
        onConfirmImport={handleConfirmImport}
      />
    </div>
  );
};
