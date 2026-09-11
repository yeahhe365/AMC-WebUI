import React, { useState } from 'react';
import { Settings, X, Plus, Trash2 } from 'lucide-react';
import type { ThirdPartyApiProtocol, ThirdPartyConnection } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import {
  SETTINGS_PRIMARY_ACTION_BUTTON_CLASS,
  SETTINGS_SECONDARY_ACTION_BUTTON_CLASS,
  SMALL_ICON_DANGER_BUTTON_CLASS,
  SETTINGS_INLINE_ACTION_BUTTON_CLASS,
} from '@/constants/buttonClasses';
import { Select } from '@/components/shared/Select';
import { Toggle } from '@/components/shared/Toggle';

interface ProviderEditDialogProps {
  isOpen: boolean;
  connection: ThirdPartyConnection;
  onClose: () => void;
  onSave: (updates: Partial<ThirdPartyConnection>) => void;
  onDelete?: () => void;
}

type HeaderRow = { id: string; name: string; value: string };

export const ProviderEditDialog: React.FC<ProviderEditDialogProps> = ({
  isOpen,
  connection,
  onClose,
  onSave,
  onDelete,
}) => {
  const { t } = useI18n();

  const [name, setName] = useState(connection.name);
  const [protocol, setProtocol] = useState<ThirdPartyApiProtocol>(connection.protocol);
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl ?? '');
  const [authOptional, setAuthOptional] = useState(Boolean(connection.authOptional));
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(() =>
    Object.entries(connection.extraHeaders || {}).map(([k, v]) => ({
      id: `${k}-${v}-${Math.random()}`,
      name: k,
      value: v,
    })),
  );

  React.useEffect(() => {
    setName(connection.name);
    setProtocol(connection.protocol);
    setBaseUrl(connection.baseUrl ?? '');
    setAuthOptional(Boolean(connection.authOptional));
    setHeaderRows(
      Object.entries(connection.extraHeaders || {}).map(([k, v]) => ({
        id: `${k}-${v}-${Math.random()}`,
        name: k,
        value: v,
      })),
    );
  }, [connection]);

  if (!isOpen) return null;

  const handleSave = () => {
    const nextHeaders: Record<string, string> = {};
    for (const row of headerRows) {
      const k = row.name.trim();
      const v = row.value.trim();
      if (k) {
        nextHeaders[k] = v;
      }
    }

    onSave({
      name: name.trim() || connection.name,
      protocol,
      baseUrl: baseUrl.trim() || null,
      authOptional,
      extraHeaders: nextHeaders,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[var(--theme-border-secondary)]/40 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-[var(--theme-text-secondary)]" />
            <h3 className="text-base font-semibold text-[var(--theme-text-primary)]">{t('settingsEditProvider')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
              {t('thirdPartyConnectionName')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full p-2.5 rounded-lg border text-sm ${SETTINGS_INPUT_CLASS}`}
              placeholder="e.g. OpenRouter, Muse, DeepSeek..."
            />
          </div>
          <Select
            id="edit-provider-protocol"
            label={t('thirdPartyConnectionProtocol')}
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as ThirdPartyApiProtocol)}
          >
            <option value="openai-compatible">{t('thirdPartyProtocolOpenAI')}</option>
            <option value="openai-responses">{t('thirdPartyProtocolOpenAIResponses')}</option>
            <option value="anthropic">{t('thirdPartyProtocolAnthropic')}</option>
          </Select>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
              {t('thirdPartyApiBaseUrl')}
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className={`w-full p-2.5 rounded-lg border font-mono text-xs ${SETTINGS_INPUT_CLASS}`}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--theme-border-secondary)]/40 bg-[var(--theme-bg-secondary)]/30">
            <div>
              <div className="text-sm font-medium text-[var(--theme-text-primary)]">{t('thirdPartyAuthOptional')}</div>
              <div className="text-xs text-[var(--theme-text-secondary)] mt-0.5">{t('thirdPartyAuthOptionalHelp')}</div>
            </div>
            <Toggle
              checked={authOptional}
              onChange={() => setAuthOptional(!authOptional)}
              ariaLabel={t('thirdPartyAuthOptional')}
            />
          </div>
          <div className="space-y-2 pt-2 border-t border-[var(--theme-border-secondary)]/30">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
                {t('thirdPartyAdvancedHeaders')}
              </label>
              <button
                type="button"
                className={SETTINGS_INLINE_ACTION_BUTTON_CLASS}
                onClick={() =>
                  setHeaderRows([...headerRows, { id: `header-${Date.now()}-${Math.random()}`, name: '', value: '' }])
                }
              >
                <Plus size={13} />
                <span>{t('thirdPartyAddHeader')}</span>
              </button>
            </div>

            {headerRows.length === 0 ? (
              <p className="text-xs text-[var(--theme-text-secondary)] italic">{t('thirdPartyNoCustomHeaders')}</p>
            ) : (
              <div className="space-y-2">
                {headerRows.map((row, index) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row.name}
                      placeholder={t('thirdPartyHeaderName')}
                      onChange={(e) => {
                        const updated = [...headerRows];
                        updated[index] = { ...updated[index], name: e.target.value };
                        setHeaderRows(updated);
                      }}
                      className={`flex-1 p-2 rounded-lg border text-xs font-mono ${SETTINGS_INPUT_CLASS}`}
                    />
                    <input
                      type="text"
                      value={row.value}
                      placeholder={t('thirdPartyHeaderValue')}
                      onChange={(e) => {
                        const updated = [...headerRows];
                        updated[index] = { ...updated[index], value: e.target.value };
                        setHeaderRows(updated);
                      }}
                      className={`flex-1 p-2 rounded-lg border text-xs font-mono ${SETTINGS_INPUT_CLASS}`}
                    />
                    <button
                      type="button"
                      className={SMALL_ICON_DANGER_BUTTON_CLASS}
                      onClick={() => setHeaderRows(headerRows.filter((_, i) => i !== index))}
                      aria-label={t('thirdPartyRemoveHeader')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--theme-border-secondary)]/40 flex-shrink-0">
          {onDelete ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onDelete();
              }}
              className="flex items-center gap-1.5 text-xs text-[var(--theme-text-danger)] hover:underline cursor-pointer"
            >
              <Trash2 size={13} />
              <span>{t('thirdPartyDeleteProvider')}</span>
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className={SETTINGS_SECONDARY_ACTION_BUTTON_CLASS}>
              {t('cancel')}
            </button>
            <button type="button" onClick={handleSave} className={SETTINGS_PRIMARY_ACTION_BUTTON_CLASS}>
              {t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
