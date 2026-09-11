import React, { useState } from 'react';
import { Sliders, X, RotateCcw } from 'lucide-react';
import type { ModelOption } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import {
  SETTINGS_PRIMARY_ACTION_BUTTON_CLASS,
  SETTINGS_SECONDARY_ACTION_BUTTON_CLASS,
} from '@/constants/buttonClasses';

interface ModelParameterModalProps {
  isOpen: boolean;
  model: ModelOption | null;
  onClose: () => void;
  onSave: (parameters: { temperature?: number; maxOutputTokens?: number; topP?: number } | undefined) => void;
}

export const ModelParameterModal: React.FC<ModelParameterModalProps> = ({ isOpen, model, onClose, onSave }) => {
  const { t } = useI18n();

  const [temperature, setTemperature] = useState<number | undefined>(model?.parameters?.temperature);
  const [maxOutputTokens, setMaxOutputTokens] = useState<number | undefined>(model?.parameters?.maxOutputTokens);
  const [topP, setTopP] = useState<number | undefined>(model?.parameters?.topP);

  // Sync state if model changes
  React.useEffect(() => {
    if (model) {
      setTemperature(model.parameters?.temperature);
      setMaxOutputTokens(model.parameters?.maxOutputTokens);
      setTopP(model.parameters?.topP);
    }
  }, [model]);

  if (!isOpen || !model) return null;

  const handleReset = () => {
    setTemperature(undefined);
    setMaxOutputTokens(undefined);
    setTopP(undefined);
  };

  const handleSave = () => {
    const params: { temperature?: number; maxOutputTokens?: number; topP?: number } = {};
    if (typeof temperature === 'number' && !isNaN(temperature)) {
      params.temperature = temperature;
    }
    if (typeof maxOutputTokens === 'number' && !isNaN(maxOutputTokens)) {
      params.maxOutputTokens = maxOutputTokens;
    }
    if (typeof topP === 'number' && !isNaN(topP)) {
      params.topP = topP;
    }
    const result = Object.keys(params).length > 0 ? params : undefined;
    onSave(result);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-150">
      <div
        className="w-full max-w-md rounded-xl border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] p-5 shadow-2xl space-y-5"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[var(--theme-border-secondary)]/40 pb-3">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-[var(--theme-text-secondary)]" />
            <h3 className="text-base font-semibold text-[var(--theme-text-primary)]">{t('settingsModelParameters')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-xs text-[var(--theme-text-secondary)] bg-[var(--theme-bg-secondary)]/60 px-3 py-2 rounded-lg border border-[var(--theme-border-secondary)]/30">
          <span className="font-semibold text-[var(--theme-text-primary)]">{model.name}</span>
          <span className="ml-1.5 font-mono opacity-80">({model.id})</span>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-[var(--theme-text-primary)]">{t('settingsTemperature')}</label>
              <span className="font-mono text-[var(--theme-text-secondary)]">
                {temperature !== undefined ? temperature.toFixed(2) : t('settingsDefault')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={temperature ?? 1}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="flex-1 accent-[var(--theme-border-focus)] cursor-pointer"
              />
              <input
                type="number"
                min="0"
                max="2"
                step="0.05"
                placeholder={t('settingsDefault')}
                value={temperature ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  setTemperature(val);
                }}
                className={`w-20 p-1.5 text-xs font-mono rounded border ${SETTINGS_INPUT_CLASS}`}
              />
            </div>
            <p className="text-[11px] text-[var(--theme-text-secondary)]">{t('settingsTemperatureHelp')}</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-[var(--theme-text-primary)]">{t('settingsMaxOutputTokens')}</label>
              <span className="font-mono text-[var(--theme-text-secondary)]">
                {maxOutputTokens !== undefined ? maxOutputTokens : t('settingsDefault')}
              </span>
            </div>
            <input
              type="number"
              min="1"
              max="131072"
              step="256"
              placeholder={t('settingsMaxOutputTokensPlaceholder')}
              value={maxOutputTokens ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                setMaxOutputTokens(val);
              }}
              className={`w-full p-2 text-xs font-mono rounded-lg border ${SETTINGS_INPUT_CLASS}`}
            />
            <p className="text-[11px] text-[var(--theme-text-secondary)]">{t('settingsMaxOutputTokensHelp')}</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-[var(--theme-text-primary)]">Top-P</label>
              <span className="font-mono text-[var(--theme-text-secondary)]">
                {topP !== undefined ? topP.toFixed(2) : t('settingsDefault')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={topP ?? 0.95}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                className="flex-1 accent-[var(--theme-border-focus)] cursor-pointer"
              />
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                placeholder={t('settingsDefault')}
                value={topP ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  setTopP(val);
                }}
                className={`w-20 p-1.5 text-xs font-mono rounded border ${SETTINGS_INPUT_CLASS}`}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[var(--theme-border-secondary)]/40">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors"
          >
            <RotateCcw size={12} />
            <span>{t('settingsResetToDefaults')}</span>
          </button>
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
