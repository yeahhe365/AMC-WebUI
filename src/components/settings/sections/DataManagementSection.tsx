import React, { useRef, type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Settings, MessageSquare, AlertTriangle, Upload, Download, Trash2, Database, RefreshCw } from 'lucide-react';
import { IconScenarios } from '@/components/icons';
import type { LogViewerProps } from '@/components/log-viewer/LogViewer';
import type { PwaInstallState } from '@/pwa/install';
import { useAppDataSize } from '@/hooks/data-management/useAppDataSize';
import { Toggle } from '@/components/shared/Toggle';
import type { AppSettings } from '@/types';
import {
  SETTINGS_DANGER_OUTLINE_BUTTON_CLASS,
  SETTINGS_DANGER_SOLID_BUTTON_CLASS,
  SETTINGS_OUTLINE_BUTTON_CLASS,
} from '@/constants/buttonClasses';
import { SETTINGS_SECTION_CARD_CLASS, SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';

interface DataManagementSectionProps {
  onClearHistory: () => void;
  onClearCache: () => void;
  onOpenLogViewer: (state?: Pick<LogViewerProps, 'initialTab' | 'initialUsageTab'>) => void;
  onClearLogs: () => void;
  installState: PwaInstallState;
  onInstallPwa: () => void;
  onImportSettings: (file: File) => void;
  onExportSettings: () => void;
  onImportHistory: (file: File) => void;
  onExportHistory: () => void;
  onImportScenarios: (file: File) => void;
  onExportScenarios: () => void;
  onReset: () => void;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const ActionRow: React.FC<{
  label: string;
  children: React.ReactNode;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ label, children, description, icon, className }) => (
  <div className={`flex items-center justify-between gap-3 py-3 ${className || ''}`}>
    <div className="flex min-w-0 items-center gap-3">
      {icon && <div className="flex-shrink-0 text-[var(--theme-text-secondary)]">{icon}</div>}
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-[var(--theme-text-primary)]">{label}</span>
        {description && <p className="text-xs mt-0.5 text-[var(--theme-text-secondary)]">{description}</p>}
      </div>
    </div>
    <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">{children}</div>
  </div>
);

const DataCard: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  icon,
  children,
  className,
}) => (
  <div className={`${SETTINGS_SECTION_CARD_CLASS} ${className || ''}`}>
    <h4 className={`${SETTINGS_SECTION_LABEL_CLASS} mb-1 flex items-center gap-2`}>
      {icon}
      {title}
    </h4>
    <div className="divide-y divide-[var(--theme-border-secondary)]/40">{children}</div>
  </div>
);

export const DataManagementSection: React.FC<DataManagementSectionProps> = ({
  onClearHistory,
  onClearCache,
  onOpenLogViewer,
  onClearLogs,
  installState,
  onInstallPwa,
  onImportSettings,
  onExportSettings,
  onImportHistory,
  onExportHistory,
  onImportScenarios,
  onExportScenarios,
  onReset,
  settings,
  onUpdate,
}) => {
  const { t } = useI18n();
  const settingsImportRef = useRef<HTMLInputElement>(null);
  const historyImportRef = useRef<HTMLInputElement>(null);
  const scenariosImportRef = useRef<HTMLInputElement>(null);
  const {
    formattedTotalSize,
    hasError: hasAppDataSizeError,
    isLoading: isAppDataSizeLoading,
    refresh: refreshAppDataSize,
  } = useAppDataSize();

  const isInstallDisabled = installState === 'installed';
  const installDescription =
    installState === 'installed'
      ? t('settingsInstallAppUnavailableTitle')
      : installState === 'manual'
        ? t('settingsInstallAppManualTitle')
        : undefined;
  const localAppDataDescription = isAppDataSizeLoading
    ? t('settingsLocalAppDataLoading')
    : hasAppDataSizeError
      ? t('settingsLocalAppDataError')
      : formattedTotalSize;
  const importExportRows = [
    {
      key: 'settings',
      label: t('settingsDataSettings'),
      icon: <Settings size={16} strokeWidth={1.5} />,
      importRef: settingsImportRef,
      onImport: onImportSettings,
      onExport: onExportSettings,
    },
    {
      key: 'history',
      label: t('settingsDataHistory'),
      icon: <MessageSquare size={16} strokeWidth={1.5} />,
      importRef: historyImportRef,
      onImport: onImportHistory,
      onExport: onExportHistory,
    },
    {
      key: 'scenarios',
      label: t('settingsDataScenarios'),
      icon: <IconScenarios size={16} strokeWidth={1.5} />,
      importRef: scenariosImportRef,
      onImport: onImportScenarios,
      onExport: onExportScenarios,
    },
  ];

  return (
    <div className="space-y-4">
      <div data-settings-item="data-import-export">
        <DataCard title={t('settingsDataImportsExports')} icon={<Database size={14} strokeWidth={1.5} />}>
          {importExportRows.map(({ key, label, icon, importRef, onImport, onExport }) => (
            <div key={key} data-settings-item={`data-${key}`}>
              <ActionRow label={label} icon={icon}>
                <button type="button" onClick={onExport} className={SETTINGS_OUTLINE_BUTTON_CLASS}>
                  <Download size={12} strokeWidth={1.5} /> {t('export')}
                </button>
                <button
                  type="button"
                  onClick={() => importRef.current?.click()}
                  className={SETTINGS_OUTLINE_BUTTON_CLASS}
                >
                  <Upload size={12} strokeWidth={1.5} /> {t('import')}
                </button>
                <input
                  type="file"
                  ref={importRef}
                  onChange={() => handleFileImport(importRef, onImport)}
                  accept=".json"
                  className="hidden"
                />
              </ActionRow>
            </div>
          ))}
        </DataCard>
      </div>

      <div data-settings-item="data-system-tools">
        <DataCard title={t('settingsSystemTools')} icon={<Settings size={14} strokeWidth={1.5} />}>
          <ActionRow label={t('settingsLocalAppData')} description={localAppDataDescription}>
            <button
              type="button"
              onClick={() => void refreshAppDataSize()}
              disabled={isAppDataSizeLoading}
              className={SETTINGS_OUTLINE_BUTTON_CLASS}
            >
              <RefreshCw size={12} strokeWidth={1.5} /> {t('refresh')}
            </button>
          </ActionRow>
          <div data-settings-item="data-enable-logging">
            <ActionRow label={t('settingsEnableLogging')} description={t('settingsEnableLoggingDescription')}>
              <Toggle
                checked={settings.isLoggingEnabled ?? false}
                onChange={(enabled) => onUpdate('isLoggingEnabled', enabled)}
                ariaLabel={t('settingsEnableLogging')}
              />
            </ActionRow>
          </div>
          <div data-settings-item="data-logs">
            <ActionRow label={t('settingsViewLogsAndUsage')}>
              <button
                type="button"
                onClick={() => onOpenLogViewer({ initialTab: 'usage', initialUsageTab: 'overview' })}
                className={SETTINGS_OUTLINE_BUTTON_CLASS}
              >
                {t('settingsViewLogs')}
              </button>
              <button type="button" onClick={onClearLogs} className={SETTINGS_DANGER_OUTLINE_BUTTON_CLASS}>
                <Trash2 size={12} strokeWidth={1.5} /> {t('settingsClearLogs')}
              </button>
            </ActionRow>
          </div>
          <div data-settings-item="data-install-app">
            <ActionRow label={t('settingsInstallApp')} description={installDescription}>
              <button
                type="button"
                onClick={onInstallPwa}
                disabled={isInstallDisabled}
                aria-label={t('settingsInstallAppAria')}
                className={SETTINGS_OUTLINE_BUTTON_CLASS}
              >
                {t('settingsInstallApp')}
              </button>
            </ActionRow>
          </div>
        </DataCard>
      </div>

      {/* Danger severity escalates by consequence: reset < delete chats < wipe all data. */}
      <div
        className={`${SETTINGS_SECTION_CARD_CLASS} border-[var(--theme-text-danger)]/30`}
        data-settings-item="data-danger"
      >
        <h4 className={`${SETTINGS_SECTION_LABEL_CLASS} mb-1 flex items-center gap-2 text-[var(--theme-text-danger)]`}>
          <AlertTriangle size={14} strokeWidth={1.75} />
          {t('settingsDangerZone')}
        </h4>

        <div className="divide-y divide-[var(--theme-border-secondary)]/40">
          <div data-settings-item="data-reset">
            <ActionRow label={t('settingsReset')}>
              <button type="button" onClick={onReset} className={SETTINGS_OUTLINE_BUTTON_CLASS}>
                <RefreshCw size={12} strokeWidth={1.5} /> {t('settingsReset')}
              </button>
            </ActionRow>
          </div>

          <div data-settings-item="data-clear-history">
            <ActionRow label={t('settingsClearHistory')}>
              <button type="button" onClick={onClearHistory} className={SETTINGS_DANGER_OUTLINE_BUTTON_CLASS}>
                <Trash2 size={12} strokeWidth={1.5} /> {t('settingsClearHistory')}
              </button>
            </ActionRow>
          </div>

          <div data-settings-item="data-clear-cache">
            <ActionRow label={t('settingsClearCache')}>
              <button type="button" onClick={onClearCache} className={SETTINGS_DANGER_SOLID_BUTTON_CLASS}>
                <Database size={12} strokeWidth={1.5} /> {t('settingsClearCache')}
              </button>
            </ActionRow>
          </div>
        </div>
      </div>
    </div>
  );

  function handleFileImport(ref: RefObject<HTMLInputElement>, handler: (file: File) => void) {
    const file = ref.current?.files?.[0];
    if (file) handler(file);
    if (ref.current) ref.current.value = '';
  }
};
