import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { Toggle } from '@/components/shared/Toggle';
import { SETTINGS_PRIMARY_ACTION_BUTTON_CLASS } from '@/constants/buttonClasses';
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
import { getThirdPartyTemplateLogo } from '@/components/shared/ModelIcon';
import { useChatStore } from '@/stores/chatStore';
import { ThirdPartyAddConnectionDialog } from './ThirdPartyAddConnectionDialog';
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
  const connections = settings.thirdPartyApi?.connections ?? [];
  const [expandedConnectionId, setExpandedConnectionId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

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
    setExpandedConnectionId(connection.id);
    setIsAddOpen(false);
  };

  const connectionStatus = (connection: ThirdPartyConnection) => {
    const status = getThirdPartyConnectionStatus(connection);
    if (status === 'disabled') {
      return {
        label: t('thirdPartyConnectionDisabled'),
        className: 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]',
      };
    }
    if (status === 'missing-key') {
      return {
        label: t('thirdPartyApiKeyMissing'),
        className: 'bg-[var(--theme-bg-warning)] text-[var(--theme-text-warning)]',
      };
    }
    if (status === 'missing-url') {
      return {
        label: t('thirdPartyApiUrlMissing'),
        className: 'bg-[var(--theme-bg-warning)] text-[var(--theme-text-warning)]',
      };
    }
    return {
      label: t('thirdPartyApiReady'),
      className: 'bg-[var(--theme-bg-success)] text-[var(--theme-text-success)]',
    };
  };

  return (
    <div className="space-y-3" data-settings-item="api-provider">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--theme-text-primary)]">{t('settingsApiModeThirdParty')}</h3>
          <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5">{t('settingsOpenAICompatibleToggleHelp')}</p>
        </div>
        {connections.length > 0 && (
          <button
            type="button"
            data-testid="third-party-add-connection"
            className={SETTINGS_PRIMARY_ACTION_BUTTON_CLASS}
            onClick={() => setIsAddOpen(true)}
          >
            <Plus size={14} />
            {t('thirdPartyAddConnection')}
          </button>
        )}
      </div>

      <div className="space-y-1.5" data-settings-item="api-third-party">
        <ThirdPartyAddConnectionDialog
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSelectTemplate={handleAddTemplate}
          templates={THIRD_PARTY_TEMPLATE_IDS}
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
          connections.map((connection) => {
            const isExpanded = expandedConnectionId === connection.id;
            const status = connectionStatus(connection);
            const displayTemplateId = getConnectionDisplayTemplateId(connection);

            return (
              <div
                key={connection.id}
                data-testid={`connection-${connection.id}-card`}
                className={`rounded-lg border transition-all ${
                  connection.enabled
                    ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-tertiary)]/30'
                    : 'border-[var(--theme-border-secondary)]/40 bg-[var(--theme-bg-tertiary)]/10'
                }`}
              >
                <div className="flex items-center gap-2 p-2.5">
                  <div className="flex-shrink-0">
                    <Toggle
                      checked={connection.enabled}
                      onChange={() => handleToggleEnabled(connection)}
                      ariaLabel={`${connection.name} ${t('enable')}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedConnectionId(isExpanded ? null : connection.id)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-[var(--theme-text-secondary)]" strokeWidth={2} />
                    ) : (
                      <ChevronRight size={14} className="text-[var(--theme-text-secondary)]" strokeWidth={2} />
                    )}
                    <img
                      src={getThirdPartyTemplateLogo(displayTemplateId)}
                      alt=""
                      width={18}
                      height={18}
                      draggable={false}
                      className="flex-shrink-0 object-contain"
                      style={{ width: 18, height: 18 }}
                    />
                    <span className="text-sm font-medium text-[var(--theme-text-primary)] truncate">
                      {connection.name}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)]">
                      {connection.protocol === 'anthropic'
                        ? t('thirdPartyProtocolAnthropic')
                        : t('thirdPartyProtocolOpenAI')}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${status.className}`}>{status.label}</span>
                  </button>
                </div>

                {isExpanded && (
                  <ThirdPartyConnectionEditor
                    connection={connection}
                    isInUse={isThirdPartyConnectionInUse(
                      connection.id,
                      useChatStore.getState().savedSessions,
                      settings.providerId,
                    )}
                    onChange={(updates) =>
                      updateThirdPartyApi(updateThirdPartyConnection(currentSettings, connection.id, updates))
                    }
                    onRemove={() => {
                      updateThirdPartyApi(removeThirdPartyConnection(currentSettings, connection.id));
                      setExpandedConnectionId((current) => (current === connection.id ? null : current));
                    }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
