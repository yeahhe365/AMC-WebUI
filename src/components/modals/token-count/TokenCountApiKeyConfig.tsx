import React, { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { KeyRound, Eye, EyeOff, Check, X, ShieldCheck } from 'lucide-react';
import { SETTINGS_PRIMARY_ACTION_BUTTON_CLASS } from '@/constants/buttonClasses';

interface TokenCountApiKeyConfigProps {
  isOpen: boolean;
  apiKey: string;
  onSave: (apiKey: string) => void;
  hasDedicatedKey: boolean;
}

export const TokenCountApiKeyConfig: React.FC<TokenCountApiKeyConfigProps> = ({
  isOpen,
  apiKey,
  onSave,
  hasDedicatedKey,
}) => {
  const { t } = useI18n();
  const [localKey, setLocalKey] = useState(apiKey);
  const [showPassword, setShowPassword] = useState(false);
  const [isSavedRecently, setIsSavedRecently] = useState(false);

  useEffect(() => {
    setLocalKey(apiKey);
  }, [apiKey]);

  if (!isOpen) {
    return null;
  }

  const handleSave = () => {
    onSave(localKey);
    setIsSavedRecently(true);
    setTimeout(() => setIsSavedRecently(false), 2000);
  };

  const handleClear = () => {
    setLocalKey('');
    onSave('');
    setIsSavedRecently(true);
    setTimeout(() => setIsSavedRecently(false), 2000);
  };

  return (
    <div className="p-3.5 rounded-xl bg-[var(--theme-bg-secondary)]/70 border border-[var(--theme-border-secondary)] space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound size={15} className="text-[var(--theme-text-accent)]" />
          <span className="text-xs font-bold uppercase text-[var(--theme-text-primary)] tracking-wider">
            {t('tokenModalApiKeyTitle')}
          </span>
        </div>
        {hasDedicatedKey && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
            <ShieldCheck size={12} />
            {t('tokenModalDedicatedKeyBadge')}
          </span>
        )}
      </div>

      <p className="text-xs text-[var(--theme-text-tertiary)] leading-relaxed">{t('tokenModalApiKeyHint')}</p>

      <div className="flex items-center gap-2">
        <div className="relative flex-grow">
          <input
            type={showPassword ? 'text' : 'password'}
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder={t('tokenModalApiKeyPlaceholder')}
            className="w-full pl-3 pr-9 py-2 bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] rounded-lg text-xs font-mono text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent outline-none transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors p-0.5"
            tabIndex={-1}
            title={showPassword ? 'Hide key' : 'Show key'}
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className={`${SETTINGS_PRIMARY_ACTION_BUTTON_CLASS} py-2 px-3 text-xs h-[34px] flex items-center gap-1.5 flex-shrink-0`}
        >
          {isSavedRecently ? <Check size={14} className="text-white" /> : null}
          <span>{isSavedRecently ? t('tokenModalApiKeySave') : t('tokenModalApiKeySave')}</span>
        </button>

        {localKey && (
          <button
            type="button"
            onClick={handleClear}
            className="py-2 px-2.5 text-xs text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-danger)] hover:bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-secondary)] rounded-lg transition-colors h-[34px] flex items-center gap-1 flex-shrink-0"
            title={t('tokenModalApiKeyClear')}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
